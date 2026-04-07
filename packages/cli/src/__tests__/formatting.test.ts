import { describe, it, expect } from 'vitest';
import { Skill, SkillCategory, ValidationResult, ValidationWarning } from '@skillforge/core';
import { formatSkillSummary, formatValidationResult, bold, green, red, yellow, dim } from '../format';

// ─── Fixture ─────────────────────────────────────────────────────────────────

const mockSkill: Skill = {
  manifest: {
    id: 'test-skill',
    name: 'Test Skill',
    version: '1.0.0',
    description: 'A test skill',
    category: SkillCategory.WORKFLOW,
    tags: ['test', 'example'],
    author: 'test-author',
    guardrails: [],
  },
  instructions: '# Test\n\nInstructions here.',
  path: '/tmp/test-skill',
};

// ─── formatSkillSummary ───────────────────────────────────────────────────────

describe('formatSkillSummary', () => {
  it('includes the skill id', () => {
    const output = formatSkillSummary(mockSkill);
    expect(output).toContain('test-skill');
  });

  it('includes the skill name', () => {
    const output = formatSkillSummary(mockSkill);
    expect(output).toContain('Test Skill');
  });

  it('includes the category', () => {
    const output = formatSkillSummary(mockSkill);
    expect(output).toContain('workflow');
  });

  it('includes all tags', () => {
    const output = formatSkillSummary(mockSkill);
    expect(output).toContain('test');
    expect(output).toContain('example');
  });

  it('includes the description', () => {
    const output = formatSkillSummary(mockSkill);
    expect(output).toContain('A test skill');
  });

  it('omits Tags line when skill has no tags', () => {
    const noTagsSkill: Skill = {
      ...mockSkill,
      manifest: { ...mockSkill.manifest, tags: [] },
    };
    const output = formatSkillSummary(noTagsSkill);
    expect(output).not.toContain('Tags:');
  });
});

// ─── formatValidationResult ──────────────────────────────────────────────────

describe('formatValidationResult', () => {
  it('includes checkmark and id for valid skill', () => {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };
    const output = formatValidationResult('test-skill', result, []);
    expect(output).toContain('\u2713');
    expect(output).toContain('test-skill');
  });

  it('includes cross and id for invalid skill', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [{ field: 'manifest.id', message: 'ID is required', code: 'REQUIRED_FIELD' }],
      warnings: [],
    };
    const output = formatValidationResult('test-skill', result, []);
    expect(output).toContain('\u2717');
    expect(output).toContain('test-skill');
  });

  it('includes error messages for invalid skill', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [{ field: 'manifest.id', message: 'ID is required', code: 'REQUIRED_FIELD' }],
      warnings: [],
    };
    const output = formatValidationResult('test-skill', result, []);
    expect(output).toContain('ID is required');
  });

  it('includes warning messages when warnings are present', () => {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };
    const warnings: ValidationWarning[] = [
      { field: 'manifest.description', message: 'Description is too short', code: 'SHORT_DESCRIPTION' },
    ];
    const output = formatValidationResult('test-skill', result, warnings);
    expect(output).toContain('Description is too short');
    expect(output).toContain('\u26a0');
  });

  it('shows error count in plural for multiple errors', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        { field: 'manifest.id', message: 'ID is required', code: 'REQUIRED_FIELD' },
        { field: 'manifest.name', message: 'Name is required', code: 'REQUIRED_FIELD' },
      ],
      warnings: [],
    };
    const output = formatValidationResult('test-skill', result, []);
    expect(output).toContain('2 errors');
  });

  it('shows singular error count for one error', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [{ field: 'manifest.id', message: 'ID is required', code: 'REQUIRED_FIELD' }],
      warnings: [],
    };
    const output = formatValidationResult('test-skill', result, []);
    expect(output).toContain('1 error');
    expect(output).not.toContain('1 errors');
  });
});

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

describe('ANSI helpers', () => {
  it('bold wraps text in bold escape codes', () => {
    expect(bold('hi')).toBe('\x1b[1mhi\x1b[0m');
  });

  it('green wraps text in green escape codes', () => {
    expect(green('ok')).toBe('\x1b[32mok\x1b[0m');
  });

  it('red wraps text in red escape codes', () => {
    expect(red('err')).toBe('\x1b[31merr\x1b[0m');
  });

  it('yellow wraps text in yellow escape codes', () => {
    expect(yellow('warn')).toBe('\x1b[33mwarn\x1b[0m');
  });

  it('dim wraps text in dim escape codes', () => {
    expect(dim('muted')).toBe('\x1b[2mmuted\x1b[0m');
  });

  it('handles empty string', () => {
    expect(bold('')).toBe('\x1b[1m\x1b[0m');
  });
});

// ─── formatSkillSummary edge cases ───────────────────────────────────────────

describe('formatSkillSummary (edge cases)', () => {
  it('omits name prefix when name equals id', () => {
    const skill: Skill = {
      ...mockSkill,
      manifest: { ...mockSkill.manifest, id: 'same', name: 'same' },
    };
    const output = formatSkillSummary(skill);
    // name should not appear twice separated by em-dash
    expect(output).not.toContain('\u2014');
  });

  it('includes em-dash separator when name differs from id', () => {
    const output = formatSkillSummary(mockSkill);
    // mockSkill has id='test-skill', name='Test Skill'
    expect(output).toContain('\u2014');
  });

  it('includes the category in brackets', () => {
    const output = formatSkillSummary(mockSkill);
    expect(output).toContain('[workflow]');
  });
});

// ─── formatValidationResult edge cases ───────────────────────────────────────

describe('formatValidationResult (edge cases)', () => {
  it('includes field reference for each error', () => {
    const result: ValidationResult = {
      valid: false,
      errors: [{ field: 'manifest.version', message: 'Invalid semver', code: 'INVALID_FORMAT' }],
      warnings: [],
    };
    const output = formatValidationResult('test-skill', result, []);
    expect(output).toContain('[manifest.version]');
    expect(output).toContain('Invalid semver');
  });

  it('handles multiple warnings', () => {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };
    const warnings: ValidationWarning[] = [
      { field: 'manifest.description', message: 'Description is too short', code: 'SHORT_DESCRIPTION' },
      { field: 'manifest.tags', message: 'No tags provided', code: 'MISSING_TAGS' },
    ];
    const output = formatValidationResult('test-skill', result, warnings);
    expect(output).toContain('Description is too short');
    expect(output).toContain('No tags provided');
  });

  it('shows valid marker when no errors and no warnings', () => {
    const result: ValidationResult = { valid: true, errors: [], warnings: [] };
    const output = formatValidationResult('my-skill', result, []);
    expect(output).toContain('\u2713');
    expect(output).toContain('valid');
  });
});
