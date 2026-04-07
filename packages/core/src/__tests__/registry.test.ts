import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../registry';
import { SkillAlreadyRegisteredError } from '../errors';
import { Skill, SkillCategory } from '../types';

function makeSkill(overrides: Partial<Skill['manifest']> = {}): Skill {
  return {
    manifest: {
      id: 'test-skill',
      name: 'Test Skill',
      version: '1.0.0',
      description: 'A test skill',
      category: SkillCategory.WORKFLOW,
      tags: ['test'],
      ...overrides,
    },
    instructions: '# Test Skill\n\nDo the thing.',
    path: '/fake/path/test-skill',
  };
}

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = SkillRegistry.create();
  });

  describe('register() and get()', () => {
    it('register() adds a skill and get() retrieves it by id', () => {
      const skill = makeSkill();
      registry.register(skill);
      expect(registry.get('test-skill')).toBe(skill);
    });

    it('get() returns undefined for an unknown id', () => {
      expect(registry.get('unknown')).toBeUndefined();
    });

    it('register() twice with same id throws SkillAlreadyRegisteredError', () => {
      registry.register(makeSkill());
      expect(() => registry.register(makeSkill())).toThrow(SkillAlreadyRegisteredError);
    });
  });

  describe('registerOrUpdate()', () => {
    it('upserts without throwing on duplicate id', () => {
      registry.register(makeSkill());
      const updated = makeSkill({ description: 'Updated description' });
      expect(() => registry.registerOrUpdate(updated)).not.toThrow();
      expect(registry.get('test-skill')?.manifest.description).toBe('Updated description');
    });

    it('registers a new skill when not previously registered', () => {
      const skill = makeSkill({ id: 'new-skill' });
      registry.registerOrUpdate(skill);
      expect(registry.get('new-skill')).toBe(skill);
    });
  });

  describe('search()', () => {
    beforeEach(() => {
      registry.register(makeSkill({ id: 'code-review', name: 'Code Review', description: 'Review code systematically', tags: ['review', 'quality'] }));
      registry.register(makeSkill({ id: 'git-workflow', name: 'Git Workflow', description: 'Git branching and commits', tags: ['git', 'version-control'] }));
      registry.register(makeSkill({ id: 'deep-research', name: 'Deep Research', description: 'Structured research workflow', tags: ['research', 'analysis'] }));
    });

    it('search("review") finds code-review skill', () => {
      const results = registry.search('review');
      expect(results.map(s => s.manifest.id)).toContain('code-review');
    });

    it('search("") returns all skills', () => {
      const results = registry.search('');
      expect(results).toHaveLength(3);
    });

    it('search("git") finds git-workflow via tag', () => {
      const results = registry.search('git');
      expect(results.map(s => s.manifest.id)).toContain('git-workflow');
    });

    it('search("nonexistent-xyz") returns empty array', () => {
      expect(registry.search('nonexistent-xyz')).toHaveLength(0);
    });
  });

  describe('byCategory()', () => {
    beforeEach(() => {
      registry.register(makeSkill({ id: 'wf-skill', category: SkillCategory.WORKFLOW }));
      registry.register(makeSkill({ id: 'domain-skill', category: SkillCategory.DOMAIN }));
      registry.register(makeSkill({ id: 'wf-skill-2', category: SkillCategory.WORKFLOW }));
    });

    it('returns only skills in the requested category', () => {
      const results = registry.byCategory(SkillCategory.WORKFLOW);
      expect(results).toHaveLength(2);
      expect(results.every(s => s.manifest.category === SkillCategory.WORKFLOW)).toBe(true);
    });

    it('returns empty array for a category with no skills', () => {
      expect(registry.byCategory(SkillCategory.GUARDRAIL)).toHaveLength(0);
    });
  });

  describe('byTags()', () => {
    beforeEach(() => {
      registry.register(makeSkill({ id: 'git-workflow', tags: ['git', 'version-control', 'github'] }));
      registry.register(makeSkill({ id: 'code-review', tags: ['review', 'quality'] }));
      registry.register(makeSkill({ id: 'git-advanced', tags: ['git', 'advanced'] }));
    });

    it('returns git-workflow skill when searching by ["git"]', () => {
      const results = registry.byTags(['git']);
      const ids = results.map(s => s.manifest.id);
      expect(ids).toContain('git-workflow');
      expect(ids).toContain('git-advanced');
    });

    it('byTags(["git", "nonexistent-tag"]) returns empty (ALL tags must match)', () => {
      const results = registry.byTags(['git', 'nonexistent-tag']);
      expect(results).toHaveLength(0);
    });

    it('byTags(["git", "version-control"]) returns only git-workflow', () => {
      const results = registry.byTags(['git', 'version-control']);
      expect(results).toHaveLength(1);
      expect(results[0].manifest.id).toBe('git-workflow');
    });

    it('byTags([]) returns all skills', () => {
      const results = registry.byTags([]);
      expect(results).toHaveLength(3);
    });
  });

  describe('stats()', () => {
    it('returns correct total and byCategory counts', () => {
      registry.register(makeSkill({ id: 'wf-1', category: SkillCategory.WORKFLOW, tags: ['a', 'b'] }));
      registry.register(makeSkill({ id: 'wf-2', category: SkillCategory.WORKFLOW, tags: ['b', 'c'] }));
      registry.register(makeSkill({ id: 'dm-1', category: SkillCategory.DOMAIN, tags: ['c'] }));

      const stats = registry.stats();
      expect(stats.total).toBe(3);
      expect(stats.byCategory[SkillCategory.WORKFLOW]).toBe(2);
      expect(stats.byCategory[SkillCategory.DOMAIN]).toBe(1);
      expect(stats.tags).toEqual(['a', 'b', 'c']);
    });

    it('stats() on empty registry returns zero total', () => {
      const stats = registry.stats();
      expect(stats.total).toBe(0);
      expect(stats.tags).toEqual([]);
    });
  });

  describe('clear()', () => {
    it('empties the registry', () => {
      registry.register(makeSkill({ id: 'skill-a' }));
      registry.register(makeSkill({ id: 'skill-b' }));
      registry.clear();
      expect(registry.list()).toHaveLength(0);
      expect(registry.get('skill-a')).toBeUndefined();
    });
  });
});
