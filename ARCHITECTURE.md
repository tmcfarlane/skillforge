# SkillForge Architecture

## Vision

SkillForge is a portable skill packaging system for Claude Desktop. Its premise is that agent
behavior should be authored as self-contained, versioned artifacts that work independently of any
particular runtime. A skill is a directory: a machine-readable manifest declaring its metadata and
requirements, plus a plain-Markdown instruction document that Claude reads and follows. Authors
write skills once and use them anywhere Claude Desktop is running — no compilation, no cloud
dependency, no account required.

---

## Design Principles

**Portability.** A skill directory is fully self-contained. Copy it anywhere, point the loader at
it, and it works. No registry account is required for local use.

**Composability.** Skills declare what they need (environment variables, MCP servers, CLI tools)
rather than embedding those details in prose. The dependency graph is queryable. Future
orchestration layers can chain skills whose outputs satisfy each other's inputs.

**Reliability.** Manifests are validated with Zod schemas at load time. A bad manifest fails
loudly before execution rather than silently producing wrong behavior. The validator distinguishes
hard errors from soft warnings so authors get actionable feedback.

**Clarity.** The MCP server is intentionally thin: load skills, index them, respond to four tool
calls. Intelligence lives in SKILL.md, not in the server. Authors write instructions in plain
language without learning a DSL.

---

## System Overview

```
Author writes skill/ directory
        |
manifest.json (JSON Schema via Zod) + SKILL.md (AI instructions)
        |
FileSystemSkillLoader.loadAll()
        |
SkillValidator.validate()
        |
SkillRegistry (in-memory, searchable)
        |
   +----+------------------------+
   |                             |
@skillforge/mcp           @skillforge/cli
(Claude Desktop via MCP)  (developer tooling)
   |                             |
Claude reads SKILL.md    skillforge list/validate/etc.
and follows workflow
```

The MCP server and CLI are independent consumers of the same `@skillforge/core` primitives. Both
are thin shells around the loader, registry, and validator.

---

## Package Breakdown

### `@skillforge/core`

The domain model and runtime logic. Has no dependency on MCP or Claude Desktop; it can be used
from any Node.js program.

| Module | Responsibility |
|--------|---------------|
| `types.ts` | All TypeScript interfaces and enums — the canonical domain model |
| `schema.ts` | Zod schemas derived from the types; `parseManifest()` entry point |
| `errors.ts` | Typed error classes: `SkillNotFoundError`, `SkillLoadError`, `SkillValidationError`, `SkillAlreadyRegisteredError`, `MissingRequirementError` |
| `loader.ts` | `FileSystemSkillLoader` — discovers skill directories, reads files, calls `parseManifest()` |
| `registry.ts` | `SkillRegistry` — in-memory map with search, category filter, tag filter, stats |
| `validator.ts` | `SkillValidator` — validates loaded skills and runtime environment requirements |
| `hooks.ts` | `HookManager` — converts `HookBinding[]` to Claude settings.json format and writes it |
| `config.ts` | `loadConfig()` / `loadConfigSync()` — reads `skillforge.config.json` or `.skillforgerc` with upward directory search |
| `index.ts` | Public re-exports for all of the above |

**Runtime dependencies:** `zod` only. No other production dependencies.

### `@skillforge/mcp`

The Claude Desktop integration layer. Wraps `@skillforge/core` in an MCP server that speaks the
Model Context Protocol over stdio.

| Module | Responsibility |
|--------|---------------|
| `server.ts` | `SkillForgeMcpServer` — creates the MCP server, registers four tool handlers, loads skills on `start()` |
| `index.ts` | Entry point; instantiates and starts the server when run directly |

**Dependencies:** `@modelcontextprotocol/sdk`, `@skillforge/core`.

Skills are loaded at startup from `SKILLFORGE_SKILLS_PATH` (env var) or `./skills` relative to the
server's working directory. Individual skill load failures emit warnings to stderr but do not crash
the server — partial availability is better than total unavailability. The registry uses
`registerOrUpdate()` so restarts are safe.

### `@skillforge/cli`

Developer tooling for working with skills locally. Built with `commander`.

| Command | Description |
|---------|-------------|
| `skillforge list` | List all skills with id, name, category, tags, description. Supports `--json` |
| `skillforge info <id>` | Show full skill details: manifest fields, environment requirements, integrations, hooks, and a 20-line instructions preview |
| `skillforge search <query>` | Full-text search across names, descriptions, and tags. Supports `--json` |
| `skillforge validate [id]` | Validate one skill by ID or all skills; exits non-zero on errors |
| `skillforge stats` | Show total skill count, breakdown by category, and all unique tags |
| `skillforge hooks` | Preview the hooks config JSON that would be generated from loaded skills (no write) |
| `skillforge install-hooks` | Write skill hooks into `~/.claude/settings.json`. Supports `--dry-run` and `--settings-path` |
| `skillforge new <id>` | Scaffold a new skill directory with a manifest.json stub and SKILL.md template |

All commands accept `--skills-path <path>` to override the default. The default resolves in order:
`--skills-path` flag > `SKILLFORGE_SKILLS_PATH` env var > `./skills`.

---

## Core Primitives

| Primitive | One-line description |
|-----------|---------------------|
| `Skill` | The fully loaded runtime object — manifest, instructions string, absolute path, optional examples |
| `SkillManifest` | Machine-readable JSON descriptor stored as `manifest.json`; Zod-validated at load |
| `FileSystemSkillLoader` | Discovers skill directories under a base path, reads and parses each one |
| `SkillRegistry` | In-memory index supporting get-by-id, full-text search, category filter, tag filter, and stats |
| `SkillValidator` | Validates manifests (Zod), loaded skills (non-empty instructions, tag presence), and runtime environment requirements |
| `SkillRuntimeContext` | Execution-time context: working directory, resolved env vars, available integrations, session ID |
| `IntegrationRequirement` | Declares a dependency on an MCP server, HTTP API, named tool, or external service |
| `HookBinding` | Binds a shell command to a Claude Code lifecycle event (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `Notification`) |
| `EnvironmentRequirement` | Declares required env vars, CLI tools on PATH, supported platforms, or minimum language versions |
| `SkillExecutionHints` | Hints to the runtime: preferred model, confirmation required, timeout, max iterations, parallelizable, idempotent, destructive |
| `HookManager` | Static class that converts `HookBinding[]` to Claude settings.json format, merges with existing config, and writes the file |

---

## Skill Format

Every skill is a directory with two required files and one optional subdirectory:

```
my-skill/
├── manifest.json     required — machine-readable metadata and requirements
├── SKILL.md          required — AI/human-readable instructions
└── examples/         optional — usage examples as JSON files
    └── basic.json
```

### `manifest.json` Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | yes | Unique identifier. URL-safe. Format: `"name"` (first-party) or `"author/name"` (third-party) |
| `name` | `string` | yes | Human-readable display name |
| `version` | `string` | yes | Semantic version: `"MAJOR.MINOR.PATCH"` |
| `description` | `string` | yes | One-line description used for search and display |
| `category` | `SkillCategory` | yes | One of: `workflow`, `tool_guide`, `domain`, `integration`, `guardrail` |
| `tags` | `string[]` | yes | Search tags. Empty array is valid but produces a warning during validation |
| `author` | `string` | no | Author name or identifier |
| `license` | `string` | no | SPDX license identifier (e.g. `"MIT"`) |
| `homepage` | `string` | no | URL to documentation or repository |
| `environment` | `EnvironmentRequirement[]` | no | Runtime environment requirements (env vars, CLI tools, platform constraints) |
| `integrations` | `IntegrationRequirement[]` | no | Required MCP servers, APIs, tools, or external services |
| `hooks` | `HookBinding[]` | no | Claude Code lifecycle hook bindings |
| `execution` | `SkillExecutionHints` | no | Hints to the runtime about model, timeouts, parallelism, safety |
| `guardrails` | `string[]` | no | Human-readable safety/behavioral constraints the skill enforces |
| `createdAt` | `string` | no | ISO 8601 creation timestamp |
| `updatedAt` | `string` | no | ISO 8601 last-updated timestamp |

The Zod schema lives in `packages/core/src/schema.ts`. `parseManifest(unknown)` is the single
entry point — it throws `SkillLoadError` on validation failure with structured field-level errors.

### `SKILL.md` Purpose

SKILL.md is the primary artifact Claude reads when executing a skill. It is plain Markdown and
typically contains:

- **When to use** — triggers, preconditions, ideal use cases
- **Process** — numbered steps or workflow the agent follows
- **Output format** — expected structure of the skill's result
- **Guardrails** — behavioral constraints in prose form

Because Claude is the execution engine, SKILL.md can be as expressive as plain language allows:
conditional logic, multi-step branching, checklists, decision tables, and worked examples are all
valid and encouraged.

---

## Skill Lifecycle

```
1. Author
   Author creates a skill directory with manifest.json + SKILL.md.
   Optionally adds examples/ JSON files and declares requirements.

2. Scaffold  (skillforge new <id>)
   The CLI generates a manifest.json stub and a SKILL.md template
   in the target skills directory. The manifest is pre-populated with
   sensible defaults (version "1.0.0", MIT license, claude-sonnet-4-6).

3. Validate  (skillforge validate [id])
   SkillValidator.validate(skill) runs Zod schema checks, verifies
   SKILL.md is non-empty, and emits warnings for missing tags or author.
   Exits non-zero if any errors are found. Runs independently of MCP.

4. Load  (FileSystemSkillLoader.loadAll())
   Discovers directories containing manifest.json, runs parseManifest()
   (Zod), reads SKILL.md into memory, loads examples/ JSON files.
   Returns Skill[]. Individual failures are surfaced as SkillLoadError.

5. Register  (SkillRegistry.register / registerOrUpdate)
   Indexes each Skill by its ID. register() throws SkillAlreadyRegisteredError
   on duplicates; registerOrUpdate() silently overwrites — used by the MCP
   server on startup so restarts are safe.

6. Discover  (skillforge_list / skillforge_search)
   Claude Desktop queries the MCP server. skillforge_list returns all
   registered skills; skillforge_search runs full-text match across
   name, description, and tags.

7. Execute  (skillforge_get -> Claude reads SKILL.md)
   Claude calls skillforge_get to retrieve the full skill including
   SKILL.md content, then reads and follows the instructions.
   Declared hooks, integrations, and guardrails shape agent behavior.
```

---

## HookManager

Skills can declare `HookBinding` entries in `manifest.json` to install Claude Code lifecycle hooks.
The three-part flow is:

1. **Declaration** — `manifest.hooks[]` names the event, optional tool matcher, shell command, and
   a human-readable description.

2. **Conversion** — `HookManager.toClaudeConfig(bindings)` groups bindings by event name, then by
   matcher, producing the nested structure Claude Code expects in `settings.json`.

3. **Installation** — `HookManager.install(skills, settingsPath?)` reads the current
   `~/.claude/settings.json`, merges new hooks (deduplicating by command string), and writes the
   file back atomically. It creates the `.claude/` directory if it does not exist.

The CLI exposes this via `skillforge install-hooks` (writes) and `skillforge hooks` (preview only).
`--dry-run` on `install-hooks` calls `HookManager.preview()` and prints the config without writing.

### Claude settings.json hook format

After installation the relevant portion of `~/.claude/settings.json` looks like:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "echo '[skill] about to run bash'" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "notify-done.sh" }
        ]
      }
    ]
  }
}
```

Hooks without a `matcher` field are grouped under a matcher-less entry (matches all tools for
`PreToolUse`/`PostToolUse`). Existing hooks in `settings.json` are preserved; only new commands
are appended.

### Available Hook Events

| Event | Fires when |
|-------|-----------|
| `PreToolUse` | Before Claude calls any tool. `matcher` can narrow to a specific tool name |
| `PostToolUse` | After a tool call completes |
| `UserPromptSubmit` | When the user submits a prompt |
| `Stop` | When Claude's response is complete |
| `Notification` | When a notification fires in the session |

---

## Claude Desktop Integration

SkillForge integrates with Claude Desktop as an MCP server over stdio. Add to your
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "skillforge": {
      "command": "node",
      "args": ["/absolute/path/to/skillforge/packages/mcp/dist/index.js"],
      "env": {
        "SKILLFORGE_SKILLS_PATH": "/absolute/path/to/your/skills"
      }
    }
  }
}
```

On macOS the config file lives at:
`~/Library/Application Support/Claude/claude_desktop_config.json`

`SKILLFORGE_SKILLS_PATH` tells the server where to find skill directories. If omitted, it defaults
to `./skills` relative to the server's working directory (usually not what you want — set it
explicitly).

Once configured, Claude Desktop has access to four MCP tools:

| Tool | Description |
|------|-------------|
| `skillforge_list` | Returns all registered skills with id, name, version, description, category, and tags |
| `skillforge_search` | Full-text search across skill names, descriptions, and tags; returns matching subset |
| `skillforge_get` | Returns the complete skill: manifest + full SKILL.md content + examples |
| `skillforge_validate` | Runs `SkillValidator.validate()` on a skill and returns errors and warnings |

Claude can discover and invoke skills autonomously: search for relevant skills, retrieve their
instructions via `skillforge_get`, and follow the documented workflow.

---

## Config File

SkillForge reads project configuration from `skillforge.config.json` or `.skillforgerc` (both are
plain JSON). `loadConfig()` searches upward from the current directory, checking up to 6 levels,
and picks the first file found. If no config file is found it falls back to environment variables,
then hardcoded defaults.

### All fields

| Field | Env var override | Default | Description |
|-------|-----------------|---------|-------------|
| `skillsPath` | `SKILLFORGE_SKILLS_PATH` | `./skills` | Path to the skills directory |
| `defaultAuthor` | `SKILLFORGE_DEFAULT_AUTHOR` | `""` | Author name pre-filled by `skillforge new` |
| `defaultLicense` | `SKILLFORGE_DEFAULT_LICENSE` | `"MIT"` | License pre-filled by `skillforge new` |
| `claudeSettingsPath` | `SKILLFORGE_CLAUDE_SETTINGS_PATH` | `~/.claude/settings.json` | Target for `install-hooks` |
| `verbose` | `SKILLFORGE_VERBOSE=1` | `false` | Enable verbose output |

Example `skillforge.config.json`:

```json
{
  "skillsPath": "./my-skills",
  "defaultAuthor": "acme-corp",
  "defaultLicense": "Apache-2.0"
}
```

`loadConfigSync()` is also exported for contexts where async is unavailable — it reads only
environment variables and returns defaults; it does not search for config files.

---

## Test Coverage

The test suite has 76 tests across two packages:

- **`@skillforge/core`** — 64 tests across 6 test files covering schema parsing, loader, registry,
  validator, hooks (HookManager), and config loading. Tests use in-memory fixtures and a temporary
  filesystem for loader tests.
- **`@skillforge/cli`** — 12 tests covering command output and error handling for the CLI commands.

Run all tests from the repo root:

```
npm test
```

Run tests for a single package:

```
cd packages/core && npm test
cd packages/cli  && npm test
```

---

## Future Directions

**Skill versioning and lineage.** The `SkillVisibility` enum (`private` / `public`) and
`author/name` ID format are already present in anticipation of a distribution layer. A future
versioning model — inspired by OpenSpace's self-evolving skill architecture — would track skill
lineage: when an agent authors a new skill derived from an existing one, the provenance is
preserved. A resolver could build a dependency graph, detect conflicts, and determine a consistent
install set.

**Marketplace and distribution.** A `skillforge publish` command would validate, package, and push
a skill to a central registry. `skillforge install <id>` would pull by ID and version. The
existing `SkillVisibility` field gates whether a skill appears in public search.

**Skill composition.** There is no first-class "skill calls skill" primitive today. Composition
happens at the instruction level — SKILL.md can tell Claude to invoke other skills via
`skillforge_get`. A formal composition model (declaring that skill A is a subtask of skill B)
would enable static dependency analysis and progress tracking.

**Remote skill registries.** The loader interface (`ISkillLoader`) is the extension point. A
`RemoteSkillLoader` could fetch skills from an HTTP registry, cache them locally, and refresh on
demand. The registry and validator are agnostic to where skills came from.

---

## Design Tradeoffs

**SKILL.md is unstructured prose, not a formal language.** This maximizes authoring accessibility
and expressiveness at the cost of machine parseability. A formal workflow DSL would enable
automated execution planning and progress tracking but would raise the skill authoring bar
significantly and couple authors to a compiler. The current design bets that LLM instruction-
following is reliable enough to make prose instructions work well.

**Validation at load time, not at author time.** The validator runs when the CLI or MCP server
starts, not when a skill is written. Authors get feedback by running `skillforge validate` or
checking server startup logs. A language server plugin or editor integration would close the
feedback loop further, but that is out of scope for v1.

**In-memory registry, no persistence.** The registry is rebuilt from disk on every server start.
This is simple and correct for the current use case. At scale — thousands of skills, distributed
teams — a persistent backing store with incremental updates would be needed, but the `ISkillRegistry`
interface is the right abstraction boundary for that future change.

**Single instruction file per skill.** SKILL.md is one file. Complex skills might benefit from
multiple instruction files, conditional loading based on context, or template interpolation. The
`examples/` subdirectory begins to address this by separating example data from instructions.
Multi-file instructions are a future concern.

**MCP load-on-start, no hot reload.** Skills are loaded once when the MCP server starts. Adding or
editing a skill requires restarting Claude Desktop. An inotify/FSEvents watcher that calls
`registerOrUpdate()` on file changes would make the development loop faster, but it adds
operational complexity (debouncing, error recovery) that was deferred from v1.
