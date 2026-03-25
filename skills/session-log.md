# SkillForge Session Log

Track progress, decisions, and discoveries across sessions.

---

## Session 1 — 2026-03-25

### Status: Phase 1 Complete

**What was built:**

| Module | File | Status |
|--------|------|--------|
| Gateway client (P1-01) | `src/gateway/client.ts` | ✅ |
| Log poller (P1-02) | `src/poller/logPoller.ts` | ✅ |
| Feedback webhook (P1-03) | `src/webhook/feedback.ts` | ✅ |
| Taxonomy classifier (P1-04) | `src/taxonomy/taxonomy.ts` | ✅ |
| Scoring engine (P1-05) | `src/scoring/scorer.ts` | ✅ |
| Skill extractor (P1-06) | `src/skills/extractor.ts` | ✅ |
| Skill injector (P1-07) | `src/skills/injector.ts` | ✅ |
| Skills REST API (P1-08) | `src/skills/router.ts` | ✅ |
| AutoResearch loop (P1-09) | `src/autoresearch/loop.ts` | ✅ |
| Test suite (P1-10) | `src/__tests__/` | ✅ |

**Seed skills created:**
- `skills/cloudflare-gateway-setup/SKILL.md`
- `skills/cloudflare-log-reader/SKILL.md`
- `skills/typescript-node-project-setup/SKILL.md`
- `skills/skill-capture-pattern/SKILL.md`

**Key decisions:**
- Used `sql.js` (WASM) instead of `better-sqlite3` — no C++ toolchain required on Windows
- Used `hono@4.12.9` + `@hono/node-server@1.19.11` (patched versions for known vulnerabilities)
- Used `eslint@9.39.0` flat config format (ESLint 9+)
- `"type": "module"` in package.json — full ESM throughout

**Next session should start with:**
1. Set required env vars: `CF_ACCOUNT_ID`, `CF_GATEWAY_NAME`, `CF_API_TOKEN`
2. Run `npm run dev` to start the server
3. Run `curl -X POST http://localhost:3000/skills/extract` to load seed skills
4. Check `GET /skills` to verify taxonomy classification

**Blocked on:**
- `CF_ACCOUNT_ID` and `CF_GATEWAY_NAME` — need real Cloudflare gateway configured before log poller activates
- `CF_API_TOKEN` — needs `AI Gateway: Read` permission scope
- `CF_KEY_VAULT_REF` — Key Vault secret reference for provider keys

---

## Session 2 — 2026-03-25

### Status: Phase 2 Complete (Skill Engine)

**GitHub repo initialized:** https://github.com/tmcfarlane/skillforge

**What was built:**

| Task | Module | File | Status |
|------|--------|------|--------|
| P2-01 | LLM-as-judge scorer | `src/judge/judgeScorer.ts` | ✅ |
| P2-02 | Success signal aggregator | `src/signals/aggregator.ts` | ✅ |
| P2-03 | Skeleton extractor | `src/skills/skeletonExtractor.ts` | ✅ |
| P2-04 | Skeleton consistency tests | `src/__tests__/skeletonExtractor.test.ts` | ✅ |
| P2-05 | Skill: llm-as-judge-scorer | `skills/llm-as-judge-scorer/SKILL.md` | ✅ |
| P2-06 | Skill generator | `src/skills/generator.ts` | ✅ |
| P2-07 | Registry migrations | `src/db/database.ts` (4 new tables) | ✅ |
| P2-08 | BM25 skill matcher | `src/skills/matcher.ts` | ✅ |
| P2-09 | Injector enrichment | `src/skills/injector.ts` (BM25 + cf-aig-metadata) | ✅ |
| P2-10 | Eval runner | `src/eval/evalRunner.ts` + `src/eval/router.ts` | ✅ |
| P2-11 | Eval tests | `src/__tests__/evalRunner.test.ts` | ✅ |
| P2-12 | BullMQ queues | `src/queues/queues.ts` | ✅ |
| P2-13 | Skills: sqlite, bm25, bullmq | `skills/sqlite-registry-pattern/`, `skills/bm25-skill-matching/`, `skills/bullmq-background-queue/` | ✅ |

**New tables added:**
- `judge_scores` — LLM-as-judge evaluation results
- `skill_versions` — versioned SKILL.md content
- `skill_scores` — per-signal and composite scores
- `skill_lineage` — parent/child/conflict relationships

**Test suite:** 56 tests across 5 test files, all passing.

**Key decisions:**
- BM25 implemented inline (no external dep) — sufficient for < 10K skills
- BullMQ workers start only when `REDIS_HOST` env var is set (graceful degradation)
- Workers use lazy `import()` to avoid loading LLM clients at startup
- Injector now produces `cfMetadataHeader` for Cloudflare gateway log tagging
- Eval runner uses a cheaper task model (haiku) + more capable judge (sonnet)

**New HTTP endpoints:**
- `POST /eval/enqueue` — async A/B eval job via BullMQ
- `GET  /eval/results/:skillId` — fetch eval results from DB
- `GET  /eval/queues` — Redis queue depth stats

**Next session should start with:**
1. Set `REDIS_HOST` and `REDIS_PORT` to enable background workers
2. Set `CF_ACCOUNT_ID`, `CF_GATEWAY_NAME`, `CF_API_TOKEN` for gateway
3. Run `POST /skills/extract` to load all 7 SKILL.md files into DB
4. Run `POST /eval/enqueue` with a real skill_id to test A/B eval
5. Consider: P2 Phase 2 extension — embedding-based retrieval, conflict detection

**Blocked on:**
- Redis required for BullMQ queues (workers gracefully disabled if not present)
- Cloudflare Key Vault reference for LLM calls (no direct provider calls ever)

---

_Append new sessions below with date and status._
