import { describe, it, expect } from 'vitest';
import { HookManager } from '../hooks';
import { Skill, SkillCategory, HookBinding } from '../types';

function makeSkill(id: string, hooks?: HookBinding[]): Skill {
  return {
    manifest: {
      id,
      name: id,
      version: '1.0.0',
      description: 'A test skill',
      category: SkillCategory.WORKFLOW,
      tags: [],
      hooks,
    },
    instructions: '# Test',
    path: `/fake/${id}`,
  };
}

describe('HookManager', () => {
  describe('toClaudeConfig()', () => {
    it('converts a single PreToolUse hook', () => {
      const bindings: HookBinding[] = [
        { event: 'PreToolUse', matcher: 'Bash', command: 'echo before', description: 'Before Bash' },
      ];
      const config = HookManager.toClaudeConfig(bindings);
      expect(config['PreToolUse']).toHaveLength(1);
      expect(config['PreToolUse'][0].matcher).toBe('Bash');
      expect(config['PreToolUse'][0].hooks).toEqual([{ type: 'command', command: 'echo before' }]);
    });

    it('groups multiple hooks under the same event and matcher', () => {
      const bindings: HookBinding[] = [
        { event: 'PostToolUse', matcher: 'Bash', command: 'echo after-1', description: 'After Bash 1' },
        { event: 'PostToolUse', matcher: 'Bash', command: 'echo after-2', description: 'After Bash 2' },
        { event: 'PostToolUse', command: 'echo after-any', description: 'After any' },
      ];
      const config = HookManager.toClaudeConfig(bindings);
      expect(config['PostToolUse']).toHaveLength(2);

      const bashGroup = config['PostToolUse'].find(m => m.matcher === 'Bash');
      expect(bashGroup?.hooks).toHaveLength(2);

      const noMatcherGroup = config['PostToolUse'].find(m => m.matcher === undefined);
      expect(noMatcherGroup?.hooks).toHaveLength(1);
    });

    it('handles multiple distinct events', () => {
      const bindings: HookBinding[] = [
        { event: 'PreToolUse', command: 'echo pre', description: 'pre' },
        { event: 'Stop', command: 'echo stop', description: 'stop' },
      ];
      const config = HookManager.toClaudeConfig(bindings);
      expect(Object.keys(config)).toEqual(['PreToolUse', 'Stop']);
    });

    it('returns empty config for no bindings', () => {
      expect(HookManager.toClaudeConfig([])).toEqual({});
    });
  });

  describe('collectBindings()', () => {
    it('collects hooks from a skill that has them', () => {
      const skill = makeSkill('skill-a', [
        { event: 'Stop', command: 'echo stop', description: 'stop' },
      ]);
      const bindings = HookManager.collectBindings([skill]);
      expect(bindings).toHaveLength(1);
      expect(bindings[0].command).toBe('echo stop');
    });

    it('returns empty array for a skill with no hooks', () => {
      const skill = makeSkill('skill-b');
      expect(HookManager.collectBindings([skill])).toEqual([]);
    });

    it('collects from 2 skills — one with hooks, one without', () => {
      const withHooks = makeSkill('skill-a', [
        { event: 'PreToolUse', command: 'echo pre', description: 'pre' },
        { event: 'Stop', command: 'echo stop', description: 'stop' },
      ]);
      const withoutHooks = makeSkill('skill-b');
      const bindings = HookManager.collectBindings([withHooks, withoutHooks]);
      expect(bindings).toHaveLength(2);
    });
  });

  describe('mergeConfig()', () => {
    it('merges two configs without duplicates', () => {
      const existing = {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command' as const, command: 'echo existing' }] }],
      };
      const incoming = {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command' as const, command: 'echo new' }] }],
      };
      const merged = HookManager.mergeConfig(existing, incoming);
      expect(merged['PreToolUse'][0].hooks).toHaveLength(2);
    });

    it('does not duplicate a command already present', () => {
      const existing = {
        Stop: [{ hooks: [{ type: 'command' as const, command: 'echo stop' }] }],
      };
      const incoming = {
        Stop: [{ hooks: [{ type: 'command' as const, command: 'echo stop' }] }],
      };
      const merged = HookManager.mergeConfig(existing, incoming);
      expect(merged['Stop'][0].hooks).toHaveLength(1);
    });

    it('adds a new event from incoming', () => {
      const existing = {
        PreToolUse: [{ hooks: [{ type: 'command' as const, command: 'echo pre' }] }],
      };
      const incoming = {
        Stop: [{ hooks: [{ type: 'command' as const, command: 'echo stop' }] }],
      };
      const merged = HookManager.mergeConfig(existing, incoming);
      expect(Object.keys(merged)).toContain('PreToolUse');
      expect(Object.keys(merged)).toContain('Stop');
    });

    it('merging into empty existing returns incoming', () => {
      const incoming = {
        UserPromptSubmit: [{ hooks: [{ type: 'command' as const, command: 'echo prompt' }] }],
      };
      const merged = HookManager.mergeConfig({}, incoming);
      expect(merged).toEqual(incoming);
    });
  });

  describe('preview()', () => {
    it('returns the correct config for loaded skills', () => {
      const skill = makeSkill('my-skill', [
        { event: 'PreToolUse', matcher: 'Write', command: 'echo writing', description: 'On write' },
      ]);
      const config = HookManager.preview([skill]);
      expect(config['PreToolUse']).toBeDefined();
      expect(config['PreToolUse'][0].matcher).toBe('Write');
      expect(config['PreToolUse'][0].hooks[0].command).toBe('echo writing');
    });

    it('returns empty config when no skills have hooks', () => {
      const skill = makeSkill('no-hooks-skill');
      expect(HookManager.preview([skill])).toEqual({});
    });
  });
});
