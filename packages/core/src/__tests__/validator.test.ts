import { describe, it, expect } from 'vitest';
import { SkillValidator } from '../validator';
import { Skill, SkillCategory, SkillRuntimeContext } from '../types';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    manifest: {
      id: 'test-skill',
      name: 'Test Skill',
      version: '1.0.0',
      description: 'A test skill',
      category: SkillCategory.WORKFLOW,
      tags: ['test'],
      author: 'test-author',
    },
    instructions: '# Test Skill\n\nDo the thing.',
    path: '/fake/path/test-skill',
    ...overrides,
  };
}

function makeContext(envOverrides: Record<string, string> = {}): SkillRuntimeContext {
  return {
    skill: makeSkill(),
    workingDirectory: '/tmp',
    environment: envOverrides,
    availableIntegrations: [],
  };
}

describe('SkillValidator', () => {
  const validator = SkillValidator.create();

  describe('validate()', () => {
    it('returns { valid: true, errors: [] } for a valid skill', () => {
      const result = validator.validate(makeSkill());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns an error when instructions are empty', () => {
      const skill = makeSkill({ instructions: '' });
      const result = validator.validate(skill);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'instructions')).toBe(true);
    });

    it('returns an error when instructions are whitespace only', () => {
      const skill = makeSkill({ instructions: '   \n\t  ' });
      const result = validator.validate(skill);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'EMPTY_INSTRUCTIONS')).toBe(true);
    });

    it('returns a warning when tags are empty', () => {
      const skill = makeSkill();
      skill.manifest.tags = [];
      const result = validator.validate(skill);
      expect(result.warnings.some(w => w.code === 'NO_TAGS')).toBe(true);
    });

    it('returns a warning when author is missing', () => {
      const skill = makeSkill();
      skill.manifest.author = undefined;
      const result = validator.validate(skill);
      expect(result.warnings.some(w => w.code === 'NO_AUTHOR')).toBe(true);
    });
  });

  describe('validateManifest()', () => {
    it('returns { valid: true } for a valid manifest object', () => {
      const manifest = {
        id: 'valid-skill',
        name: 'Valid Skill',
        version: '1.0.0',
        description: 'Valid description',
        category: 'workflow',
        tags: [],
      };
      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns { valid: false } when id is missing', () => {
      const manifest = {
        name: 'No ID Skill',
        version: '1.0.0',
        description: 'Missing id',
        category: 'workflow',
        tags: [],
      };
      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns { valid: false } when version is invalid semver', () => {
      const manifest = {
        id: 'bad-version',
        name: 'Bad Version',
        version: 'x.y.z-not-semver',
        description: 'desc',
        category: 'workflow',
        tags: [],
      };
      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
    });

    it('returns { valid: false } when category is unknown', () => {
      const manifest = {
        id: 'bad-cat',
        name: 'Bad Category',
        version: '1.0.0',
        description: 'desc',
        category: 'not-a-real-category',
        tags: [],
      };
      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEnvironment()', () => {
    it('returns { valid: true } when no environment requirements exist', () => {
      const skill = makeSkill();
      const ctx = makeContext();
      const result = validator.validateEnvironment(skill, ctx);
      expect(result.valid).toBe(true);
    });

    it('returns an error when a required envVar is missing', () => {
      const skill = makeSkill();
      skill.manifest.environment = [
        {
          name: 'github-token',
          description: 'GitHub API token',
          required: true,
          envVars: ['GITHUB_TOKEN_TEST_ONLY_XYZ123'],
        },
      ];
      const ctx = makeContext({});
      // Ensure the env var is not set in process.env either
      const result = validator.validateEnvironment(skill, ctx);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_ENV_VAR')).toBe(true);
    });

    it('returns only a warning (not an error) when an optional envVar is missing', () => {
      const skill = makeSkill();
      skill.manifest.environment = [
        {
          name: 'optional-token',
          description: 'Optional token for extra features',
          required: false,
          envVars: ['OPTIONAL_TOKEN_TEST_ONLY_XYZ123'],
        },
      ];
      const ctx = makeContext({});
      const result = validator.validateEnvironment(skill, ctx);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.some(w => w.code === 'OPTIONAL_ENV_VAR_MISSING')).toBe(true);
    });

    it('returns { valid: true } when required envVar is present in context', () => {
      const skill = makeSkill();
      skill.manifest.environment = [
        {
          name: 'api-key',
          description: 'API key',
          required: true,
          envVars: ['MY_API_KEY'],
        },
      ];
      const ctx = makeContext({ MY_API_KEY: 'secret-value' });
      const result = validator.validateEnvironment(skill, ctx);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns an error for missing required MCP server integration', () => {
      const skill = makeSkill();
      skill.manifest.integrations = [
        {
          name: 'My MCP',
          type: 'mcp',
          description: 'Required MCP server',
          required: true,
          mcpServer: 'my-mcp-server',
        },
      ];
      const ctx = makeContext();
      // availableIntegrations is empty, so my-mcp-server is missing
      const result = validator.validateEnvironment(skill, ctx);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_MCP_SERVER')).toBe(true);
    });

    it('returns { valid: true } when required MCP server is available', () => {
      const skill = makeSkill();
      skill.manifest.integrations = [
        {
          name: 'My MCP',
          type: 'mcp',
          description: 'Required MCP server',
          required: true,
          mcpServer: 'my-mcp-server',
        },
      ];
      const ctx: SkillRuntimeContext = {
        ...makeContext(),
        availableIntegrations: ['my-mcp-server'],
      };
      const result = validator.validateEnvironment(skill, ctx);
      expect(result.valid).toBe(true);
    });
  });
});
