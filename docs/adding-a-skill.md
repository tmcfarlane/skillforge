# Adding a Skill to SkillForge

This guide covers everything you need to create a well-formed, discoverable skill for SkillForge — from directory structure through manifest fields, SKILL.md best practices, hook bindings, integration requirements, and a complete worked example.

---

## Skill Directory Structure

A skill is a directory. The name of the directory should match the skill's `id` in `manifest.json`. Two files are required; everything else is optional.

```
my-skill/
├── manifest.json          required — machine-readable metadata
├── SKILL.md               required — AI/human-readable instructions
└── examples/              optional — usage examples loaded at runtime
    ├── basic.json
    └── advanced.json
```

### Required files

**`manifest.json`** — The machine-readable descriptor. Parsed and validated with Zod when the skill is loaded. A skill with an invalid manifest will not be registered; the error is logged with a specific field path and message.

**`SKILL.md`** — The instruction document Claude reads and follows. Plain Markdown. No special format is enforced beyond being non-empty.

### Optional files

**`examples/`** — A subdirectory of `.json` files. Each file is loaded as a `SkillExample` object with fields `name`, `description`, `input`, and optionally `expectedOutput`. Examples are surfaced in `skillforge_get` responses and can help Claude understand the intended use of a skill.

---

## `manifest.json` Reference

All fields and their types, with notes on what the validator checks.

### Core identity fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | yes | Unique identifier. Must be URL-safe (no spaces, no special characters). Use `kebab-case`. First-party skills use `"name"` format; third-party use `"author/name"` |
| `name` | `string` | yes | Human-readable display name. Used in list/search results |
| `version` | `string` | yes | Semantic version: `"MAJOR.MINOR.PATCH"`. Must match `^\d+\.\d+\.\d+` |
| `description` | `string` | yes | One-line description. Used in full-text search and displayed in skill listings. Make it specific and action-oriented |
| `category` | `string` | yes | One of: `workflow`, `tool_guide`, `domain`, `integration`, `guardrail`. See the Categories Guide below |
| `tags` | `string[]` | yes | Search tags. An empty array is valid but generates a warning. Aim for 3–6 specific tags |

### Attribution fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `author` | `string` | no | Your name, username, or organization. Omitting generates a validator warning |
| `license` | `string` | no | SPDX identifier: `"MIT"`, `"Apache-2.0"`, `"ISC"`, etc. |
| `homepage` | `string` | no | URL to documentation, repository, or related resource |
| `createdAt` | `string` | no | ISO 8601 timestamp: `"2026-03-29T00:00:00Z"` |
| `updatedAt` | `string` | no | ISO 8601 timestamp of last modification |

### `environment` — runtime requirements

An array of `EnvironmentRequirement` objects. Use this to declare env vars, CLI tools, and platform constraints the skill depends on.

```json
"environment": [
  {
    "name": "GitHub credentials",
    "description": "GitHub API access for reading PR data",
    "required": true,
    "envVars": ["GITHUB_TOKEN"],
    "tools": ["gh"],
    "platform": ["darwin", "linux"]
  }
]
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | `string` | yes | Short identifier for this requirement |
| `description` | `string` | yes | What this requirement is for |
| `required` | `boolean` | yes | `true` = skill fails without it; `false` = skill degrades gracefully |
| `envVars` | `string[]` | no | Environment variable names that must be set |
| `tools` | `string[]` | no | CLI tool names that must be on `PATH` |
| `platform` | `string[]` | no | Allowed platforms: `"darwin"`, `"linux"`, `"win32"` |
| `minNodeVersion` | `string` | no | Minimum Node.js version (semver range) |
| `minPythonVersion` | `string` | no | Minimum Python version (semver range) |

`SkillValidator.validateEnvironment()` checks env vars against `process.env` and checks `availableIntegrations` from the runtime context.

### `integrations` — external tool dependencies

An array of `IntegrationRequirement` objects. Declares MCP servers, HTTP APIs, named tools, or other external services the skill requires.

```json
"integrations": [
  {
    "name": "Postgres MCP",
    "type": "mcp",
    "description": "Direct database access for schema inspection",
    "required": true,
    "mcpServer": "postgres"
  },
  {
    "name": "Web Search",
    "type": "tool",
    "description": "Web search for finding documentation",
    "required": false,
    "toolName": "WebSearch"
  }
]
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | `string` | yes | Display name for the integration |
| `type` | `string` | yes | One of: `"mcp"`, `"api"`, `"tool"`, `"service"` |
| `description` | `string` | yes | What the integration is used for |
| `required` | `boolean` | yes | Whether the skill fails without it |
| `mcpServer` | `string` | no | MCP server name (for `type: "mcp"`). Must match the key in `mcpServers` config |
| `apiEndpoint` | `string` | no | Base URL (for `type: "api"`) |
| `toolName` | `string` | no | Tool name (for `type: "tool"`) |
| `version` | `string` | no | Required version constraint |

### `hooks` — Claude lifecycle bindings

An array of `HookBinding` objects. Skills can declare hooks they want installed for the session. See the Hook Bindings section below.

### `execution` — runtime hints

A single `SkillExecutionHints` object. All fields are optional hints — the runtime is not required to honor them, but Claude Desktop and future runtimes use them for model selection, timeout configuration, and safety prompts.

```json
"execution": {
  "preferredModel": "claude-opus-4-6",
  "requiresUserConfirmation": true,
  "timeoutMs": 300000,
  "maxIterations": 50,
  "parallelizable": false,
  "idempotent": false,
  "destructive": true
}
```

| Field | Type | Notes |
|-------|------|-------|
| `preferredModel` | `string` | Claude model ID to prefer (e.g. `"claude-opus-4-6"`) |
| `requiresUserConfirmation` | `boolean` | If `true`, runtime should pause and ask before proceeding |
| `timeoutMs` | `number` | Suggested execution timeout in milliseconds |
| `maxIterations` | `number` | Suggested agent iteration limit |
| `parallelizable` | `boolean` | Whether this skill's tasks can run in parallel |
| `idempotent` | `boolean` | Whether re-running produces the same result (safe to retry) |
| `destructive` | `boolean` | If `true`, show a destructive-action warning before execution |

### `guardrails` — behavioral constraints

An array of plain-English strings describing constraints the skill enforces. These are surfaced by `skillforge_get` and should be echoed in SKILL.md as well, so Claude encounters them both in the manifest and in the instructions.

```json
"guardrails": [
  "Never modify production data without explicit user confirmation",
  "Always verify the backup exists before applying destructive changes"
]
```

---

## SKILL.md Best Practices

SKILL.md is what Claude reads and acts on. The quality of your SKILL.md determines the quality of skill execution.

### Recommended structure

```markdown
# Skill Name

## When to Use This Skill
[Describe the scenarios where this skill should be invoked. Be specific
about preconditions — what must be true before the skill can run.]

## Workflow
[Numbered steps the agent follows. Each step should be atomic and
actionable. Include decision points ("if X, then Y") where relevant.]

## Reference Material
[Tables, checklists, severity classifications, or other reference data
Claude will consult during execution.]

## Output Format
[Describe the expected structure of the skill's output. Include a
template or example if the format is non-obvious.]

## Guardrails
[Behavioral constraints — echo the `guardrails` from manifest.json
here in prose form, with explanation of why each constraint exists.]
```

### What makes a good SKILL.md

- **Be explicit about triggers.** "Use this skill when..." is more useful than leaving invocation to inference.
- **Number your steps.** Numbered workflows are easier for Claude to track and for humans to audit.
- **Include decision points.** If the workflow branches, spell out the conditions: "If the migration script contains `DROP TABLE`, require explicit user confirmation before proceeding."
- **Provide examples.** Short inline examples are more effective than abstract descriptions.
- **Name your output format.** If you want a specific output structure, provide a template. Claude will follow it.
- **Echo guardrails in prose.** The `guardrails` array in the manifest is machine-readable metadata. SKILL.md is what Claude reads. Put the constraints in both places with explanation.
- **Keep each step focused.** A step that does three things should be three steps.

### Invocation triggers

Make the "when to use" section specific enough that Claude can decide autonomously whether to invoke the skill. Weak: "Use this skill for database work." Strong: "Use this skill when the user asks to apply a schema change to a database, mentions a migration script, or says words like 'add column', 'drop table', or 'alter schema'."

---

## Categories Guide

Choose the category that best describes the primary purpose of your skill.

| Category | Use when your skill... | Examples |
|----------|----------------------|---------|
| `workflow` | Defines a multi-step end-to-end process toward a goal | code-review, database-migration, incident-response |
| `tool_guide` | Explains how to use a specific tool, MCP server, or API | how-to-use-github-mcp, postgres-query-patterns |
| `domain` | Provides reference knowledge and expertise for a topic area | security-threat-modeling, api-design-principles |
| `integration` | Covers how to connect to and configure an external service | setup-stripe-webhooks, configure-datadog |
| `guardrail` | Defines safety, validation, and behavioral constraints | production-safety-checks, pii-handling-policy |

A skill can have elements of multiple categories — choose the one that dominates. A "how to migrate a Postgres database" skill is `workflow`, not `integration`, because the primary value is the process, not the connection setup.

---

## Worked Example: Database Migration Skill

This section walks through creating a `database-migration` skill from scratch.

### Step 1: Create the directory

```bash
mkdir skills/database-migration
```

### Step 2: Write `manifest.json`

```json
{
  "id": "database-migration",
  "name": "Database Migration",
  "version": "1.0.0",
  "description": "Safe, step-by-step database schema migration workflow with validation and rollback support",
  "category": "workflow",
  "tags": ["database", "migration", "sql", "schema", "postgres", "safety"],
  "author": "your-name",
  "license": "MIT",
  "environment": [
    {
      "name": "Database connection",
      "description": "Connection credentials for the target database",
      "required": true,
      "envVars": ["DATABASE_URL"]
    }
  ],
  "integrations": [
    {
      "name": "Database MCP",
      "type": "mcp",
      "description": "Direct database access for schema inspection and migration execution",
      "required": true,
      "mcpServer": "postgres"
    }
  ],
  "execution": {
    "preferredModel": "claude-opus-4-6",
    "requiresUserConfirmation": true,
    "destructive": true,
    "idempotent": false,
    "timeoutMs": 120000
  },
  "guardrails": [
    "Never apply a migration without first verifying a backup exists or getting explicit user confirmation to proceed without one",
    "Always run migrations inside a transaction so rollback is possible",
    "Never modify a production database schema without explicit user confirmation",
    "Flag any destructive operations (DROP, TRUNCATE, column removal) before executing"
  ],
  "createdAt": "2026-03-29T00:00:00Z"
}
```

### Step 3: Write `SKILL.md`

```markdown
# Database Migration Skill

## When to Use This Skill

Use this skill when the user wants to:
- Apply a schema migration to a database
- Add, remove, or alter columns, tables, or indexes
- Run a migration script (`.sql` file or inline SQL)
- Review a migration for safety before applying it

Activate when the user says: "run this migration", "apply schema changes",
"add a column to X", "drop table Y", or provides a SQL DDL statement.

## Pre-flight Checks

Before executing any migration:

1. **Verify backup** — Ask the user to confirm a recent backup exists. If they
   cannot confirm, warn them and require explicit acknowledgment to continue.

2. **Inspect current schema** — Use the database MCP to read the current schema
   for the affected tables. Display it so the user can verify the baseline.

3. **Parse the migration** — Read the migration SQL. Identify:
   - Destructive operations (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`)
   - Potentially slow operations on large tables (`ADD COLUMN`, `CREATE INDEX`)
   - Operations that require exclusive locks

4. **Flag destructive operations** — If any destructive operations are present,
   list them explicitly and require the user to confirm each one before proceeding.

## Migration Workflow

1. **Wrap in a transaction** — Ensure the migration runs inside `BEGIN` / `COMMIT`.
   If the migration already includes transaction management, verify it.

2. **Apply the migration** — Execute the SQL via the database MCP.

3. **Verify the result** — Query the schema after migration to confirm the changes
   match expectations. Show the before/after diff.

4. **Report outcome** — Summarize what changed, how long it took, and any warnings.
   If the migration failed, show the error and the rollback status.

## Rollback Procedure

If a migration fails mid-execution:

1. Report the exact error and the last successful statement.
2. If inside a transaction: confirm the transaction was rolled back.
3. If not in a transaction: identify what was applied and provide a
   compensating migration to restore the previous state.

## Output Format

```
## Migration Report

**Status:** SUCCESS | FAILED | ROLLED BACK
**Duration:** Xms
**Target:** <database name> / <schema>

### Changes Applied
- [list of DDL statements executed]

### Schema Diff
[before/after for affected tables]

### Warnings
[any slow operations, lock concerns, or skipped steps]
```

## Guardrails

1. **Never skip the backup check.** Data loss from an accidental DROP is not
   recoverable without a backup. Even if the user is in a hurry, surface the risk.

2. **Always use a transaction.** A migration that fails halfway through leaves
   the schema in an inconsistent state. Wrap everything in BEGIN/COMMIT.

3. **No production changes without explicit confirmation.** If the database URL
   contains "prod", "production", or "live", require the user to type "confirm"
   before executing.

4. **Flag destructive operations before executing.** Do not assume the user
   read their own migration carefully. Surface DROP and TRUNCATE statements
   prominently and get confirmation.
```

### Step 4: Add an example (optional)

Create `skills/database-migration/examples/add-column.json`:

```json
{
  "name": "Add a column to users table",
  "description": "Demonstrates adding a nullable column with a default value",
  "input": "Add a `last_login_at` timestamp column (nullable) to the users table",
  "expectedOutput": "Migration applied: ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL. Schema verified. 1 column added."
}
```

### Step 5: Restart the MCP server

Restart Claude Desktop (or the MCP server process). The `database-migration` skill will appear in `skillforge_list`.

---

## Validation

### Running validation

The easiest way to validate a skill is via the MCP tool:

```
skillforge_validate  { "id": "database-migration" }
```

This returns a `ValidationResult`:

```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    {
      "field": "manifest.author",
      "message": "No author specified",
      "code": "NO_AUTHOR"
    }
  ]
}
```

You can also run TypeScript typecheck across the whole project:

```bash
pnpm typecheck
```

This catches TypeScript errors in the packages but does not validate skill directories — use `skillforge_validate` for that.

### What errors mean

| Code | Meaning | Fix |
|------|---------|-----|
| `REQUIRED_FIELD` | A required manifest field is missing | Add the field |
| `INVALID_SEMVER` | `version` does not match `X.Y.Z` format | Use `"1.0.0"` format |
| `INVALID_ENUM_VALUE` | `category` or integration `type` is not a known value | Use one of the documented enum values |
| `EMPTY_INSTRUCTIONS` | SKILL.md is empty | Add content to SKILL.md |
| `MISSING_PATH` | Skill has no path (internal error) | Reload the skill |
| `SKILL_LOAD_ERROR` | manifest.json or SKILL.md could not be read | Check file names (case-sensitive) and JSON validity |

### What warnings mean

| Code | Meaning |
|------|---------|
| `NO_TAGS` | `tags` array is empty — skill will be harder to discover via search |
| `NO_AUTHOR` | `author` field is missing |
| `OPTIONAL_ENV_VAR_MISSING` | An optional env var is not set — some features may be unavailable |

Warnings do not prevent a skill from loading or being used. They are informational.

---

## Hook Bindings

Skills can declare Claude lifecycle hooks. When the skill is active, these hooks can be installed for the session.

```json
"hooks": [
  {
    "event": "PreToolUse",
    "matcher": "Bash",
    "command": "echo '[database-migration] bash command about to run' >&2",
    "description": "Log shell commands for audit trail during migration"
  },
  {
    "event": "Stop",
    "command": "echo '[database-migration] agent turn complete' >&2",
    "description": "Signal when the agent finishes a turn"
  }
]
```

### Available events

| Event | When it fires | `matcher` supported? |
|-------|--------------|---------------------|
| `PreToolUse` | Before Claude calls a tool | yes — match by tool name |
| `PostToolUse` | After a tool call completes | yes — match by tool name |
| `UserPromptSubmit` | When the user submits a prompt | no |
| `Stop` | When Claude's response ends | no |
| `Notification` | When a session notification fires | no |

### `matcher` field

For `PreToolUse` and `PostToolUse`, `matcher` narrows which tool triggers the hook. If omitted, the hook fires for every tool call. Use this to audit specific tools (e.g. `"Bash"`, `"Write"`) without noisy output on every call.

### Hook installation

Hook declarations in the manifest are metadata — they describe what hooks the skill wants. The runtime (Claude Desktop or Claude Code) is responsible for actually installing them. Future SkillForge tooling will automate hook installation when a skill is activated.

---

## Integration Requirements

Declaring integrations lets the validator check whether required dependencies are available before the skill runs.

### MCP server dependency

```json
{
  "name": "Postgres",
  "type": "mcp",
  "description": "Database access for schema inspection",
  "required": true,
  "mcpServer": "postgres"
}
```

The `mcpServer` value must match the key used in `claude_desktop_config.json`'s `mcpServers` object. At runtime, `SkillValidator.validateEnvironment()` checks whether `"postgres"` appears in `context.availableIntegrations`.

### API dependency

```json
{
  "name": "GitHub API",
  "type": "api",
  "description": "Fetch PR metadata and diff",
  "required": true,
  "apiEndpoint": "https://api.github.com"
}
```

### Tool dependency

```json
{
  "name": "Web Search",
  "type": "tool",
  "description": "Search the web for documentation",
  "required": false,
  "toolName": "WebSearch"
}
```

`required: false` means the skill will load and run even if this tool is unavailable, but some features will be degraded. Document the degradation in SKILL.md.

---

## Publishing and Distribution

SkillForge currently works locally — skills live in a directory on your filesystem. Distribution is planned for a future release.

**Planned features:**
- `skillforge publish` — validate, package, and push a skill to a registry
- `skillforge install <id>` — pull a skill by ID and version into your local skills directory
- Namespaced IDs (`"author/skill-name"`) for third-party skills
- Version constraints and dependency resolution
- Public/private visibility control (the `visibility` field is already supported in the schema)

Until the distribution tooling ships, share skills by copying the skill directory or publishing it as a git repository.

---

## Common Mistakes

**Wrong file names.** The loader looks for exactly `manifest.json` and `SKILL.md` (case-sensitive). `Manifest.json`, `skill.md`, and `manifest.JSON` will not be found.

**Invalid JSON in manifest.json.** A syntax error in `manifest.json` causes a `SKILL_LOAD_ERROR`. Validate your JSON before saving — most editors will highlight syntax errors.

**`id` doesn't match directory name.** The convention is that the directory name and the `id` field match. Mismatches don't cause errors but create confusion when reading the filesystem.

**`version` in wrong format.** `"1.0"` and `"v1.0.0"` both fail validation. Use `"1.0.0"` (three numeric segments, no `v` prefix).

**`category` value not in the enum.** Categories are exact strings: `workflow`, `tool_guide`, `domain`, `integration`, `guardrail`. Anything else (including `"Workflow"` or `"tool-guide"`) fails validation.

**Empty SKILL.md.** The validator checks that SKILL.md is non-empty. A file with only whitespace also fails. Add at minimum a one-line description of what the skill does.

**Declaring `required: true` for a tool that isn't always available.** If you declare a required MCP server, every user who doesn't have that server configured will get a validation error. Use `required: false` for tools that are common but not universal, and document the degradation in SKILL.md.

**Guardrails only in the manifest, not in SKILL.md.** Claude reads SKILL.md, not the manifest, during execution. If you want Claude to respect a guardrail, it must appear in SKILL.md. The `guardrails` field in the manifest is metadata for tooling; SKILL.md is what drives behavior.
