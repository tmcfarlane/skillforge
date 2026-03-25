# SkillForge v2 — Build Rules

TypeScript · Cloudflare AI Gateway · AutoResearch Loop · Algorithmic Taxonomy

## Architecture

```
SkillForge (TypeScript/Node)
  Skill Engine (extract, inject, score)
  AutoResearch Loop (overnight experiments)
  Algorithmic Taxonomy (CS algo mapping)
    ↓ Cloudflare AI Gateway SDK
Cloudflare AI Gateway (managed)
  Auth · DLP · Rate Limiting · Caching · Failover
  Key Vault · Logging · Analytics · Multi-provider
    ↓
Claude / GPT-4 / Gemini / Workers AI
```

## Security Rules (NON-NEGOTIABLE)

- **NEVER put API keys in code or `.env` files** — if you see a raw key anywhere, stop and fix it immediately
- **ALL provider keys live in Cloudflare Key Vault** (Secrets Store)
- **ALL LLM traffic routes through Cloudflare AI Gateway** — no direct provider calls
- **NO Python dependencies** — TypeScript/Node only
- **Pin all npm dependencies with exact versions** — no `^` or `~` in package.json
- **Run `npm audit` after every `npm install`** — fix any high/critical vulnerabilities before proceeding

## Skill Capture Rules

When any task completes successfully and a reusable pattern was discovered:

1. Identify the computational skeleton (strip domain specifics)
2. Create `skills/{slug}/SKILL.md` using the capture pattern
3. Run `POST /skills/extract` to upsert into DB
4. Verify taxonomy via `GET /skills`

Slugs must be lowercase hyphenated noun phrases. No `how-to-` prefix.

## Session Start Rules

At the beginning of every session:
1. Read `skills/session-log.md` for context from previous sessions
2. Run `GET /skills` to see the current skill inventory and scores
3. Check `GET /skills/inject?task={current_task}` to find relevant skills before starting

## Code Quality Rules

- TypeScript strict mode always — no `any`, no `@ts-ignore`
- Zod for all external data validation (API responses, HTTP bodies, env vars)
- Vitest for all tests — run `npm test` before marking a task complete
- `npm run typecheck` must pass before committing
- No console.log — use `src/utils/logger.ts` (JSON structured logging)
- Hono for HTTP server — no Express, no Fastify
- sql.js for SQLite — no native-module dependencies (no `better-sqlite3`)
- `persistDb()` must be called after every DB write batch

## Phase 1 Task Tracker

| ID    | Task                              | Status  |
|-------|-----------------------------------|---------|
| P1-01 | Cloudflare AI Gateway client      | ✅ Done |
| P1-02 | Gateway log poller                | ✅ Done |
| P1-03 | Feedback webhook (POST /feedback) | ✅ Done |
| P1-04 | Algorithmic taxonomy classifier   | ✅ Done |
| P1-05 | Skill scoring engine              | ✅ Done |
| P1-06 | Skill extractor (SKILL.md parser) | ✅ Done |
| P1-07 | Skill injector (context assembly) | ✅ Done |
| P1-08 | Skills REST API                   | ✅ Done |
| P1-09 | AutoResearch loop                 | ✅ Done |
| P1-10 | Vitest test suite                 | ✅ Done |

## Phase 2 (Next)

- [ ] P2-01: Multi-provider failover (Claude → GPT-4 → Gemini)
- [ ] P2-02: Embedding-based skill retrieval (replace keyword matching)
- [ ] P2-03: Skill conflict detection (overlapping SKILL.md coverage)
- [ ] P2-04: AutoResearch scheduler (cron via Cloudflare Workers Cron Triggers)
- [ ] P2-05: Web UI for skill browser and experiment results

## MCP Usage

MCP servers configured in `mcp.json`:
- **filesystem**: Read/write local SKILL.md files and DB
- **github**: Push new skills to repo, create PRs for promoted experiments
- **sqlite**: Direct DB queries for analytics (read-only)
- **fetch**: HTTP calls to Cloudflare API for log polling
- **sequential-thinking**: Multi-step reasoning for AutoResearch hypothesis generation

## File Map

```
src/
  index.ts              — entry point, server startup
  gateway/client.ts     — Cloudflare AI Gateway SDK wrapper
  poller/logPoller.ts   — Cloudflare log polling (P1-02)
  webhook/feedback.ts   — Feedback webhook router (P1-03)
  taxonomy/taxonomy.ts  — Algorithmic taxonomy classifier (P1-04)
  scoring/scorer.ts     — Composite score computation (P1-05)
  skills/extractor.ts   — SKILL.md file parser + DB upsert (P1-06)
  skills/injector.ts    — Context-window skill assembler (P1-07)
  skills/router.ts      — Skills REST API (P1-08)
  autoresearch/loop.ts  — AutoResearch overnight loop (P1-09)
  db/database.ts        — sql.js WASM SQLite wrapper
  utils/logger.ts       — Structured JSON logger
  utils/env.ts          — Zod-validated env schema
  __tests__/            — Vitest test files

skills/
  cloudflare-gateway-setup/SKILL.md
  cloudflare-log-reader/SKILL.md
  typescript-node-project-setup/SKILL.md
  skill-capture-pattern/SKILL.md
  session-log.md
```
