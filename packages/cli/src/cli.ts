#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import * as os from 'os';
import { FileSystemSkillLoader, SkillRegistry, SkillValidator, HookManager, loadConfig, parseManifest } from '@skillforge/core';
import type { Skill, ValidationResult } from '@skillforge/core';

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function resolveSkillsPath(cliOption: string | undefined): Promise<string> {
  if (cliOption) return cliOption;
  const env = process.env['SKILLFORGE_SKILLS_PATH'];
  if (env) return env;
  const config = await loadConfig(process.cwd());
  return config.skillsPath;
}

async function resolveNewDefaults(opts: { author?: string; license?: string }) {
  if (opts.author && opts.license) return opts;
  const config = await loadConfig(process.cwd());
  return {
    author: opts.author ?? config.defaultAuthor,
    license: opts.license ?? config.defaultLicense,
  };
}

async function loadRegistry(skillsPath: string): Promise<{ registry: SkillRegistry; skills: Skill[] }> {
  const loader = new FileSystemSkillLoader();
  const registry = new SkillRegistry();
  const absPath = path.resolve(skillsPath);
  const skills = await loader.loadAll(absPath);
  for (const skill of skills) {
    registry.register(skill);
  }
  return { registry, skills };
}

function createTgz(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dirName = path.basename(sourceDir);
    const parentDir = path.dirname(sourceDir);
    const tar = spawn('tar', ['-czf', outputPath, '-C', parentDir, dirName]);
    tar.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
    tar.on('error', reject);
  });
}

function createZip(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dirName = path.basename(sourceDir);
    const parentDir = path.dirname(sourceDir);
    const zip = spawn('zip', ['-r', outputPath, dirName], { cwd: parentDir });
    zip.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`zip exited with code ${code}`));
    });
    zip.on('error', reject);
  });
}

// ─── Program ─────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('skillforge')
  .description('Developer CLI for SkillForge skills')
  .version('0.1.0');

// ─── list ────────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('List all skills')
  .option('--skills-path <path>', 'Path to skills directory (default: from config file or ./skills)')
  .option('--json', 'Output as JSON')
  .option('--category <category>', 'Filter by category: workflow|tool_guide|domain|integration|guardrail')
  .action(async (opts: { skillsPath?: string; json?: boolean; category?: string }) => {
    const skillsPath = await resolveSkillsPath(opts.skillsPath);
    let skills: Skill[];
    try {
      ({ skills } = await loadRegistry(skillsPath));
    } catch (err) {
      console.error(red(`Error loading skills from "${skillsPath}": ${(err as Error).message}`));
      process.exit(1);
    }

    if (opts.category) {
      skills = skills.filter(s => s.manifest.category === opts.category);
    }

    if (opts.json) {
      console.log(JSON.stringify(skills.map(s => ({
        id: s.manifest.id,
        name: s.manifest.name,
        category: s.manifest.category,
        tags: s.manifest.tags,
        description: s.manifest.description,
      })), null, 2));
      return;
    }

    if (skills.length === 0) {
      console.log(dim(`No skills found in "${skillsPath}"`));
      return;
    }

    for (const skill of skills) {
      const { id, name, category, tags, description } = skill.manifest;
      console.log(`${bold('\u250c\u2500')} ${bold(id)} ${dim(`[${category}]`)}`);
      console.log(`${dim('\u2502')}  ${name !== id ? name + ' \u2014 ' : ''}${description}`);
      if (tags.length > 0) {
        console.log(`${dim('\u2502')}  ${dim('Tags:')} ${tags.join(', ')}`);
      }
      console.log(dim('\u2502'));
    }
  });

// ─── info ────────────────────────────────────────────────────────────────────

program
  .command('info <id>')
  .description('Show full details for a skill by ID')
  .option('--skills-path <path>', 'Path to skills directory (default: from config file or ./skills)')
  .action(async (id: string, opts: { skillsPath?: string }) => {
    const skillsPath = await resolveSkillsPath(opts.skillsPath);
    let registry: SkillRegistry;
    try {
      ({ registry } = await loadRegistry(skillsPath));
    } catch (err) {
      console.error(red(`Error loading skills from "${skillsPath}": ${(err as Error).message}`));
      process.exit(1);
    }

    const skill = registry.get(id);
    if (!skill) {
      console.error(red(`Skill "${id}" not found`));
      process.exit(1);
    }

    const m = skill.manifest;
    console.log();
    console.log(`${bold(m.name)}  ${dim(`v${m.version}`)}`);
    console.log(`${dim('ID:')}          ${m.id}`);
    console.log(`${dim('Category:')}    ${m.category}`);
    console.log(`${dim('Tags:')}        ${m.tags.join(', ')}`);
    if (m.author)   console.log(`${dim('Author:')}      ${m.author}`);
    if (m.license)  console.log(`${dim('License:')}     ${m.license}`);
    if (m.homepage) console.log(`${dim('Homepage:')}    ${m.homepage}`);
    console.log();
    console.log(m.description);

    if (m.environment && m.environment.length > 0) {
      console.log();
      console.log(bold('Environment requirements:'));
      for (const req of m.environment) {
        const marker = req.required ? red('*') : dim('o');
        console.log(`  ${marker} ${req.name} — ${req.description}`);
        if (req.envVars) console.log(`    env: ${req.envVars.join(', ')}`);
        if (req.tools)   console.log(`    tools: ${req.tools.join(', ')}`);
      }
    }

    if (m.integrations && m.integrations.length > 0) {
      console.log();
      console.log(bold('Integrations:'));
      for (const int of m.integrations) {
        const marker = int.required ? red('*') : dim('o');
        console.log(`  ${marker} ${int.name} (${int.type}) — ${int.description}`);
      }
    }

    if (m.hooks && m.hooks.length > 0) {
      console.log();
      console.log(bold('Hooks:'));
      for (const hook of m.hooks) {
        console.log(`  ${hook.event}${hook.matcher ? ` [${hook.matcher}]` : ''} — ${hook.description}`);
      }
    }

    // Instructions preview (first 20 non-empty lines)
    const lines = skill.instructions.split('\n').filter(l => l.trim().length > 0).slice(0, 20);
    console.log();
    console.log(bold('Instructions preview:'));
    console.log(dim('─'.repeat(60)));
    for (const line of lines) {
      console.log(dim(line));
    }
    if (skill.instructions.split('\n').length > 20) {
      console.log(dim('  ... (truncated)'));
    }
    console.log();
  });

// ─── search ──────────────────────────────────────────────────────────────────

program
  .command('search <query>')
  .description('Search skills by query')
  .option('--skills-path <path>', 'Path to skills directory (default: from config file or ./skills)')
  .option('--json', 'Output as JSON')
  .option('--category <category>', 'Filter by category: workflow|tool_guide|domain|integration|guardrail')
  .action(async (query: string, opts: { skillsPath?: string; json?: boolean; category?: string }) => {
    const skillsPath = await resolveSkillsPath(opts.skillsPath);
    let registry: SkillRegistry;
    try {
      ({ registry } = await loadRegistry(skillsPath));
    } catch (err) {
      console.error(red(`Error loading skills from "${skillsPath}": ${(err as Error).message}`));
      process.exit(1);
    }

    let results = registry.search(query);

    if (opts.category) {
      results = results.filter(s => s.manifest.category === opts.category);
    }

    if (opts.json) {
      console.log(JSON.stringify(results.map(s => ({
        id: s.manifest.id,
        name: s.manifest.name,
        category: s.manifest.category,
        tags: s.manifest.tags,
        description: s.manifest.description,
      })), null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(dim(`No skills matched "${query}"`));
      return;
    }

    console.log(`${results.length} result${results.length !== 1 ? 's' : ''} for "${bold(query)}":\n`);
    for (const skill of results) {
      const { id, category, tags, description } = skill.manifest;
      console.log(`${bold('\u250c\u2500')} ${bold(id)} ${dim(`[${category}]`)}`);
      console.log(`${dim('\u2502')}  ${description}`);
      if (tags.length > 0) {
        console.log(`${dim('\u2502')}  ${dim('Tags:')} ${tags.join(', ')}`);
      }
      console.log(dim('\u2502'));
    }
  });

// ─── validate ────────────────────────────────────────────────────────────────

program
  .command('validate [id]')
  .description('Validate one skill by ID, or all skills if no ID given')
  .option('--skills-path <path>', 'Path to skills directory (default: from config file or ./skills)')
  .action(async (id: string | undefined, opts: { skillsPath?: string }) => {
    const skillsPath = await resolveSkillsPath(opts.skillsPath);
    let skills: Skill[];
    let registry: SkillRegistry;
    try {
      ({ skills, registry } = await loadRegistry(skillsPath));
    } catch (err) {
      console.error(red(`Error loading skills from "${skillsPath}": ${(err as Error).message}`));
      process.exit(1);
    }

    const validator = new SkillValidator();
    let hasErrors = false;

    const toValidate: Skill[] = id
      ? (() => {
          const found = registry.get(id);
          if (!found) {
            console.error(red(`Skill "${id}" not found`));
            process.exit(1);
          }
          return [found];
        })()
      : skills;

    if (toValidate.length === 0) {
      console.log(dim(`No skills found in "${skillsPath}"`));
      return;
    }

    for (const skill of toValidate) {
      const result: ValidationResult = validator.validate(skill);
      if (result.valid) {
        console.log(`${green('\u2713')} ${bold(skill.manifest.id)} ${dim('\u2014 valid')}`);
      } else {
        hasErrors = true;
        console.log(`${red('\u2717')} ${bold(skill.manifest.id)} ${dim('\u2014')} ${red(`${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}`)}`);
      }
      for (const warn of result.warnings) {
        console.log(`  ${yellow('\u26a0')} ${warn.message}`);
      }
      for (const err of result.errors) {
        console.log(`  ${red('\u2717')} ${dim(`[${err.field}]`)} ${err.message}`);
      }
    }

    if (hasErrors) {
      process.exit(1);
    }
  });

// ─── stats ───────────────────────────────────────────────────────────────────

program
  .command('stats')
  .description('Show registry statistics')
  .option('--skills-path <path>', 'Path to skills directory')
  .action(async (opts: { skillsPath?: string }) => {
    const skillsPath = await resolveSkillsPath(opts.skillsPath);
    let registry: SkillRegistry;
    try {
      ({ registry } = await loadRegistry(skillsPath));
    } catch (err) {
      console.error(red(`Error loading skills from "${skillsPath}": ${(err as Error).message}`));
      process.exit(1);
    }

    const s = registry.stats();

    console.log(`${bold('Skills:')} ${s.total} total`);

    console.log();
    console.log(bold('By category:'));
    const categoryEntries = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of categoryEntries) {
      console.log(`  ${cat.padEnd(16)}${count}`);
    }

    if (s.tags.length > 0) {
      console.log();
      console.log(`${bold(`Tags (${s.tags.length}):`)} `);
      console.log(`  ${s.tags.slice().sort().join(', ')}`);
    }
  });

// ─── new ─────────────────────────────────────────────────────────────────────

program
  .command('new <id>')
  .description('Scaffold a new skill')
  .option('--name <name>', 'Skill display name (defaults to title-cased id)')
  .option('--category <category>', 'Skill category: workflow|tool_guide|domain|integration|guardrail', 'workflow')
  .option('--description <desc>', 'One-line description')
  .option('--author <author>', 'Author name')
  .option('--output-dir <dir>', 'Where to create the skill directory', './skills')
  .action(async (id: string, opts: { name?: string; category?: string; description?: string; author?: string; outputDir?: string }) => {
    // Validate id
    if (!/^[a-z0-9-]+$/.test(id)) {
      console.error(red(`\u2717 Invalid skill ID "${id}" \u2014 must be lowercase kebab-case (e.g. "my-skill")`));
      process.exit(1);
    }

    const outputDir = opts.outputDir ?? './skills';
    const skillDir = path.resolve(outputDir, id);

    // Check target directory doesn't already exist
    try {
      await fs.access(skillDir);
      console.error(red(`\u2717 Skill directory already exists: ${path.join(outputDir, id)}`));
      process.exit(1);
    } catch {
      // Directory doesn't exist — good
    }

    const titleCase = (s: string) => s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    const name = opts.name ?? titleCase(id);
    const category = opts.category ?? 'workflow';
    const description = opts.description ?? '';
    const { author, license } = await resolveNewDefaults({ author: opts.author });

    const manifest = {
      id,
      name,
      version: '1.0.0',
      description,
      category,
      tags: [] as string[],
      author: author ?? '',
      license: license ?? 'MIT',
      execution: {
        preferredModel: 'claude-sonnet-4-6',
        requiresUserConfirmation: false,
        idempotent: true,
        destructive: false,
      },
      guardrails: [] as string[],
      createdAt: new Date().toISOString(),
    };

    const skillMd = `# ${name}

## When to Use This Skill

<!-- Describe when an agent should activate this skill -->

## Process

<!-- Step-by-step workflow -->

1.
2.
3.

## Output Format

<!-- What the agent should produce -->

## Guardrails

<!-- What the agent must never do -->
`;

    await fs.mkdir(skillDir, { recursive: false });
    await fs.writeFile(path.join(skillDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd);

    const displayDir = path.join(outputDir, id);
    console.log(`${green('\u2713')} Created skill: ${bold(id)}`);
    console.log(`  ${dim(path.join(displayDir, 'manifest.json'))}`);
    console.log(`  ${dim(path.join(displayDir, 'SKILL.md'))}`);
    console.log();
    console.log('Next steps:');
    console.log(`  1. Edit SKILL.md with your workflow instructions`);
    console.log(`  2. Update manifest.json tags and description`);
    console.log(`  3. Run: ${dim(`skillforge validate ${id} --skills-path ${outputDir}`)}`);
  });

// ─── export ──────────────────────────────────────────────────────────────────

program
  .command('export <id>')
  .description('Package a skill as a distributable archive')
  .option('--skills-path <path>', 'Path to skills directory (default: from config or ./skills)')
  .option('--output <dir>', 'Output directory for the archive (default: current directory)')
  .option('--format <format>', 'Archive format: tgz|zip (default: tgz)', 'tgz')
  .action(async (id: string, opts: { skillsPath?: string; output?: string; format?: string }) => {
    const skillsPath = await resolveSkillsPath(opts.skillsPath);
    let registry: SkillRegistry;
    try {
      ({ registry } = await loadRegistry(skillsPath));
    } catch (err) {
      console.error(red(`Error loading skills from "${skillsPath}": ${(err as Error).message}`));
      process.exit(1);
    }

    const skill = registry.get(id);
    if (!skill) {
      console.error(red(`\u2717 Skill "${id}" not found`));
      process.exit(1);
    }

    const format = opts.format ?? 'tgz';
    if (format !== 'tgz' && format !== 'zip') {
      console.error(red(`\u2717 Invalid format "${format}" — must be tgz or zip`));
      process.exit(1);
    }

    const version = skill.manifest.version;
    const archiveName = `${id}-${version}.${format}`;
    const outputDir = path.resolve(opts.output ?? '.');
    const outputPath = path.join(outputDir, archiveName);

    // Resolve skill source directory
    const absSkillsPath = path.resolve(skillsPath);
    const skillDir = path.join(absSkillsPath, id);

    try {
      await fs.access(skillDir);
    } catch {
      console.error(red(`\u2717 Skill directory not found: ${skillDir}`));
      process.exit(1);
    }

    try {
      if (format === 'tgz') {
        await createTgz(skillDir, outputPath);
      } else {
        await createZip(skillDir, outputPath);
      }
    } catch (err) {
      console.error(red(`\u2717 Failed to create archive: ${(err as Error).message}`));
      process.exit(1);
    }

    // Get file size for display
    let sizeStr = '';
    try {
      const stat = await fs.stat(outputPath);
      const kb = (stat.size / 1024).toFixed(1);
      sizeStr = ` (${kb} KB)`;
    } catch {
      // non-fatal
    }

    const displayPath = path.relative(process.cwd(), outputPath);
    console.log(`${green('\u2713')} Exported ${bold(id)} v${version}`);
    console.log(`  ${dim('\u2192')} ./${displayPath}${sizeStr}`);
  });

// ─── import ──────────────────────────────────────────────────────────────────

program
  .command('import <archive>')
  .description('Import a skill from a .tgz or .zip archive')
  .option('--skills-path <path>', 'Destination skills directory (default: from config or ./skills)')
  .option('--force', 'Overwrite if skill already exists')
  .action(async (archive: string, opts: { skillsPath?: string; force?: boolean }) => {
    const archivePath = path.resolve(archive);

    // Detect format
    const isTgz = archivePath.endsWith('.tgz') || archivePath.endsWith('.tar.gz');
    const isZip = archivePath.endsWith('.zip');
    if (!isTgz && !isZip) {
      console.error(red('\u2717 Archive must be a .tgz or .zip file'));
      process.exit(1);
    }

    // Verify archive exists
    try {
      await fs.access(archivePath);
    } catch {
      console.error(red(`\u2717 Archive not found: ${archivePath}`));
      process.exit(1);
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillforge-import-'));
    try {
      // Extract archive
      await new Promise<void>((resolve, reject) => {
        const args = isTgz
          ? ['-xzf', archivePath, '-C', tmpDir]
          : [archivePath, '-d', tmpDir];
        const cmd = isTgz ? 'tar' : 'unzip';
        const proc = spawn(cmd, args);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`${cmd} exited with code ${code}`));
        });
        proc.on('error', reject);
      });

      // Find the directory containing manifest.json
      async function findManifestDir(dir: string): Promise<string | null> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() && entry.name === 'manifest.json') {
            return dir;
          }
        }
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const found = await findManifestDir(path.join(dir, entry.name));
            if (found) return found;
          }
        }
        return null;
      }

      const srcSkillDir = await findManifestDir(tmpDir);
      if (!srcSkillDir) {
        console.error(red('\u2717 No manifest.json found in archive'));
        process.exit(1);
      }

      // Parse and validate manifest
      let manifest: ReturnType<typeof parseManifest>;
      try {
        const raw = JSON.parse(await fs.readFile(path.join(srcSkillDir, 'manifest.json'), 'utf8'));
        manifest = parseManifest(raw);
      } catch (err) {
        console.error(red(`\u2717 Invalid manifest: ${(err as Error).message}`));
        process.exit(1);
      }

      const skillsPath = await resolveSkillsPath(opts.skillsPath);
      const destSkillDir = path.resolve(skillsPath, manifest.id);

      // Check for existing skill
      let exists = false;
      try {
        await fs.access(destSkillDir);
        exists = true;
      } catch {
        // does not exist
      }

      if (exists && !opts.force) {
        console.error(red(`\u2717 Skill "${manifest.id}" already exists at ${destSkillDir}`));
        console.error(dim('  Use --force to overwrite'));
        process.exit(1);
      }

      // Copy skill directory into skills path
      await fs.mkdir(path.resolve(skillsPath), { recursive: true });
      await fs.cp(srcSkillDir, destSkillDir, { recursive: true });

      console.log(`${green('\u2713')} Imported ${bold(manifest.id)} v${manifest.version}`);
      console.log(`  ${dim('\u2192')} ${destSkillDir}`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

// ─── hooks ───────────────────────────────────────────────────────────────────

program
  .command('hooks')
  .description('Preview the hooks config that would be installed from all loaded skills')
  .option('--skills-path <path>', 'Path to skills directory')
  .action(async (opts: { skillsPath?: string }) => {
    const skillsPath = await resolveSkillsPath(opts.skillsPath);
    let skills: Skill[];
    try {
      ({ skills } = await loadRegistry(skillsPath));
    } catch (err) {
      console.error(red(`Error loading skills from "${skillsPath}": ${(err as Error).message}`));
      process.exit(1);
    }

    const config = HookManager.preview(skills);

    if (Object.keys(config).length === 0) {
      console.log(dim('No hooks declared by any loaded skill.'));
      return;
    }

    console.log(JSON.stringify(config, null, 2));
  });

// ─── install-hooks ───────────────────────────────────────────────────────────

program
  .command('install-hooks')
  .description('Installs Claude Code hooks from loaded skill manifests into ~/.claude/settings.json')
  .option('--skills-path <path>', 'Path to skills directory (default: ./skills or SKILLFORGE_SKILLS_PATH)')
  .option('--settings-path <path>', 'Path to Claude settings.json (default: ~/.claude/settings.json)')
  .option('--dry-run', 'Preview what would be installed without writing')
  .action(async (opts: { skillsPath?: string; settingsPath?: string; dryRun?: boolean }) => {
    const skillsPath = await resolveSkillsPath(opts.skillsPath);
    let skills: Skill[];
    try {
      ({ skills } = await loadRegistry(skillsPath));
    } catch (err) {
      console.error(red(`Error loading skills from "${skillsPath}": ${(err as Error).message}`));
      process.exit(1);
    }

    // Filter to skills that have hooks
    const skillsWithHooks = skills.filter(s => s.manifest.hooks && s.manifest.hooks.length > 0);

    if (skillsWithHooks.length === 0) {
      console.log(dim('No skills have hook bindings. Nothing to install.'));
      return;
    }

    // Dry-run mode: preview and exit
    if (opts.dryRun) {
      const config = HookManager.preview(skillsWithHooks);
      console.log('Preview \u2014 hooks that would be installed:');
      console.log(JSON.stringify(config, null, 2));
      console.log();
      const totalHooks = skillsWithHooks.reduce((sum, s) => sum + (s.manifest.hooks?.length ?? 0), 0);
      console.log(dim(`(${totalHooks} hooks from ${skillsWithHooks.length} skill${skillsWithHooks.length !== 1 ? 's' : ''} \u2014 dry run, nothing written)`));
      return;
    }

    // Install mode
    try {
      const result = await HookManager.install(skillsWithHooks, opts.settingsPath);
      console.log(`${green('\u2713')} Installed ${result.installed} hooks from ${skillsWithHooks.length} skill${skillsWithHooks.length !== 1 ? 's' : ''}`);
      console.log(`  Settings: ${result.settingsPath}`);
    } catch (err) {
      console.error(`${red('\u2717')} Failed to install hooks: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ─── install-capture-hook ────────────────────────────────────────────────────

program
  .command('install-capture-hook')
  .description('Register the auto-capture Stop hook in ~/.claude/settings.json so Claude Code automatically captures reusable skills after each session')
  .option('--dry-run', 'Show what would be added without writing')
  .option('--claude-settings <path>', 'Override path to settings.json (default: ~/.claude/settings.json)')
  .option('--script <path>', 'Override path to capture-hook.py')
  .action(async (opts: { dryRun?: boolean; claudeSettings?: string; script?: string }) => {
    // Resolve the capture-hook.py path (dist is at packages/cli/dist/, so go up 3 levels)
    const defaultScriptPath = path.resolve(__dirname, '../../../scripts/capture-hook.py');
    const scriptPath = opts.script ? path.resolve(opts.script) : defaultScriptPath;

    // Verify the script exists
    try {
      await fs.access(scriptPath);
    } catch {
      console.error(red(`capture-hook.py not found at: ${scriptPath}`));
      console.error(dim('  Run this command from the SkillForge repo root, or use --script <path> to specify the location.'));
      process.exit(1);
    }

    // Resolve settings.json path
    const settingsPath = opts.claudeSettings
      ? path.resolve(opts.claudeSettings)
      : path.join(os.homedir(), '.claude', 'settings.json');

    // Read or initialize settings
    let raw = '{}';
    try {
      raw = await fs.readFile(settingsPath, 'utf8');
    } catch {
      // File doesn't exist yet — start empty
    }

    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      console.error(red(`Failed to parse ${settingsPath}: ${(err as Error).message}`));
      process.exit(1);
    }

    // Detect whether hooks live at top-level or under settings.hooks
    const hasNestedHooks = typeof settings['hooks'] === 'object' && settings['hooks'] !== null;
    const hooksContainer: Record<string, unknown> = hasNestedHooks
      ? (settings['hooks'] as Record<string, unknown>)
      : settings;

    // Check if the Stop hook for capture-hook.py already exists
    const existingStop = hooksContainer['Stop'];
    if (Array.isArray(existingStop)) {
      const alreadyInstalled = existingStop.some(entry => {
        if (typeof entry !== 'object' || entry === null) return false;
        const hooks = (entry as Record<string, unknown>)['hooks'];
        if (!Array.isArray(hooks)) return false;
        return hooks.some(h => {
          if (typeof h !== 'object' || h === null) return false;
          const cmd = (h as Record<string, unknown>)['command'];
          return typeof cmd === 'string' && cmd.includes('capture-hook.py');
        });
      });
      if (alreadyInstalled) {
        console.log('Already installed.');
        return;
      }
    }

    // Build the new Stop hook entry
    const newEntry = {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: `python3 ${scriptPath}`,
        },
      ],
    };

    // Append to existing Stop array or create it
    if (Array.isArray(hooksContainer['Stop'])) {
      (hooksContainer['Stop'] as unknown[]).push(newEntry);
    } else {
      hooksContainer['Stop'] = [newEntry];
    }

    // Write back if not dry-run
    if (opts.dryRun) {
      console.log('Dry run \u2014 would write to:', settingsPath);
      console.log(JSON.stringify(settings, null, 2));
      return;
    }

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');

    console.log(`${green('\u2713')} Capture hook installed. Skills will be auto-captured after each session.`);
    console.log(`  Hook script: ${scriptPath}`);
    console.log(`  Requires: pip install anthropic`);
  });

// ─── doctor ──────────────────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Run diagnostic checks on your SkillForge installation')
  .option('--skills-path <path>', 'Path to skills directory')
  .action(async (opts: { skillsPath?: string }) => {
    const DIVIDER = '\u2500'.repeat(33);
    const CHECK = green('\u2713');
    const CROSS = red('\u2717');
    const WARN  = yellow('\u26a0');

    let failures = 0;
    let warnings = 0;

    function pass(msg: string)    { console.log(`  ${CHECK} ${msg}`); }
    function fail(msg: string)    { console.log(`  ${CROSS} ${msg}`); failures++; }
    function warn(msg: string, hint?: string) {
      console.log(`  ${WARN} ${msg}`);
      if (hint) console.log(`    ${dim('\u2192')} ${dim(hint)}`);
      warnings++;
    }

    console.log();
    console.log(bold('SkillForge Doctor'));
    console.log(DIVIDER);
    console.log();

    // ── Runtime ──────────────────────────────────────────────────────────────
    console.log(bold('Runtime'));
    const nodeVersion = process.version; // e.g. "v22.0.0"
    const major = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    if (major >= 18) {
      pass(`Node.js ${nodeVersion} (\u226518.0.0 required)`);
    } else {
      fail(`Node.js ${nodeVersion} \u2014 version too old (need \u226518.0.0)`);
    }
    console.log();

    // ── Skills ───────────────────────────────────────────────────────────────
    console.log(bold('Skills'));
    const skillsPath = await resolveSkillsPath(opts.skillsPath);
    const absSkillsPath = path.resolve(skillsPath);

    let skills: Skill[] = [];
    let skillsDirOk = false;
    try {
      await fs.access(absSkillsPath);
      skillsDirOk = true;
    } catch {
      fail(`Skills directory not found: ${skillsPath}`);
    }

    if (skillsDirOk) {
      try {
        const loader = new FileSystemSkillLoader();
        skills = await loader.loadAll(absSkillsPath);
        pass(`Skills directory: ${skillsPath} (${skills.length} skill${skills.length !== 1 ? 's' : ''} found)`);

        const validator = new SkillValidator();
        for (const skill of skills) {
          const result: ValidationResult = validator.validate(skill);
          if (result.valid) {
            pass(`${skill.manifest.id} \u2014 valid`);
          } else {
            fail(`${skill.manifest.id} \u2014 ${result.errors.length} validation error${result.errors.length !== 1 ? 's' : ''}`);
            for (const err of result.errors) {
              console.log(`    ${dim(`[${err.field}]`)} ${err.message}`);
            }
          }
        }
      } catch (err) {
        fail(`Failed to load skills: ${(err as Error).message}`);
      }
    }
    console.log();

    // ── Configuration ────────────────────────────────────────────────────────
    console.log(bold('Configuration'));

    // skillforge.config.json
    try {
      await loadConfig(process.cwd());
      pass('skillforge.config.json found');
    } catch {
      warn('skillforge.config.json not found', 'Create a skillforge.config.json to customise your setup');
    }

    // Claude Desktop config
    let claudeConfigPath: string;
    if (process.platform === 'darwin') {
      claudeConfigPath = path.join(process.env['HOME'] ?? '', 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else if (process.platform === 'win32') {
      claudeConfigPath = path.join(process.env['APPDATA'] ?? '', 'Claude', 'claude_desktop_config.json');
    } else {
      claudeConfigPath = path.join(process.env['HOME'] ?? '', '.config', 'claude', 'claude_desktop_config.json');
    }

    try {
      await fs.access(claudeConfigPath);
      pass(`Claude Desktop config found at ${claudeConfigPath}`);
    } catch {
      warn(
        `Claude Desktop config not found at ${claudeConfigPath}`,
        'To connect SkillForge to Claude Desktop, add it to the Claude Desktop MCP config'
      );
    }
    console.log();

    // ── MCP Server ───────────────────────────────────────────────────────────
    console.log(bold('MCP Server'));
    const mcpBinary = path.join(process.cwd(), 'packages', 'mcp', 'dist', 'index.js');
    try {
      await fs.access(mcpBinary);
      pass(`MCP server binary: packages/mcp/dist/index.js`);
    } catch {
      fail(`MCP server binary not found: packages/mcp/dist/index.js`);
    }
    console.log();

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log(DIVIDER);
    if (failures === 0) {
      const warnSuffix = warnings > 0 ? ` (${warnings} warning${warnings !== 1 ? 's' : ''})` : '';
      console.log(`${CHECK} ${bold('All required checks passed')}${warnSuffix}`);
    } else {
      console.log(`${CROSS} ${bold(`${failures} required check${failures !== 1 ? 's' : ''} failed`)}`);
      process.exit(1);
    }
    console.log();
  });

// ─── Run ─────────────────────────────────────────────────────────────────────

program.parse(process.argv);
