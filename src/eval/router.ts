/**
 * Eval HTTP Router (P2-10)
 *
 * REST endpoints for the eval runner and queue management:
 *   POST /eval/enqueue       enqueue a new eval job (async, uses BullMQ)
 *   GET  /eval/results/:id   get eval results for a skill
 *   GET  /eval/queues        queue depth stats (requires Redis)
 */

import { Hono } from "hono";
import { z } from "zod";
import { getEvalResults } from "./evalRunner.js";
import { logger } from "../utils/logger.js";

export const evalRouter = new Hono();

const EnqueueBodySchema = z.object({
  prompt: z.string().min(1),
  skillId: z.string().min(1),
  keyVaultRef: z.string().min(1),
  provider: z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]).optional(),
  model: z.string().optional(),
  judgeModel: z.string().optional(),
  expectedOutcome: z.string().optional(),
});

evalRouter.post("/enqueue", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const parsed = EnqueueBodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);

  try {
    const { enqueueEvalRunner } = await import("../queues/queues.js");
    const { EvalRunnerJobSchema } = await import("../queues/queues.js");
    const jobData = EvalRunnerJobSchema.parse({
      prompt: parsed.data.prompt,
      skillId: parsed.data.skillId,
      keyVaultRef: parsed.data.keyVaultRef,
      provider: parsed.data.provider,
      model: parsed.data.model,
      judgeModel: parsed.data.judgeModel,
      expectedOutcome: parsed.data.expectedOutcome,
    });
    const jobId = await enqueueEvalRunner(jobData);

    logger.info("Eval: enqueued job", { jobId, skillId: parsed.data.skillId });
    return c.json({ jobId, message: "Eval job enqueued" }, 202);
  } catch (err) {
    logger.error("Eval: failed to enqueue", { err: String(err) });
    return c.json({ error: "Failed to enqueue — is Redis running?" }, 503);
  }
});

evalRouter.get("/results/:skillId", (c) => {
  const skillId = c.req.param("skillId");
  const limit = Number(c.req.query("limit") ?? "20");

  const results = getEvalResults(skillId, limit);
  return c.json({ skillId, results });
});

evalRouter.get("/queues", async (c) => {
  try {
    const { getQueues, QUEUE_NAMES } = await import("../queues/queues.js");
    const queues = getQueues();

    const stats = await Promise.all(
      Object.entries(QUEUE_NAMES).map(async ([key, name]) => {
        const queue = queues[key.toLowerCase().replace(/_([a-z])/g, (_, l: string) => l.toUpperCase()) as keyof typeof queues];
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);
        return { name, waiting, active, completed, failed };
      })
    );

    return c.json({ queues: stats });
  } catch (err) {
    return c.json({ error: "Redis not available", detail: String(err) }, 503);
  }
});
