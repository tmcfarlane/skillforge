# Contributing to SkillForge

Welcome to SkillForge! We're building a powerful skill management system for Claude Desktop and CLI environments. Contributions are welcome, whether they're bug fixes, new features, documentation improvements, or entirely new skills.

## What Kinds of Contributions Are Welcome?

- **Bug fixes** — if you've found an issue, we'd love a PR
- **Features & enhancements** — new core functionality, CLI commands, or MCP tools
- **New skills** — reference skills, domain-specific skills, integrations
- **Documentation** — improved guides, API docs, examples
- **Tests** — better coverage, regression tests
- **Performance improvements** — optimizations, profiling improvements

## Development Setup

### Prerequisites

- **Node.js** 18.0.0 or later (20+ recommended)
- **pnpm** 8.0.0 or later

### Getting Started

```bash
# Clone the repository
git clone https://github.com/yourusername/skillforge.git
cd skillforge

# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run tests
pnpm -r test
```

## Project Structure

SkillForge is organized as a monorepo with the following key directories:

- **packages/core** — domain model, loaders, validators, hook system, execution planning
- **packages/mcp** — MCP server for Claude Desktop integration
- **packages/cli** — command-line interface and developer tools
- **skills/** — reference skills and user-contributed skills
- **docs/** — user guides, architecture docs, contribution guides
- **schemas/** — JSON Schema definitions for manifest.json and config

Each package has its own tests, type definitions, and build configuration.

## Making Changes

### Coding Standards

- **TypeScript strict mode** — all code must pass `pnpm -r typecheck` with no errors
- **Linting & formatting** — follow the project's eslint and prettier config
- **Tests required** — new functionality in `@skillforge/core` must include tests
- **Before submitting:**
  ```bash
  pnpm -r typecheck
  pnpm -r test
  pnpm -r lint
  ```

### Commits

Keep commits focused and atomic — each commit should represent one logical change. This makes history easier to understand and makes reverting problematic changes simpler.

## Adding a New Skill

To create a new skill, use the scaffold tool:

```bash
skillforge new <skill-id>
```

This creates a new directory under `skills/<skill-id>/` with:
- `manifest.json` — skill metadata, hooks, parameters
- `SKILL.md` — user-facing documentation
- `index.ts` — implementation (optional)

**Steps:**

1. Run `skillforge new <id>` and fill in the prompt
2. Edit `manifest.json` with correct metadata
3. Write `SKILL.md` with usage examples and documentation
4. Implement the skill (if needed) or link to a hook
5. Run `skillforge validate <id>` to check for errors
6. Submit a PR with your skill

For detailed guidance, see [docs/adding-a-skill.md](docs/adding-a-skill.md).

## Adding a New Package

To add a new `@skillforge/*` package:

1. Create `packages/<name>/` with:
   ```
   src/
   tests/
   package.json
   tsconfig.json
   ```

2. Update the root `pnpm-workspace.yaml` to include the new package

3. Add a `package.json` with:
   ```json
   {
     "name": "@skillforge/<name>",
     "version": "0.1.0",
     "main": "dist/index.js",
     "types": "dist/index.d.ts",
     "scripts": {
       "build": "tsc",
       "test": "jest",
       "typecheck": "tsc --noEmit"
     }
   }
   ```

4. Add build and test scripts matching the monorepo pattern

5. Link dependencies via `pnpm add` or by editing the root `pnpm-workspace.yaml`

## Pull Request Process

1. **Create a branch** — use a descriptive name (e.g., `feat/new-skill` or `fix/validator-issue`)
2. **Write tests** — include tests for any new functionality
3. **Update docs** — if your change affects user-facing behavior, update relevant docs
4. **Run the full test suite** — ensure `pnpm -r typecheck && pnpm -r test` passes
5. **Submit your PR** — include a clear title and description
6. **CI must pass** — GitHub Actions runs tests on Node 20 and 22
7. **One approval required** — a maintainer will review your PR

PR titles should follow the [Conventional Commits](#commit-message-format) format.

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/) for clear, semantic commit messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` — a new feature
- `fix` — a bug fix
- `docs` — documentation changes
- `test` — adding or updating tests
- `chore` — build, dependencies, configuration
- `refactor` — code restructuring (no feature/fix)
- `perf` — performance improvements

**Examples:**
```
feat(cli): add new `doctor` command

fix(core): correct manifest validation for optional fields

docs: improve adding-a-skill guide

test(cli): add coverage for search command
```

## Code of Conduct

We're committed to a respectful, inclusive community. Please:

- Be respectful and professional in all interactions
- Assume good intent; ask for clarification if something seems unclear
- Provide constructive feedback
- Report issues to project maintainers if needed

## License

By contributing, you agree that your contributions will be licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

Thank you for contributing to SkillForge! Questions? Open an issue or start a discussion.
