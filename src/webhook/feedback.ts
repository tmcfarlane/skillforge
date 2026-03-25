/**
 * Feedback Webhook (P1-03)
 *
 * Receives POST /feedback events from Claude Code hooks or external tools.
 * Stores ratings in the local DB so the scoring system can use them.
 *
 * Payload schema:
 *   { skillId: string, rating: 1-5, comment?: string, source?: string }
 */

import { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDb, persistDb } from "../db/database.js";
import { logger } from "../utils/logger.js";

export const feedbackRouter = new Hono();

const FeedbackPayloadSchema = z.object({
  skillId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  source: z.string().default("webhook"),
});

feedbackRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = FeedbackPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  const { skillId, rating, comment, source } = parsed.data;
  const db = getDb();

  const skillExists = db.exec("SELECT id FROM skills WHERE id = ?", [skillId]);
  if (!skillExists[0]?.values.length) {
    return c.json({ error: `Skill '${skillId}' not found` }, 404);
  }

  const id = randomUUID();
  db.run(
    `INSERT INTO feedback (id, skill_id, rating, comment, source)
     VALUES (?, ?, ?, ?, ?)`,
    [id, skillId, rating, comment ?? null, source]
  );
  persistDb();

  logger.info("Feedback received", { id, skillId, rating, source });
  return c.json({ id, skillId, rating, received: true }, 201);
});

feedbackRouter.get("/stats/:skillId", (c) => {
  const skillId = c.req.param("skillId");
  const db = getDb();

  const result = db.exec(
    `SELECT
       COUNT(*)      AS total,
       AVG(rating)   AS avg_rating,
       MIN(rating)   AS min_rating,
       MAX(rating)   AS max_rating
     FROM feedback
     WHERE skill_id = ?`,
    [skillId]
  );

  const row = result[0]?.values[0];
  if (!row) return c.json({ total: 0, avgRating: null });

  return c.json({
    skillId,
    total: row[0],
    avgRating: row[1] !== null ? Number((row[1] as number).toFixed(2)) : null,
    minRating: row[2],
    maxRating: row[3],
  });
});
