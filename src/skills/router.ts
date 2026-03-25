/**
 * Skills HTTP Router (P1-08)
 *
 * REST endpoints for skill management:
 *   GET  /skills              list all skills with scores
 *   GET  /skills/:id          get single skill
 *   POST /skills/extract      trigger extraction from SKILL.md files
 *   POST /skills/score        recompute all scores
 *   GET  /skills/inject       get relevant skills for a task description
 */

import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/database.js";
import { extractSkills } from "./extractor.js";
import { scoreAllSkills } from "../scoring/scorer.js";
import { injectSkills } from "./injector.js";
import { logger } from "../utils/logger.js";

export const skillsRouter = new Hono();

skillsRouter.get("/", (c) => {
  const db = getDb();
  const result = db.exec(`
    SELECT id, name, path, taxonomy, score, usage_count, created_at, updated_at
    FROM skills
    ORDER BY score DESC
  `);

  if (!result[0]) return c.json([]);

  const columns = result[0].columns;
  const skills = result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    if (obj["taxonomy"] && typeof obj["taxonomy"] === "string") {
      try { obj["taxonomy"] = JSON.parse(obj["taxonomy"]); } catch { /* keep as string */ }
    }
    return obj;
  });

  return c.json(skills);
});

skillsRouter.get("/inject", (c) => {
  const task = c.req.query("task");
  if (!task) return c.json({ error: "Missing ?task= query param" }, 400);

  const topN = Number(c.req.query("topN") ?? "5");
  const maxTokens = Number(c.req.query("maxTokens") ?? "2000");

  const result = injectSkills(task, { topN, maxTokens });
  return c.json({
    task,
    skillCount: result.skills.length,
    tokenEstimate: result.tokenEstimate,
    systemFragment: result.systemFragment,
    cfMetadataHeader: result.cfMetadataHeader,
  });
});

skillsRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  const db = getDb();

  const result = db.exec("SELECT * FROM skills WHERE id = ?", [id]);
  if (!result[0]?.values.length) return c.json({ error: "Skill not found" }, 404);

  const columns = result[0].columns;
  const obj: Record<string, unknown> = {};
  const row = result[0].values[0];
  if (!row) return c.json({ error: "Skill not found" }, 404);
  columns.forEach((col, i) => { obj[col] = row[i]; });

  if (obj["taxonomy"] && typeof obj["taxonomy"] === "string") {
    try { obj["taxonomy"] = JSON.parse(obj["taxonomy"] as string); } catch { /* keep as string */ }
  }

  return c.json(obj);
});

skillsRouter.post("/extract", async (c) => {
  logger.info("Skills API: triggering extraction");
  const skills = extractSkills();
  scoreAllSkills();
  return c.json({ extracted: skills.length, message: "Extraction and scoring complete" });
});

skillsRouter.post("/score", async (c) => {
  logger.info("Skills API: triggering scoring");
  scoreAllSkills();
  return c.json({ message: "Scoring complete" });
});

// Capture a new skill pattern via the API
const CapturePayloadSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
});

skillsRouter.post("/capture", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const parsed = CapturePayloadSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);

  const { writeFileSync, mkdirSync } = await import("fs");
  const { join, resolve } = await import("path");
  const { randomUUID } = await import("crypto");

  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const dir = resolve(`./skills/${slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), parsed.data.content, "utf-8");

  const skills = extractSkills();
  scoreAllSkills();

  logger.info("Skills API: captured new skill", { name: parsed.data.name, slug });
  return c.json({ slug, extracted: skills.length }, 201);
});
