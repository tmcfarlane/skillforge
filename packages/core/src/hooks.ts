import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Skill, HookBinding } from './types';

export interface ClaudeHookEntry {
  type: "command";
  command: string;
}

export interface ClaudeHookMatcher {
  matcher?: string;
  hooks: ClaudeHookEntry[];
}

export type ClaudeHooksConfig = {
  [event: string]: ClaudeHookMatcher[];
};

export interface ClaudeSettingsHooks {
  hooks?: ClaudeHooksConfig;
  [key: string]: unknown;
}

export interface HookInstallResult {
  installed: number;
  settingsPath: string;
  config: ClaudeHooksConfig;
}

export class HookManager {
  /**
   * Convert SkillForge HookBindings into Claude Code hooks config structure.
   * Groups hooks by event, then by matcher.
   */
  static toClaudeConfig(bindings: HookBinding[]): ClaudeHooksConfig {
    const config: ClaudeHooksConfig = {};

    for (const binding of bindings) {
      if (!config[binding.event]) {
        config[binding.event] = [];
      }

      // Find existing matcher group or create new one
      const matchers = config[binding.event];
      let matcherGroup = matchers.find(m => m.matcher === binding.matcher);
      if (!matcherGroup) {
        matcherGroup = binding.matcher ? { matcher: binding.matcher, hooks: [] } : { hooks: [] };
        matchers.push(matcherGroup);
      }

      matcherGroup.hooks.push({ type: "command", command: binding.command });
    }

    return config;
  }

  /**
   * Collect all hook bindings from a set of skills.
   */
  static collectBindings(skills: Skill[]): HookBinding[] {
    return skills.flatMap(skill => skill.manifest.hooks ?? []);
  }

  /**
   * Merge a new hooks config into an existing one.
   * New hooks are appended; existing hooks are preserved (no duplicates by command).
   */
  static mergeConfig(existing: ClaudeHooksConfig, incoming: ClaudeHooksConfig): ClaudeHooksConfig {
    const merged: ClaudeHooksConfig = { ...existing };

    for (const [event, matchers] of Object.entries(incoming)) {
      if (!merged[event]) {
        merged[event] = matchers;
        continue;
      }

      for (const incomingMatcher of matchers) {
        const existingMatcher = merged[event].find(m => m.matcher === incomingMatcher.matcher);
        if (!existingMatcher) {
          merged[event].push(incomingMatcher);
        } else {
          // Add only hooks that don't already exist by command
          for (const hook of incomingMatcher.hooks) {
            if (!existingMatcher.hooks.some(h => h.command === hook.command)) {
              existingMatcher.hooks.push(hook);
            }
          }
        }
      }
    }

    return merged;
  }

  /**
   * Install hooks from the given skills into a Claude settings.json file.
   *
   * @param skills - Skills whose hooks to install
   * @param settingsPath - Path to Claude settings.json (default: ~/.claude/settings.json)
   * @returns Result with count of installed hooks
   */
  static async install(skills: Skill[], settingsPath?: string): Promise<HookInstallResult> {
    const resolvedPath = settingsPath ?? path.join(os.homedir(), '.claude', 'settings.json');

    // Read existing settings
    let existing: ClaudeSettingsHooks = {};
    try {
      const content = await fs.readFile(resolvedPath, 'utf-8');
      existing = JSON.parse(content);
    } catch {
      // File doesn't exist or is not valid JSON — start fresh
    }

    const bindings = this.collectBindings(skills);
    const newConfig = this.toClaudeConfig(bindings);
    const merged = this.mergeConfig(existing.hooks ?? {}, newConfig);

    const updated: ClaudeSettingsHooks = { ...existing, hooks: merged };

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');

    return {
      installed: bindings.length,
      settingsPath: resolvedPath,
      config: merged,
    };
  }

  /**
   * Preview what hooks would be installed without writing to disk.
   */
  static preview(skills: Skill[]): ClaudeHooksConfig {
    const bindings = this.collectBindings(skills);
    return this.toClaudeConfig(bindings);
  }
}
