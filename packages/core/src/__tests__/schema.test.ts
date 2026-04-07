import { describe, it, expect } from 'vitest';
import { parseManifest } from '../schema';
import { SkillCategory } from '../types';

const validManifest = {
  id: 'test-skill',
  name: 'Test Skill',
  version: '1.0.0',
  description: 'A test skill',
  category: 'workflow',
  tags: ['test'],
};

describe('parseManifest', () => {
  it('parses a valid manifest correctly', () => {
    const result = parseManifest(validManifest);
    expect(result.id).toBe('test-skill');
    expect(result.name).toBe('Test Skill');
    expect(result.version).toBe('1.0.0');
    expect(result.description).toBe('A test skill');
    expect(result.category).toBe(SkillCategory.WORKFLOW);
    expect(result.tags).toEqual(['test']);
  });

  it('throws a descriptive error when id is missing', () => {
    const bad = { ...validManifest, id: undefined };
    expect(() => parseManifest(bad)).toThrow(/Invalid skill manifest/);
  });

  it('throws when version is not valid semver', () => {
    const bad = { ...validManifest, version: 'not-a-version' };
    expect(() => parseManifest(bad)).toThrow(/Invalid skill manifest/);
  });

  it('strips (or passes through) extra unknown fields without error', () => {
    const withExtra = { ...validManifest, unknownField: 'extra-value' };
    // Zod strips passthrough-unknown fields by default; should not throw
    expect(() => parseManifest(withExtra)).not.toThrow();
  });

  it('accepts all SkillCategory values', () => {
    const categories: string[] = ['workflow', 'tool_guide', 'domain', 'integration', 'guardrail'];
    for (const category of categories) {
      const manifest = { ...validManifest, category };
      expect(() => parseManifest(manifest)).not.toThrow();
      expect(parseManifest(manifest).category).toBe(category);
    }
  });

  it('throws when name is missing', () => {
    const bad = { ...validManifest, name: '' };
    expect(() => parseManifest(bad)).toThrow(/Invalid skill manifest/);
  });

  it('throws when description is empty string', () => {
    const bad = { ...validManifest, description: '' };
    expect(() => parseManifest(bad)).toThrow(/Invalid skill manifest/);
  });

  it('accepts optional fields when provided', () => {
    const full = {
      ...validManifest,
      author: 'test-author',
      license: 'MIT',
      homepage: 'https://example.com',
      createdAt: '2026-01-01T00:00:00Z',
    };
    const result = parseManifest(full);
    expect(result.author).toBe('test-author');
    expect(result.license).toBe('MIT');
  });
});
