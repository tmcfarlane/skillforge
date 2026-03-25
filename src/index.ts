/**
 * SkillForge v2 — Cloudflare-First entry point
 *
 * Architecture:
 *   Skill Engine  →  Cloudflare AI Gateway  →  Claude / GPT-4 / Gemini
 *   AutoResearch Loop  →  overnight experimentation
 *   Algorithmic Taxonomy  →  CS-grounded skill classification
 *
 * Security rules (NON-NEGOTIABLE):
 *   - NEVER put API keys in code or .env
 *   - ALL provider keys live in Cloudflare Key Vault
 *   - ALL LLM traffic routes through Cloudflare AI Gateway
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { feedbackRouter } from "./webhook/feedback.js";
import { skillsRouter } from "./skills/router.js";
import { startLogPoller } from "./poller/logPoller.js";
import { initDb } from "./db/database.js";
import { logger } from "./utils/logger.js";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", version: "2.0.0" }));
app.route("/feedback", feedbackRouter);
app.route("/skills", skillsRouter);

async function main(): Promise<void> {
  await initDb();

  const port = Number(process.env["PORT"] ?? 3000);
  serve({ fetch: app.fetch, port }, () => {
    logger.info(`SkillForge v2 running on port ${port}`);
  });

  startLogPoller();
}

main().catch((err: unknown) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
