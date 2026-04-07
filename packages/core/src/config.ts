import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * SkillForge project configuration (skillforge.config.json).
 * All fields are optional — values fall back to environment variables, then hardcoded defaults.
 */
export interface SkillForgeConfig {
  /** Path to the skills directory (default: "./skills") */
  skillsPath?: string;
  /** Default author name for new skills */
  defaultAuthor?: string;
  /** Default license for new skills (e.g. "MIT") */
  defaultLicense?: string;
  /** Path to Claude settings.json for hook installation */
  claudeSettingsPath?: string;
  /** Whether to enable verbose output */
  verbose?: boolean;
}

/**
 * Result of loading configuration, including its source.
 */
export interface ResolvedConfig {
  skillsPath: string;
  defaultAuthor: string;
  defaultLicense: string;
  claudeSettingsPath: string;
  verbose: boolean;
  /** Path to the config file that was loaded, or null if using defaults */
  configFilePath: string | null;
}

const CONFIG_FILENAMES = ['skillforge.config.json', '.skillforgerc'];

/**
 * Load SkillForge configuration by searching for config files upward from startDir.
 * Falls back to environment variables, then hardcoded defaults.
 *
 * Search order:
 * 1. skillforge.config.json in startDir
 * 2. .skillforgerc in startDir
 * 3. Repeat searching parent directories up to 5 levels
 * 4. Environment variables
 * 5. Hardcoded defaults
 */
export async function loadConfig(startDir?: string): Promise<ResolvedConfig> {
  const cwd = startDir ?? process.cwd();
  let fileConfig: SkillForgeConfig = {};
  let configFilePath: string | null = null;

  // Search upward for config file
  let searchDir = path.resolve(cwd);
  for (let i = 0; i < 6; i++) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = path.join(searchDir, filename);
      try {
        const content = await fs.readFile(candidate, 'utf-8');
        fileConfig = JSON.parse(content) as SkillForgeConfig;
        configFilePath = candidate;
        break;
      } catch {
        // Not found or invalid JSON — continue
      }
    }
    if (configFilePath) break;
    const parent = path.dirname(searchDir);
    if (parent === searchDir) break; // Reached filesystem root
    searchDir = parent;
  }

  return {
    skillsPath:
      fileConfig.skillsPath ??
      process.env['SKILLFORGE_SKILLS_PATH'] ??
      path.join(cwd, 'skills'),
    defaultAuthor:
      fileConfig.defaultAuthor ??
      process.env['SKILLFORGE_DEFAULT_AUTHOR'] ??
      '',
    defaultLicense:
      fileConfig.defaultLicense ??
      process.env['SKILLFORGE_DEFAULT_LICENSE'] ??
      'MIT',
    claudeSettingsPath:
      fileConfig.claudeSettingsPath ??
      process.env['SKILLFORGE_CLAUDE_SETTINGS_PATH'] ??
      path.join(process.env['HOME'] ?? '~', '.claude', 'settings.json'),
    verbose:
      fileConfig.verbose ??
      (process.env['SKILLFORGE_VERBOSE'] === '1'),
    configFilePath,
  };
}

/**
 * Synchronously resolve the config for cases where async isn't available.
 * Only checks environment variables and returns defaults — does not read config files.
 */
export function loadConfigSync(cwd?: string): ResolvedConfig {
  const dir = cwd ?? process.cwd();
  return {
    skillsPath: process.env['SKILLFORGE_SKILLS_PATH'] ?? path.join(dir, 'skills'),
    defaultAuthor: process.env['SKILLFORGE_DEFAULT_AUTHOR'] ?? '',
    defaultLicense: process.env['SKILLFORGE_DEFAULT_LICENSE'] ?? 'MIT',
    claudeSettingsPath:
      process.env['SKILLFORGE_CLAUDE_SETTINGS_PATH'] ??
      path.join(process.env['HOME'] ?? '~', '.claude', 'settings.json'),
    verbose: process.env['SKILLFORGE_VERBOSE'] === '1',
    configFilePath: null,
  };
}
