import { ISkillValidator, Skill, SkillRuntimeContext, ValidationResult, ValidationError, ValidationWarning } from './types';
import { SkillManifestSchema } from './schema';
import { ZodError } from 'zod';

export class SkillValidator implements ISkillValidator {

  static create(): SkillValidator {
    return new SkillValidator();
  }

  validateManifest(manifest: unknown): ValidationResult {
    const result = SkillManifestSchema.safeParse(manifest);
    if (result.success) {
      return { valid: true, errors: [], warnings: [] };
    }
    return {
      valid: false,
      errors: this.zodErrorToValidationErrors(result.error),
      warnings: [],
    };
  }

  validate(skill: Skill): ValidationResult {
    const manifestResult = this.validateManifest(skill.manifest);
    const errors: ValidationError[] = [...manifestResult.errors];
    const warnings: ValidationWarning[] = [...manifestResult.warnings];

    if (!skill.instructions || skill.instructions.trim().length === 0) {
      errors.push({ field: 'instructions', message: 'SKILL.md is empty', code: 'EMPTY_INSTRUCTIONS' });
    }

    if (!skill.path) {
      errors.push({ field: 'path', message: 'Skill path is missing', code: 'MISSING_PATH' });
    }

    if (!skill.manifest.tags || skill.manifest.tags.length === 0) {
      warnings.push({ field: 'manifest.tags', message: 'No tags specified — skill will be harder to discover', code: 'NO_TAGS' });
    }

    if (!skill.manifest.author) {
      warnings.push({ field: 'manifest.author', message: 'No author specified', code: 'NO_AUTHOR' });
    }

    if (skill.manifest.requires && skill.manifest.requires.length > 0) {
      warnings.push({
        field: 'manifest.requires',
        message: `Skill has ${skill.manifest.requires.length} declared dependenc${skill.manifest.requires.length === 1 ? 'y' : 'ies'}: [${skill.manifest.requires.join(', ')}] — ensure these are loaded before use`,
        code: 'HAS_DEPENDENCIES',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  validateEnvironment(skill: Skill, context: SkillRuntimeContext): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const req of skill.manifest.environment ?? []) {
      for (const envVar of req.envVars ?? []) {
        if (!context.environment[envVar] && !process.env[envVar]) {
          if (req.required) {
            errors.push({
              field: `environment.${envVar}`,
              message: `Required environment variable "${envVar}" is not set (needed by: ${req.description})`,
              code: 'MISSING_ENV_VAR',
            });
          } else {
            warnings.push({
              field: `environment.${envVar}`,
              message: `Optional environment variable "${envVar}" is not set — some features may be unavailable`,
              code: 'OPTIONAL_ENV_VAR_MISSING',
            });
          }
        }
      }

      // Platform check
      if (req.platform && req.platform.length > 0) {
        const platform = process.platform as 'darwin' | 'linux' | 'win32';
        if (!req.platform.includes(platform)) {
          if (req.required) {
            errors.push({
              field: `environment.platform`,
              message: `Skill requires platform ${req.platform.join(' or ')} but running on ${platform}`,
              code: 'UNSUPPORTED_PLATFORM',
            });
          }
        }
      }
    }

    // Check integration availability
    for (const integration of skill.manifest.integrations ?? []) {
      if (integration.required) {
        if (integration.type === 'mcp' && integration.mcpServer) {
          if (!context.availableIntegrations.includes(integration.mcpServer)) {
            errors.push({
              field: `integrations.${integration.name}`,
              message: `Required MCP server "${integration.mcpServer}" is not available`,
              code: 'MISSING_MCP_SERVER',
            });
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private zodErrorToValidationErrors(error: ZodError): ValidationError[] {
    return error.issues.map(issue => ({
      field: issue.path.join('.') || 'root',
      message: issue.message,
      code: issue.code.toUpperCase(),
    }));
  }
}
