import { z } from 'zod';
import { SkillManifest } from './types';

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

export const EnvironmentRequirementSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
  envVars: z.array(z.string().min(1)).optional(),
  tools: z.array(z.string().min(1)).optional(),
  platform: z.array(z.enum(['darwin', 'linux', 'win32'])).optional(),
  minNodeVersion: z.string().optional(),
  minPythonVersion: z.string().optional(),
});

export const IntegrationRequirementSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['mcp', 'api', 'tool', 'service']),
  description: z.string().min(1),
  required: z.boolean(),
  mcpServer: z.string().optional(),
  apiEndpoint: z.string().optional(),
  toolName: z.string().optional(),
  version: z.string().optional(),
});

export const HookBindingSchema = z.object({
  event: z.enum(['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'Notification']),
  matcher: z.string().optional(),
  command: z.string().min(1),
  description: z.string().min(1),
});

export const SkillExecutionHintsSchema = z.object({
  preferredModel: z.string().optional(),
  requiresUserConfirmation: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxIterations: z.number().int().positive().optional(),
  parallelizable: z.boolean().optional(),
  idempotent: z.boolean().optional(),
  destructive: z.boolean().optional(),
});

// ─── SkillCategory enum values ───────────────────────────────────────────────

const SkillCategorySchema = z.enum([
  'workflow',
  'tool_guide',
  'domain',
  'integration',
  'guardrail',
]);

const SkillVisibilitySchema = z.enum(['private', 'public']);

// ─── SemVer ──────────────────────────────────────────────────────────────────

const SemVerSchema = z.string().regex(/^\d+\.\d+\.\d+/, {
  message: 'Must be a valid semantic version (e.g. "1.0.0")',
});

// ─── SkillManifest ───────────────────────────────────────────────────────────

export const SkillManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: SemVerSchema,
  description: z.string().min(1),
  category: SkillCategorySchema,
  tags: z.array(z.string()),
  author: z.string().optional(),
  license: z.string().optional(),
  homepage: z.string().optional(),
  environment: z.array(EnvironmentRequirementSchema).optional(),
  integrations: z.array(IntegrationRequirementSchema).optional(),
  hooks: z.array(HookBindingSchema).optional(),
  execution: SkillExecutionHintsSchema.optional(),
  guardrails: z.array(z.string()).optional(),
  requires: z.array(z.string().min(1)).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  // Allow visibility field even though it's not in the main manifest interface
  // so that registry/distribution tooling can attach it without parse failures
  visibility: SkillVisibilitySchema.optional(),
});

// ─── parseManifest ────────────────────────────────────────────────────────────

/**
 * Parse and validate an unknown value as a SkillManifest.
 * Throws a descriptive error on failure.
 */
export function parseManifest(data: unknown): SkillManifest {
  const result = SkillManifestSchema.safeParse(data);
  if (result.success) {
    // Cast is safe: the schema shape matches SkillManifest exactly
    return result.data as unknown as SkillManifest;
  }

  const messages = result.error.issues
    .map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return `  [${path}] ${issue.message}`;
    })
    .join('\n');

  throw new Error(`Invalid skill manifest:\n${messages}`);
}
