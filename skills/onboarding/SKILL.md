# Codebase Onboarding Skill

## When to Use This Skill

Use this skill when:

- **Starting work on an unfamiliar codebase** — You've been asked to contribute to a project you haven't seen before and need to understand its structure, conventions, and patterns quickly.
- **Onboarding a new team member** — A developer is joining the team and needs systematic guidance to become productive. This skill provides a structured walkthrough rather than ad-hoc explanations.
- **Resuming work after a long break** — You've stepped away from a project for weeks or months and need to refresh your understanding of the architecture, recent changes, and current conventions before diving back in.
- **Learning an unfamiliar framework or monorepo structure** — The codebase uses patterns or tools you're not yet familiar with, and you need a guided introduction to the layout and conventions.

This skill is *read-only*. It focuses on understanding, not implementation. After completing this onboarding, you'll have a mental model of the codebase and be ready to implement features or fix bugs with confidence.

## Onboarding Process

Follow these steps in order. Each step builds on the previous one.

### Step 1: Read README.md and Documentation

Start by reading the root `README.md` file. This is your entry point to understanding the project's purpose, its place in the broader ecosystem, and high-level how-to instructions.

- Skim for: project description, quick start instructions, key links, and known limitations.
- Then read any markdown files in a `docs/` or `documentation/` folder if it exists.
- Look for architecture overviews, design decisions, and contributor guides.

**Output from this step:** A clear, one-sentence understanding of what the project does.

### Step 2: Understand the Directory Structure

Examine the top-level directory layout. This tells you how the project is organized.

- If it's a **monorepo** (e.g., Turborepo, Lerna, pnpm workspaces), you'll see `packages/` or `apps/` directories. List what's in each.
- If it's a **single application**, look for `src/`, `lib/`, `app/`, or similar top-level folders.
- Identify the purpose of each top-level directory: source code, documentation, configuration, tooling, examples, tests.

For the **src/ directory structure** (or equivalent):
- Look for layered organization: `components/`, `utils/`, `services/`, `models/`, `pages/`, `hooks/`, etc.
- Understand where UI/presentation logic lives vs. business logic vs. infrastructure.

**Output from this step:** A mental tree of the codebase — where things are and what each directory contains.

### Step 3: Identify the Tech Stack

Check the dependency and configuration files to understand what technologies are being used.

- Read `package.json` (or `Pipfile`, `pyproject.toml`, `go.mod`, `Cargo.toml`, etc. depending on the language).
- Look for: framework (React, Vue, Django, FastAPI, etc.), build tools (Webpack, Vite, Next.js, etc.), testing frameworks, and key libraries.
- Check `tsconfig.json`, `.eslintrc`, `prettier.config.js`, or similar for language and code quality tooling.
- Scan `Dockerfile` or `.github/workflows/` if present to understand deployment and CI/CD.

**Output from this step:** A clear list of the tech stack (language, framework, build tool, testing framework, notable libraries).

### Step 4: Find the Entry Points

Entry points are the files that bootstrap the application. They're where execution starts.

- For **web apps**: Look for `src/main.ts`, `src/index.tsx`, `src/app.tsx`, or `pages/_app.tsx` (Next.js).
- For **backend services**: Look for `main.py`, `server.ts`, `cmd/main.go`, `src/main.rs`.
- For **libraries**: Find the entry point in `package.json` (`main` or `exports` fields) or equivalent.
- Trace from the entry point downward. What are the first 3-5 things that happen when the application starts?

**Output from this step:** A clear list of where execution begins, and a rough trace of initialization.

### Step 5: Read Key Config Files

Configuration files tell you how the project expects to run and what environment assumptions it makes.

- `.env.example` or `.env.local.example` — shows what environment variables are required.
- `tsconfig.json` — TypeScript compilation settings, target, module resolution.
- `.eslintrc` or similar — code style and quality rules.
- `vitest.config.ts`, `jest.config.js`, or `pytest.ini` — test configuration.
- `vite.config.ts`, `webpack.config.js`, or `next.config.js` — build configuration.

**Output from this step:** Understanding of how the project is configured, what environment variables are needed, and what code style is expected.

### Step 6: Scan Git Log for Recent Changes

Look at the recent commit history to understand what's been worked on.

```bash
git log --oneline -20
```

- What features or fixes have been merged recently?
- Are there any patterns in commit messages (conventional commits, issue references)?
- Has the architecture changed recently?

**Output from this step:** Context on recent work and active areas of the codebase.

### Step 7: Identify the Test Setup and Run a Quick Check

Understanding how tests are run will help you contribute safely later.

- Find the test directory structure (typically `__tests__/`, `tests/`, `test/`, or `*.test.ts` alongside source).
- Check what testing framework is used (Jest, Vitest, Pytest, Go testing, etc.).
- Look at one test file to understand the testing patterns and conventions.
- If appropriate and safe, run a test command (e.g., `npm test` or `pnpm test`) to verify the setup works. Do this only if the project is ready for testing (no database setup required, no external service dependencies without mocks).

**Output from this step:** Understanding of how tests are structured, what testing framework is used, and confidence that the project builds/tests locally.

### Step 8: Produce a Summary

Synthesize everything you've learned into a structured summary. This becomes your "codebase mental model" — refer back to it when you start implementing.

## What to Look For

As you work through the onboarding steps, pay special attention to these patterns:

### Architecture Patterns

- **Monorepo or single repo?** If monorepo, how are packages organized and shared?
- **Layered architecture?** (e.g., controllers → services → repositories → models)
- **Component-based?** (UI components, logic components, containers)
- **Event-driven?** Are there event buses, pub/sub patterns, or message queues?
- **Microservices or modular monolith?** How are boundaries drawn between modules?

### Naming Conventions

- **File naming:** camelCase, kebab-case, PascalCase? Are there suffixes? (e.g., `*.service.ts`, `*.component.tsx`)
- **Function/variable naming:** Descriptive names or abbreviations? Are there prefixes? (e.g., `useXxx` for hooks, `getXxx` for getters)
- **Folder naming:** Pluralized (`components/`) or singular (`component/`)? Do they follow a specific pattern?

### Code Organization

- **Where does business logic live?** In services, hooks, utilities, or somewhere else?
- **Where does infrastructure live?** Database connections, API clients, file I/O — are these isolated or mixed with business logic?
- **How are dependencies managed?** Are there dependency injection containers, or is it ad-hoc?

### Error Handling

- **Try/catch blocks?** Are errors logged, re-thrown, or handled gracefully?
- **Error types or codes?** Are there custom error classes or error constants?
- **Validation:** Where is input validation done — at the entry point, in services, or everywhere?

### Configuration Management

- **Environment variables:** How are `.env` files loaded and used?
- **Feature flags?** Are there feature flags or toggling mechanisms?
- **Runtime configuration:** Are there config files, or is everything environment variable-based?

## Output Format

When you complete onboarding, produce a structured summary with these sections:

### 1. Project Purpose
A one or two-sentence summary of what the codebase does and who uses it.

Example: "This is the frontend web application for an e-commerce platform. It handles product browsing, shopping cart management, and checkout flows for customers."

### 2. Tech Stack
List the primary technologies:
- **Language(s):** TypeScript, Python, Go, Rust, etc.
- **Framework(s):** React, Next.js, Django, FastAPI, Gin, etc.
- **Build/Dev Tools:** Vite, Webpack, Docker, etc.
- **Testing Framework:** Jest, Vitest, Pytest, etc.
- **Key Libraries:** Name 3-5 significant dependencies (not exhaustive).

Example:
- Language: TypeScript
- Frontend Framework: React 18 + Next.js 14
- Build Tool: Vite
- Testing: Vitest + React Testing Library
- Key Libraries: Zustand (state), TanStack Query (data fetching), Zod (validation)

### 3. Key Directories and Their Contents
Document the directory structure in a brief, hierarchical format:

Example:
```
/apps/web                 — Next.js web application
  /src
    /pages              — Route definitions
    /components         — Reusable React components
    /hooks              — Custom React hooks
    /lib                — Utilities and helpers
    /styles             — Global and module CSS
/packages/ui            — Shared UI component library
/packages/api-client    — API SDK for backend communication
/packages/utils         — Shared utility functions
/docs                   — Documentation and design decisions
```

### 4. Entry Points
List the main entry points and what happens at each:

Example:
- **Web App:** `apps/web/src/pages/_app.tsx` — initializes Next.js app, sets up context providers (auth, theme, state management)
- **Backend API:** `src/main.ts` — creates Express server, connects to database, starts listening on port 3000

### 5. Conventions Observed
Document the patterns and conventions you noticed:

Example:
- **Naming:** Components use PascalCase (e.g., `UserCard.tsx`), utilities use camelCase (e.g., `formatDate.ts`)
- **File structure:** Components live in `components/`, one folder per component, containing `Component.tsx`, `Component.test.tsx`, and optional `types.ts`
- **Error handling:** Errors are caught at the route handler level, logged with a unique ID, and returned as JSON with status code
- **Testing:** Jest tests colocated with source, using snapshot testing for components, mocking API calls with MSW

### 6. Known Unknowns / Questions to Resolve
List things you didn't fully understand and should ask about or investigate later:

Example:
- How is the state management set up? (Saw Zustand mentioned, but haven't traced full store setup)
- What's the deployment process? (Didn't find CI/CD config)
- How are database migrations run? (Need to ask the team)

## Guardrails

- **Read-only during onboarding.** Do not create files, modify code, or run build/install commands unless explicitly invited to do so.
- **Do not start implementing until you produce the summary.** Complete all 8 steps and the summary before writing any code.
- **Focus on understanding, not speed.** It's better to thoroughly understand a small codebase than to skim a large one. If a project is very large, focus on the directories you'll work in first.
- **Ask questions.** If you encounter something you don't understand, note it in the "Known Unknowns" section and ask the team later.

---

**Next Steps After Onboarding:**

Once you've completed the summary, you have a solid mental model of the codebase. Use this to:
- Locate the right place to add new features
- Understand how to write tests that fit the project's patterns
- Anticipate side effects and dependencies when making changes
- Communicate with the team about the architecture and conventions you've learned
