# SkillForge

**Portable premium agent skills for Claude Desktop**

SkillForge is a skill packaging and discovery system for Claude Desktop. Skills are self-contained directories with a machine-readable `manifest.json` and instructional `SKILL.md`. Add the SkillForge MCP server to Claude Desktop, and your skills become immediately discoverable and executable through five native MCP tools.

## Features

- **Portable skill format** — a skill is a plain directory you can copy, version-control, and share across projects
- **Schema-validated manifests** — JSON Schema draft-07 validation catches errors before they reach Claude
- **First-class Claude Desktop integration** — six MCP tools expose the registry natively (list, search, get, validate, plan, reload)
- **Developer CLI** — twelve commands for discovery, validation, hook installation, scaffolding, and skill distribution
- **Flexible requirements** — declare environment variables, MCP servers, CLI tools, and platform constraints
- **Hook system** — skills can declare Claude lifecycle hooks that install into `~/.claude/settings.json`
- **Skill dependencies** — declare `requires` field in manifest for dependent skills
- **Skill distribution** — package skills as .tgz archives with `skillforge export`; install from archives with `skillforge import`
- **Full-text search** — search by name, description, and tags with `--category` filtering and `--json` output
- **Frontmatter loading** — skills with only a `SKILL.md` + YAML frontmatter load without a `manifest.json` (oh-my-claudecode compatible)
- **Hot reload** — `skillforge_reload` MCP tool rescans skills directory without restarting the server
- **Reference skills** — eight ready-to-use skills demonstrating best practices

## Quick Start

**1. Install and build**

```bash
pnpm install
pnpm build
```

**2. Configure Claude Desktop**

Add SkillForge to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "skillforge": {
      "command": "node",
      "args": ["/path/to/skillforge/packages/mcp/dist/index.js"],
      "env": {
        "SKILLFORGE_SKILLS_PATH": "/path/to/skillforge/skills"
      }
    }
  }
}
```

**3. Restart Claude Desktop**

Claude now has access to MCP tools for skill discovery and execution.

**4. Use the CLI**

```bash
# List all skills
npx skillforge list

# Search for a skill
npx skillforge search code review

# Get full details
npx skillforge info code-review

# Install skill hooks
npx skillforge install-hooks
```

---

## Packages

| Package | Purpose |
|---------|---------|
| `@skillforge/core` | Domain model, loader, registry, validator, HookManager, ExecutionPlanBuilder, config loader |
| `@skillforge/mcp` | MCP server exposing six tools to Claude Desktop |
| `@skillforge/cli` | Developer CLI with twelve commands |

---

## Skill Format

A skill is a directory with two required files:

```
my-skill/
├── manifest.json      # metadata, requirements, execution hints
├── SKILL.md          # instructions Claude follows
└── examples/         # optional usage examples
    └── basic.json
```

**`manifest.json`** — machine-readable metadata:

```json
{
  "id": "code-review",
  "name": "Code Review",
  "version": "1.0.0",
  "description": "Systematic code review covering correctness, security, performance, and maintainability",
  "category": "workflow",
  "tags": ["review", "code-quality", "collaboration"],
  "author": "skillforge",
  "license": "MIT",
  "integrations": [],
  "execution": {
    "preferredModel": "claude-opus-4-6",
    "requiresUserConfirmation": false,
    "destructive": false,
    "idempotent": true
  },
  "guardrails": [
    "Review code objectively"
  ]
}
```

**`SKILL.md`** — plain Markdown instructions:

```markdown
# Code Review Skill

## When to Use
Use this skill when you need a systematic code review...

## Workflow
1. Examine the code structure
2. Check correctness and logic
3. Evaluate security implications
4. Consider performance and maintainability
5. Provide actionable feedback

## Guardrails
- Be constructive and specific
- Consider context and constraints
```

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `skillforge list` | List all skills with metadata (`--category`, `--json`) |
| `skillforge info <id>` | Full details for a skill |
| `skillforge search <query>` | Search skills by name, description, or tags (`--category`, `--json`) |
| `skillforge validate [id]` | Validate all or specific skill(s) |
| `skillforge stats` | Registry statistics (count, categories, tags) |
| `skillforge hooks` | Preview hook configurations from all skills |
| `skillforge install-hooks` | Install skill hooks into `~/.claude/settings.json` |
| `skillforge new <id>` | Scaffold a new skill from template |
| `skillforge doctor` | Diagnose configuration and environment issues |
| `skillforge export <id>` | Package a skill as .tgz or .zip for distribution |
| `skillforge import <archive>` | Install a skill from a .tgz or .zip archive |

---

## Claude Desktop Setup

Once configured, Claude accesses five MCP tools:

| Tool | Description |
|------|-------------|
| `skillforge_list` | List all available skills with metadata |
| `skillforge_search` | Search skills by name, description, or tags |
| `skillforge_get` | Get a skill's full manifest and SKILL.md instructions |
| `skillforge_validate` | Validate a skill and return errors/warnings |
| `skillforge_plan` | Build and verify structured execution plans for skills |
| `skillforge_reload` | Rescan the skills directory and refresh the registry without restarting |

Claude discovers and invokes skills without special prompting. Ask it to find a relevant skill, or reference a skill by name directly.

---

## Available Skills

| Skill ID | Category | Description |
|----------|----------|-------------|
| `code-review` | workflow | Systematic code review covering correctness, security, performance, and maintainability |
| `deep-research` | workflow | Multi-source research workflow with structured citations and comprehensive findings |
| `git-workflow` | workflow | Branching, committing, and PR workflow best practices |
| `onboarding` | workflow | Codebase orientation and project structure walkthrough |
| `skillforge-usage` | tool_guide | How to use SkillForge itself (meta/bootstrap skill) |
| `api-debugging` | workflow | API troubleshooting and debugging techniques |
| `database-migration` | workflow | Safe database schema migration patterns and best practices |
| `writing-review` | workflow | Structured writing feedback with clarity, tone, and organization review |

---

## Creating a New Skill

**Use the scaffolding command:**

```bash
npx skillforge new my-skill
```

This creates a directory with template `manifest.json` and `SKILL.md`. Edit the manifest with your skill's metadata, requirements, and execution hints. Write the SKILL.md with clear, step-by-step instructions Claude should follow.

**Manual setup:**

1. Create a directory under `skills/` with a URL-safe ID
2. Add `manifest.json` with metadata (see manifest.schema.json for full schema)
3. Add `SKILL.md` with workflow instructions
4. Optionally add `examples/` with JSON usage examples
5. Restart the MCP server (or use `skillforge_reload`) to pick up the new skill

**Frontmatter-only skills (no manifest.json):**

Skills compatible with the [oh-my-claudecode](https://github.com/oh-my-claudecode) format — a bare `SKILL.md` with YAML frontmatter — load automatically without a `manifest.json`:

```markdown
---
name: My Skill
description: Does something useful
category: workflow
tags: [research, analysis]
version: 1.0.0
author: you
---

# My Skill

## Process
1. Step one
...
```

The manifest is synthesized from the frontmatter. The `---` block is stripped from the instructions Claude sees.

---

## Config File

Place `skillforge.config.json` or `.skillforgerc` at your project root:

```json
{
  "skillsPath": "./skills",
  "defaultAuthor": "your-name",
  "defaultLicense": "MIT",
  "claudeSettingsPath": "~/.claude/settings.json",
  "verbose": false
}
```

**Fields:**

- `skillsPath` — where skills are loaded from (default: `./skills`)
- `defaultAuthor` — pre-fills the author field for `skillforge new`
- `defaultLicense` — pre-fills the license field for `skillforge new`
- `claudeSettingsPath` — override path to Claude settings for hook installation
- `verbose` — enable verbose logging

---

## Development

**Install dependencies:**

```bash
pnpm install
```

**Build all packages:**

```bash
pnpm build
```

**Run tests:**

```bash
pnpm test
```

Current test coverage: **120 tests** (91 core + 29 CLI)

**Watch mode:**

```bash
pnpm build --watch
```

---

## Architecture

SkillForge follows a three-layer design:

- **Core** (`@skillforge/core`) — skill loader (with frontmatter support), registry, validator, schema, types, HookManager, ExecutionPlanBuilder, config loader
- **MCP Server** (`@skillforge/mcp`) — exposes six tools to Claude Desktop via the MCP protocol; auto-discovers skills via `skillforge.config.json`
- **CLI** (`@skillforge/cli`) — twelve commands for developer workflows

See [ARCHITECTURE.md](ARCHITECTURE.md) for system design details.

---

## Schema

JSON Schema draft-07 for `manifest.json` is provided at `schemas/manifest.schema.json`. Use it in your editor for autocomplete and validation.

---

## Project Status (as of 2026-04-03)

### What's built and working

SkillForge is fully implemented and connected to Claude Desktop. Every component below is tested and running:

**Core system (`@skillforge/core`)**
- `FileSystemSkillLoader` — loads skills from `manifest.json` + `SKILL.md`; also loads skills from SKILL.md YAML frontmatter alone (no manifest.json required, compatible with oh-my-claudecode skill format)
- `SkillRegistry` — in-memory registry with full-text search, category filtering, tag indexing, and stats
- `SkillValidator` — validates manifests against Zod schema at load time
- `HookManager` — converts skill hook declarations into Claude Code `settings.json` format
- `ExecutionPlanBuilder` — parses SKILL.md numbered lists into structured `ExecutionStep[]`
- `loadConfig()` — upward directory search for `skillforge.config.json` or `.skillforgerc`

**MCP Server (`@skillforge/mcp`)** — connected to Claude Desktop
- 6 tools: `skillforge_list`, `skillforge_search`, `skillforge_get`, `skillforge_validate`, `skillforge_plan`, `skillforge_reload`
- `skillforge_reload` — hot-reloads skills from disk without restarting the server
- Auto-discovers `skillsPath` via `loadConfig()` if no env var is set
- Registered in `~/Library/Application Support/Claude/claude_desktop_config.json`

**CLI (`@skillforge/cli`)** — 12 commands, all working
- `list` / `search` — both support `--category` filter and `--json` output
- `export` / `import` — packages and installs skills as `.tgz` or `.zip` archives
- `install-hooks` — installs skill lifecycle hooks into `~/.claude/settings.json`
- `install-capture-hook` — registers the auto-capture Stop hook (see below)
- `doctor` — validates full installation: Node version, skills, config, Claude Desktop, MCP binary

**8 built-in skills** in `skills/`:
`code-review`, `deep-research`, `git-workflow`, `onboarding`, `skillforge-usage`, `api-debugging`, `database-migration`, `writing-review`

**Auto-capture pipeline** (`scripts/`) — *implemented, not yet activated*
- `capture-hook.py` — Claude Code Stop hook; forks immediately to background so it never blocks
- `capture_lib/adapter.py` — parses Claude Code JSONL transcript into a `TaskSummary`
- `capture_lib/synthesizer.py` — calls `claude-haiku-4-5-20251001` to synthesize a SKILL.md; skips non-novel sessions
- `capture_lib/lineage.py` — SQLite lineage DB; detects duplicate patterns, triggers DERIVED evolution vs CAPTURED
- `capture_lib/quality_gate.py` — validates captured skill via `skillforge validate` before accepting it
- Activate with: `pip install anthropic && skillforge install-capture-hook`

**Test coverage**: 120 tests, all passing (91 core + 29 CLI)

---

### Architecture context

This repo (`/Users/tmcfarlane/repo/skillforge/`) contains three things:

| Directory | What it is |
|-----------|-----------|
| `/` (root) | SkillForge — the TypeScript monorepo (the product) |
| `OpenSpace/` | Python self-evolving agent skill system (design inspiration; has its own `skill_engine/`, evolver, SQLite lineage, MCP server, React frontend) |
| `autoresearch/` | Autonomous LLM pretraining experiment runner (modifies `train.py`, evaluates `val_bpb`) — not relevant to SkillForge |

The auto-capture pipeline's design was directly inspired by OpenSpace's `ExecutionAnalyzer` + `SkillEvolver` (CAPTURED / DERIVED / FIXED evolution types). The Python capture scripts are standalone — they don't import OpenSpace, just use the same patterns.

---

### What's not built yet

- **Evals** — no formal evaluation framework to measure skill quality delta (with vs. without skill). The auto-capture pipeline uses the LLM itself as the quality signal.
- **Distribution platform** — skills can be exported as `.tgz` and shared manually, but there's no hosted registry or discovery service.
- **Web UI** — no frontend. OpenSpace has a React frontend; SkillForge is CLI + MCP only.
- **`@skillforge/evals` package** — discussed, not implemented. Would measure step compliance, output quality delta, and consistency across runs.

---

### How to resume

```bash
cd /Users/tmcfarlane/repo/skillforge
pnpm install && pnpm build
node packages/cli/dist/cli.js doctor --skills-path ./skills
```

Claude Desktop is already configured. Restart it if skills don't appear.

To activate auto-capture:
```bash
pip install anthropic
node packages/cli/dist/cli.js install-capture-hook
# Restart Claude Desktop — every session end will now attempt skill capture
# Captured skills appear in ./skills/, log at ./.skillforge-capture.log
```

---

## Inspired By

SkillForge is informed by [OpenSpace](https://github.com/justinhennessy/openspace), a research project on self-evolving agent skill architectures. OpenSpace demonstrated that agent capabilities can be modular, runtime-composable, and authored without modifying the runtime. SkillForge applies these ideas concretely to Claude Desktop via the MCP protocol, with a portable file format that works anywhere Node.js runs.
