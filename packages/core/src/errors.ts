export class SkillForgeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SkillForgeError';
  }
}

export class SkillNotFoundError extends SkillForgeError {
  constructor(public readonly skillId: string) {
    super(`Skill not found: ${skillId}`, 'SKILL_NOT_FOUND');
    this.name = 'SkillNotFoundError';
  }
}

export class SkillLoadError extends SkillForgeError {
  constructor(public readonly path: string, cause: unknown) {
    super(`Failed to load skill at ${path}: ${cause instanceof Error ? cause.message : String(cause)}`, 'SKILL_LOAD_ERROR');
    this.name = 'SkillLoadError';
    if (cause instanceof Error) this.cause = cause;
  }
}

export class SkillValidationError extends SkillForgeError {
  constructor(public readonly errors: { field: string; message: string; code: string }[]) {
    super(`Skill validation failed: ${errors.map(e => e.message).join('; ')}`, 'SKILL_VALIDATION_ERROR');
    this.name = 'SkillValidationError';
  }
}

export class SkillAlreadyRegisteredError extends SkillForgeError {
  constructor(public readonly skillId: string) {
    super(`Skill already registered: ${skillId}`, 'SKILL_ALREADY_REGISTERED');
    this.name = 'SkillAlreadyRegisteredError';
  }
}

export class MissingRequirementError extends SkillForgeError {
  constructor(public readonly requirementName: string, public readonly skillId: string) {
    super(`Required environment/integration "${requirementName}" missing for skill "${skillId}"`, 'MISSING_REQUIREMENT');
    this.name = 'MissingRequirementError';
  }
}
