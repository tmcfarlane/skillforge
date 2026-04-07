# Changelog

All notable changes to SkillForge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-29

### Added

#### Core

- `@skillforge/core` — domain model and skill management
  - `Skill` and `SkillManifest` types with full manifest structure including `requires` field for dependencies
  - `FileSystemSkillLoader` for loading skills from disk
  - `SkillRegistry` for registering and querying skills
  - `SkillValidator` with comprehensive manifest validation
  - `HookManager` for skill hook lifecycle management
  - `ExecutionPlanBuilder` for structured execution plans
  - `loadConfig` and `loadConfigSync` for project configuration files
  - Config file support (skillforge.config.json, .skillforgerc)

#### MCP Integration

- `@skillforge/mcp` — MCP server for Claude Desktop
  - `skillforge_list` tool — list all available skills with filters
  - `skillforge_search` tool — full-text search across skill metadata and documentation
  - `skillforge_get` tool — retrieve detailed skill information
  - `skillforge_validate` tool — validate skill manifests
  - `skillforge_plan` tool — build and verify structured execution plans

#### CLI

- `@skillforge/cli` — developer command-line interface
  - `list` command — display skills with filtering and sorting
  - `info` command — show detailed skill information
  - `search` command — full-text search skills
  - `validate` command — check skill manifest validity
  - `stats` command — project statistics and metrics
  - `hooks` command — manage and inspect skill hooks
  - `install-hooks` command — install hooks into Claude Desktop
  - `new` command — scaffold new skills interactively
  - `doctor` command — diagnose configuration and environment issues
  - `export` command — package skills as .tgz archives for distribution

#### Reference Skills

- 8 reference skills demonstrating skill creation patterns
  - `code-review` — AI-powered code review skill
  - `deep-research` — research and analysis skill
  - `git-workflow` — Git operations and workflow automation
  - `onboarding` — new contributor onboarding skill
  - `skillforge-usage` — self-referential SkillForge documentation skill
  - `api-debugging` — API troubleshooting and debugging techniques
  - `database-migration` — safe database schema migration patterns
  - `writing-review` — structured writing feedback and editing skill

#### Schema & Configuration

- JSON Schema for `manifest.json` at `schemas/manifest.schema.json`
- Support for multiple config file formats (.skillforgerc, skillforge.config.json)
- Comprehensive manifest validation with detailed error messages
- TypeScript type definitions for all public APIs

#### Testing

- 116 tests across the project
  - 87 tests in `@skillforge/core` covering validators, loaders, registry, hooks, execution planning
  - 29 tests in `@skillforge/cli` covering command functionality and CLI workflows
- Jest configuration for all packages
- Test coverage for core domain model, validation, hook system, and skill export

#### Documentation

- `ARCHITECTURE.md` — system design, components, and extensibility
- `README.md` — project overview and quick start guide
- `docs/adding-a-skill.md` — comprehensive guide for skill authors
- `CONTRIBUTING.md` — contribution guidelines, development setup, PR process
- `CHANGELOG.md` — release notes and change tracking

#### CI/CD

- GitHub Actions workflow for Node.js 20.x and 22.x matrix
- Automated test runs on push and pull requests
- Type checking with TypeScript strict mode

### Changed

- N/A (initial release)

### Deprecated

- N/A (initial release)

### Removed

- N/A (initial release)

### Fixed

- N/A (initial release)

### Security

- N/A (initial release)

---

## How to Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting issues, proposing features, and submitting pull requests.

## Release Notes

For detailed information about features, fixes, and improvements in each release, see the [GitHub Releases](https://github.com/yourusername/skillforge/releases) page.
