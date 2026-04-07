/**
 * SkillForge Core Types
 *
 * The canonical domain model for the SkillForge portable skill system.
 * Every skill is a directory containing manifest.json + SKILL.md (+ optional assets).
 */

// ─── Primitives ─────────────────────────────────────────────────────────────

/** Unique skill identifier. Format: "{author}/{name}" or just "{name}" for first-party skills */
export type SkillId = string;

/** Semantic version string (e.g. "1.0.0") */
export type SemVer = string;

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Primary classification of a skill's purpose */
export enum SkillCategory {
  /** End-to-end task automation — a sequence of steps toward a goal */
  WORKFLOW = "workflow",
  /** How to use a specific tool, MCP server, or API */
  TOOL_GUIDE = "tool_guide",
  /** Domain expertise — reference knowledge for a topic area */
  DOMAIN = "domain",
  /** How to connect to and work with an external service */
  INTEGRATION = "integration",
  /** Safety, validation, and guardrail behaviors */
  GUARDRAIL = "guardrail",
}

/** Controls cloud/registry visibility (for future distribution) */
export enum SkillVisibility {
  PRIVATE = "private",
  PUBLIC = "public",
}

// ─── Requirements ───────────────────────────────────────────────────────────

/**
 * A runtime environment requirement the skill depends on.
 * Used for preflight validation before execution.
 */
export interface EnvironmentRequirement {
  /** Short identifier (e.g. "node", "python", "GITHUB_TOKEN") */
  name: string;
  /** Human-readable description of what this is for */
  description: string;
  /** If true, skill MUST have this; if false, skill degrades gracefully without it */
  required: boolean;
  /** Environment variable names that must be set */
  envVars?: string[];
  /** CLI tools that must be on PATH */
  tools?: string[];
  /** Supported host platforms */
  platform?: ("darwin" | "linux" | "win32")[];
  /** Minimum Node.js version required (semver range) */
  minNodeVersion?: string;
  /** Minimum Python version required (semver range) */
  minPythonVersion?: string;
}

/**
 * A required integration: MCP server, external API, or CLI tool.
 * Tells the runtime what capabilities must be available.
 */
export interface IntegrationRequirement {
  /** Display name of the integration */
  name: string;
  /** Integration kind */
  type: "mcp" | "api" | "tool" | "service";
  /** What this integration is used for in the skill */
  description: string;
  /** Whether the skill fails without this, or can degrade gracefully */
  required: boolean;
  /** MCP server name (for type: "mcp") */
  mcpServer?: string;
  /** API base URL or endpoint (for type: "api") */
  apiEndpoint?: string;
  /** CLI tool name (for type: "tool") */
  toolName?: string;
  /** Required version constraint */
  version?: string;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * A Claude hook binding — ties a shell command to a lifecycle event.
 * When a skill declares hooks, the runtime can install them for the session.
 *
 * Compatible with Claude Code's hooks system.
 */
export interface HookBinding {
  /** The Claude lifecycle event to bind to */
  event: "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "Stop" | "Notification";
  /** Optional tool name or pattern to match (for PreToolUse/PostToolUse) */
  matcher?: string;
  /** Shell command to execute when the hook fires */
  command: string;
  /** Human-readable description of what this hook does */
  description: string;
}

// ─── Execution ──────────────────────────────────────────────────────────────

/**
 * Hints to the runtime about how this skill should be executed.
 * None of these are hard constraints — they inform the execution environment.
 */
export interface SkillExecutionHints {
  /** Preferred Claude model ID (e.g. "claude-opus-4-6") */
  preferredModel?: string;
  /** If true, the runtime should pause and ask the user before proceeding */
  requiresUserConfirmation?: boolean;
  /** Suggested execution timeout in milliseconds */
  timeoutMs?: number;
  /** Suggested maximum agent iteration limit */
  maxIterations?: number;
  /** Whether this skill's tasks can be run in parallel */
  parallelizable?: boolean;
  /** Whether re-running produces the same result (safe to retry) */
  idempotent?: boolean;
  /** If true, display a destructive-action warning before execution */
  destructive?: boolean;
}

// ─── Manifest ───────────────────────────────────────────────────────────────

/**
 * The machine-readable descriptor for a skill.
 * Stored as manifest.json at the root of each skill directory.
 *
 * This is the schema-validated source of truth for skill metadata,
 * requirements, hooks, and execution hints.
 */
export interface SkillManifest {
  /** Unique skill identifier. Must be URL-safe. */
  id: SkillId;
  /** Human-readable skill name */
  name: string;
  /** Semantic version */
  version: SemVer;
  /** One-line description used for discovery and display */
  description: string;
  /** Primary category */
  category: SkillCategory;
  /** Search tags for discovery */
  tags: string[];
  /** Author name or identifier */
  author?: string;
  /** SPDX license identifier (e.g. "MIT") */
  license?: string;
  /** Link to documentation or repository */
  homepage?: string;
  /** Runtime environment requirements */
  environment?: EnvironmentRequirement[];
  /** External tool and service requirements */
  integrations?: IntegrationRequirement[];
  /** Claude hook bindings this skill wants active */
  hooks?: HookBinding[];
  /** Execution hints for the runtime */
  execution?: SkillExecutionHints;
  /** Guardrail descriptions — behaviors the skill enforces */
  guardrails?: string[];
  /** Skill IDs that must be available for this skill to function */
  requires?: string[];
  /** ISO 8601 creation timestamp */
  createdAt?: string;
  /** ISO 8601 last-updated timestamp */
  updatedAt?: string;
}

// ─── Skill ──────────────────────────────────────────────────────────────────

/** A usage example for a skill */
export interface SkillExample {
  name: string;
  description: string;
  input: string;
  expectedOutput?: string;
}

/**
 * A fully loaded skill — manifest plus instruction content.
 * This is the runtime representation returned by SkillLoader.
 */
export interface Skill {
  /** Validated manifest */
  manifest: SkillManifest;
  /** Full content of SKILL.md — the AI/human-readable instructions */
  instructions: string;
  /** Absolute filesystem path to the skill directory */
  path: string;
  /** Optional usage examples parsed from examples/ subdirectory */
  examples?: SkillExample[];
}

// ─── Runtime Context ────────────────────────────────────────────────────────

/**
 * Context provided to a skill at execution time.
 * The runtime constructs this before invoking a skill.
 */
export interface SkillRuntimeContext {
  /** The skill being executed */
  skill: Skill;
  /** Working directory for the execution */
  workingDirectory: string;
  /** Resolved environment variables */
  environment: Record<string, string>;
  /** Names of integrations/MCP servers currently available */
  availableIntegrations: string[];
  /** Unique session identifier */
  sessionId?: string;
  /** User identifier */
  userId?: string;
  /** Arbitrary runtime metadata */
  metadata?: Record<string, unknown>;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface ValidationError {
  /** Dot-path to the invalid field (e.g. "manifest.id", "environment[0].name") */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Machine-readable error code (e.g. "REQUIRED_FIELD", "INVALID_SEMVER") */
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// ─── Execution Plan ─────────────────────────────────────────────────────────

/** A single step in a skill execution plan */
export interface ExecutionStep {
  /** Unique step identifier within this plan */
  id: string;
  /** Display name */
  name: string;
  /** What this step does */
  description: string;
  /** IDs of steps this step depends on */
  dependsOn?: string[];
  /** Tool names used in this step */
  tools?: string[];
  /** If true, this step can be skipped on failure */
  optional?: boolean;
}

/**
 * A structured execution plan for a skill.
 * Built from the skill's instructions and context by the runtime.
 */
export interface ExecutionPlan {
  skill: Skill;
  context: SkillRuntimeContext;
  steps: ExecutionStep[];
  /** Rough estimate in milliseconds */
  estimatedDurationMs?: number;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export interface RegistryStats {
  total: number;
  byCategory: Record<string, number>;
  /** All unique tags across registered skills */
  tags: string[];
}

// ─── Interfaces ─────────────────────────────────────────────────────────────

/** Contract for loading skills from the filesystem */
export interface ISkillLoader {
  /** Discover skill directory paths under basePath */
  discover(basePath: string): Promise<string[]>;
  /** Load a single skill from skillPath (must contain manifest.json + SKILL.md) */
  load(skillPath: string): Promise<Skill>;
  /** Discover and load all skills under basePath */
  loadAll(basePath: string): Promise<Skill[]>;
}

/** Contract for the in-memory skill registry */
export interface ISkillRegistry {
  register(skill: Skill): void;
  get(id: SkillId): Skill | undefined;
  /** Full-text search across name, description, and tags */
  search(query: string): Skill[];
  list(): Skill[];
  byCategory(category: SkillCategory): Skill[];
  /** Return skills that have ALL of the given tags */
  byTags(tags: string[]): Skill[];
  clear(): void;
  stats(): RegistryStats;
}

/** Contract for skill validation */
export interface ISkillValidator {
  /** Validate an unknown object as a SkillManifest */
  validateManifest(manifest: unknown): ValidationResult;
  /** Validate a fully loaded skill */
  validate(skill: Skill): ValidationResult;
  /** Check environment requirements against the given context */
  validateEnvironment(skill: Skill, context: SkillRuntimeContext): ValidationResult;
}
