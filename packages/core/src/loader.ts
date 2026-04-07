import { promises as fs } from 'fs';
import * as path from 'path';
import { ISkillLoader, ISkillRegistry, Skill, SkillCategory, SkillExample, SkillManifest } from './types';
import { parseManifest } from './schema';
import { SkillLoadError } from './errors';

/** Parsed result of YAML frontmatter extraction */
interface Frontmatter {
  fields: Record<string, string | string[]>;
  /** The markdown content with the frontmatter block removed */
  body: string;
}

/**
 * Minimal inline YAML frontmatter parser.
 * Handles scalar values and inline array syntax: [a, b, c]
 * Returns null if the content does not start with a frontmatter block.
 */
function parseFrontmatter(content: string): Frontmatter | null {
  if (!content.startsWith('---\n')) return null;

  const closingIdx = content.indexOf('\n---', 4);
  if (closingIdx === -1) return null;

  const yamlBlock = content.slice(4, closingIdx);
  // Body is everything after the closing ---\n (or --- at end)
  const afterClose = content.slice(closingIdx + 4);
  const body = afterClose.startsWith('\n') ? afterClose.slice(1) : afterClose;

  const fields: Record<string, string | string[]> = {};
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!key) continue;

    // Array syntax: [a, b, c]
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const inner = rawValue.slice(1, -1);
      fields[key] = inner
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    } else {
      fields[key] = rawValue;
    }
  }

  return { fields, body };
}

/** Convert a directory name to a title-cased name, e.g. "my-skill" -> "My Skill" */
function titleCase(dirName: string): string {
  return dirName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const VALID_CATEGORIES = new Set<string>([
  'workflow', 'tool_guide', 'domain', 'integration', 'guardrail',
]);

function toCategory(value: string | string[] | undefined): SkillCategory {
  const s = typeof value === 'string' ? value : undefined;
  if (s && VALID_CATEGORIES.has(s)) return s as SkillCategory;
  return SkillCategory.WORKFLOW;
}

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function arr(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

/** Build a SkillManifest directly from frontmatter fields + directory name. */
function manifestFromFrontmatter(
  fields: Record<string, string | string[]>,
  dirName: string,
): SkillManifest {
  return {
    id: dirName,
    name: str(fields['name']) ?? titleCase(dirName),
    version: str(fields['version']) ?? '1.0.0',
    description: str(fields['description']) ?? '',
    category: toCategory(fields['category']),
    tags: arr(fields['tags']),
    author: str(fields['author']),
    license: str(fields['license']),
  };
}

export class FileSystemSkillLoader implements ISkillLoader {
  /**
   * Discover skill directories under basePath.
   * A skill directory is any directory that contains manifest.json,
   * OR a directory that contains SKILL.md with YAML frontmatter (starts with ---\n).
   */
  async discover(basePath: string): Promise<string[]> {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    const skillPaths: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(basePath, entry.name);

      // Primary: directory has manifest.json
      try {
        await fs.access(path.join(skillPath, 'manifest.json'));
        skillPaths.push(skillPath);
        continue;
      } catch {
        // fall through to frontmatter check
      }

      // Fallback: directory has SKILL.md with YAML frontmatter
      try {
        const content = await fs.readFile(path.join(skillPath, 'SKILL.md'), 'utf-8');
        if (content.startsWith('---\n')) {
          skillPaths.push(skillPath);
        }
      } catch {
        // Not a skill directory
      }
    }

    return skillPaths;
  }

  /**
   * Load a single skill from a directory.
   * If manifest.json exists, uses it (existing behavior).
   * Otherwise attempts to synthesize a manifest from SKILL.md frontmatter.
   */
  async load(skillPath: string): Promise<Skill> {
    try {
      const manifestPath = path.join(skillPath, 'manifest.json');
      const skillMdPath = path.join(skillPath, 'SKILL.md');

      let manifest: SkillManifest;
      let instructions: string;

      // Check for manifest.json
      let hasManifest = false;
      try {
        await fs.access(manifestPath);
        hasManifest = true;
      } catch {
        // no manifest.json
      }

      if (hasManifest) {
        const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
        manifest = parseManifest(JSON.parse(manifestRaw));
        instructions = await fs.readFile(skillMdPath, 'utf-8');
      } else {
        // Attempt frontmatter-based load from SKILL.md
        const content = await fs.readFile(skillMdPath, 'utf-8');
        const parsed = parseFrontmatter(content);
        if (!parsed) {
          throw new SkillLoadError(
            skillPath,
            'Required file not found (needs manifest.json + SKILL.md)',
          );
        }
        manifest = manifestFromFrontmatter(parsed.fields, path.basename(skillPath));
        instructions = parsed.body;
      }

      const examples = await this.loadExamples(skillPath);

      return {
        manifest,
        instructions,
        path: path.resolve(skillPath),
        examples: examples.length > 0 ? examples : undefined,
      };
    } catch (err) {
      if (err instanceof SkillLoadError) throw err;
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SkillLoadError(skillPath, `Required file not found (needs manifest.json + SKILL.md)`);
      }
      throw new SkillLoadError(skillPath, err);
    }
  }

  /**
   * Discover and load all skills under basePath.
   * Failures for individual skills are collected and reported, not thrown.
   */
  async loadAll(basePath: string): Promise<Skill[]> {
    const paths = await this.discover(basePath);
    const results: Skill[] = [];
    const errors: { path: string; error: unknown }[] = [];

    await Promise.all(
      paths.map(async (skillPath) => {
        try {
          results.push(await this.load(skillPath));
        } catch (err) {
          errors.push({ path: skillPath, error: err });
        }
      })
    );

    if (errors.length > 0) {
      console.warn(
        `[SkillForge] ${errors.length} skill(s) failed to load:\n` +
        errors.map(e => `  - ${e.path}: ${e.error instanceof Error ? e.error.message : String(e.error)}`).join('\n')
      );
    }

    return results;
  }

  /**
   * Verify that all required skills for the given skill are present in the registry.
   * Returns a list of missing skill IDs (empty = all satisfied).
   */
  resolveRequirements(skill: Skill, registry: ISkillRegistry): string[] {
    const required = skill.manifest.requires ?? [];
    return required.filter(id => !registry.get(id));
  }

  private async loadExamples(skillPath: string): Promise<SkillExample[]> {
    const examplesPath = path.join(skillPath, 'examples');
    try {
      const files = await fs.readdir(examplesPath);
      const jsonFiles = files.filter((f: string) => f.endsWith('.json'));
      const examples: SkillExample[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(examplesPath, file), 'utf-8');
          examples.push(JSON.parse(content) as SkillExample);
        } catch {
          // Skip malformed example files
        }
      }
      return examples;
    } catch {
      return [];
    }
  }
}
