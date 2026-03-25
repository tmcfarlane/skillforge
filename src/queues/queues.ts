/**
 * BullMQ + Redis Background Queues (P2-12)
 *
 * Three async processing queues:
 *   - log-analysis:  Process gateway log entries → extract skeletons
 *   - skill-gen:     Skeleton → generate SKILL.md + version in registry
 *   - eval-runner:   Run A/B eval (with/without skill) + store results
 *
 * All queues are async-only. No synchronous work happens on the HTTP path.
 * Redis connection uses env vars; no credentials in source code.
 *
 * Usage pattern:
 *   1. Enqueue jobs from HTTP handlers or the log poller
 *   2. Workers process jobs in background
 *   3. Results land in SQLite via existing DB layer
 */

import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { z } from "zod";
import { logger } from "../utils/logger.js";

// ─── Redis connection ──────────────────────────────────────────────────────

const RedisConfigSchema = z.object({
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.string().regex(/^\d+$/).default("6379"),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.string().optional(),
});

function getRedisConfig(): { host: string; port: number; password?: string; tls?: object } {
  const env = RedisConfigSchema.parse(process.env);
  return {
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
    ...(env.REDIS_TLS === "true" ? { tls: {} } : {}),
  };
}

/** Create an ioredis connection. Called once per queue/worker. */
function createRedisConnection(): Redis {
  const config = getRedisConfig();
  const conn = new Redis(config);
  conn.on("error", (err) => {
    logger.error("Redis connection error", { err: String(err) });
  });
  conn.on("connect", () => {
    logger.info("Redis connected", { host: config.host, port: config.port });
  });
  return conn;
}

// ─── Job payload schemas ───────────────────────────────────────────────────

export const LogAnalysisJobSchema = z.object({
  logEntryId: z.string().min(1),
  prompt: z.string().min(1),
  response: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  keyVaultRef: z.string().min(1),
  domain: z.string().optional(),
});

export const SkillGenJobSchema = z.object({
  skeletonName: z.string().min(1),
  skeletonDescription: z.string().min(1),
  patternType: z.string().min(1),
  steps: z.array(z.string()),
  primitives: z.array(z.string()),
  tags: z.array(z.string()),
  strippedDomainTerms: z.array(z.string()),
  keyVaultRef: z.string().min(1),
  provider: z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]).default("anthropic"),
  model: z.string().default("claude-sonnet-4-6"),
});

export const EvalRunnerJobSchema = z.object({
  prompt: z.string().min(1),
  skillId: z.string().min(1),
  keyVaultRef: z.string().min(1),
  provider: z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]).default("anthropic"),
  model: z.string().default("claude-haiku-4-5-20251001"),
  judgeModel: z.string().default("claude-sonnet-4-6"),
  expectedOutcome: z.string().optional(),
});

export type LogAnalysisJob = z.infer<typeof LogAnalysisJobSchema>;
export type SkillGenJob = z.infer<typeof SkillGenJobSchema>;
export type EvalRunnerJob = z.infer<typeof EvalRunnerJobSchema>;

// ─── Queue names ───────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  LOG_ANALYSIS: "log-analysis",
  SKILL_GEN: "skill-gen",
  EVAL_RUNNER: "eval-runner",
} as const;

// ─── Queue factory ─────────────────────────────────────────────────────────

let _queues: {
  logAnalysis: Queue;
  skillGen: Queue;
  evalRunner: Queue;
} | undefined;

export function getQueues(): typeof _queues & object {
  if (_queues) return _queues;

  const connection = createRedisConnection();
  const opts = { connection };

  _queues = {
    logAnalysis: new Queue(QUEUE_NAMES.LOG_ANALYSIS, opts),
    skillGen: new Queue(QUEUE_NAMES.SKILL_GEN, opts),
    evalRunner: new Queue(QUEUE_NAMES.EVAL_RUNNER, opts),
  };

  logger.info("BullMQ queues initialized", {
    queues: Object.values(QUEUE_NAMES),
  });

  return _queues;
}

// ─── Enqueue helpers ───────────────────────────────────────────────────────

export async function enqueueLogAnalysis(data: LogAnalysisJob): Promise<string> {
  const parsed = LogAnalysisJobSchema.parse(data);
  const queues = getQueues();
  const job = await queues.logAnalysis.add("analyze", parsed, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
  logger.debug("Enqueued log-analysis job", { jobId: job.id, logEntryId: parsed.logEntryId });
  return job.id ?? "";
}

export async function enqueueSkillGen(data: SkillGenJob): Promise<string> {
  const parsed = SkillGenJobSchema.parse(data);
  const queues = getQueues();
  const job = await queues.skillGen.add("generate", parsed, {
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
  logger.debug("Enqueued skill-gen job", { jobId: job.id, name: parsed.skeletonName });
  return job.id ?? "";
}

export async function enqueueEvalRunner(data: EvalRunnerJob): Promise<string> {
  const parsed = EvalRunnerJobSchema.parse(data);
  const queues = getQueues();
  const job = await queues.evalRunner.add("eval", parsed, {
    attempts: 2,
    backoff: { type: "fixed", delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
  logger.debug("Enqueued eval-runner job", { jobId: job.id, skillId: parsed.skillId });
  return job.id ?? "";
}

// ─── Worker factory ────────────────────────────────────────────────────────

/**
 * Start all background workers. Call once at server startup.
 * Workers import their handlers lazily to avoid circular deps at boot.
 */
export function startWorkers(): void {
  const connection = createRedisConnection();

  // log-analysis worker: extract skeleton from gateway log entry
  new Worker(
    QUEUE_NAMES.LOG_ANALYSIS,
    async (job: Job) => {
      const data = LogAnalysisJobSchema.parse(job.data);
      logger.info("Worker[log-analysis]: processing", { jobId: job.id, logEntryId: data.logEntryId });

      const { extractSkeleton } = await import("../skills/skeletonExtractor.js");
      const skeleton = await extractSkeleton({
        prompt: data.prompt,
        response: data.response,
        domain: data.domain,
        keyVaultRef: data.keyVaultRef,
        provider: data.provider as "openai" | "anthropic" | "google-ai-studio" | "workers-ai",
        model: data.model,
      });

      // Enqueue skill generation from the extracted skeleton
      await enqueueSkillGen(SkillGenJobSchema.parse({
        skeletonName: skeleton.name,
        skeletonDescription: skeleton.description,
        patternType: skeleton.patternType,
        steps: skeleton.steps,
        primitives: skeleton.primitives,
        tags: skeleton.tags,
        strippedDomainTerms: skeleton.strippedDomainTerms,
        keyVaultRef: data.keyVaultRef,
        provider: data.provider,
      }));

      return { skeletonName: skeleton.name };
    },
    { connection, concurrency: 2 }
  );

  // skill-gen worker: generate SKILL.md from skeleton
  new Worker(
    QUEUE_NAMES.SKILL_GEN,
    async (job: Job) => {
      const data = SkillGenJobSchema.parse(job.data);
      logger.info("Worker[skill-gen]: processing", { jobId: job.id, name: data.skeletonName });

      const { generateSkill, GeneratorInputSchema } = await import("../skills/generator.js");
      const generated = await generateSkill(GeneratorInputSchema.parse({
        skeleton: {
          name: data.skeletonName,
          description: data.skeletonDescription,
          patternType: data.patternType,
          steps: data.steps,
          primitives: data.primitives,
          tags: data.tags,
          strippedDomainTerms: data.strippedDomainTerms,
        },
        keyVaultRef: data.keyVaultRef,
        provider: data.provider,
        model: data.model,
      }));

      return { slug: generated.slug, versionId: generated.versionId };
    },
    { connection, concurrency: 2 }
  );

  // eval-runner worker: A/B eval for skill injection
  new Worker(
    QUEUE_NAMES.EVAL_RUNNER,
    async (job: Job) => {
      const data = EvalRunnerJobSchema.parse(job.data);
      logger.info("Worker[eval-runner]: processing", { jobId: job.id, skillId: data.skillId });

      const { runEval } = await import("../eval/evalRunner.js");
      const result = await runEval({
        prompt: data.prompt,
        skillId: data.skillId,
        keyVaultRef: data.keyVaultRef,
        provider: data.provider,
        model: data.model,
        judgeModel: data.judgeModel,
        expectedOutcome: data.expectedOutcome,
      });

      return {
        experimentId: result.experimentId,
        verdict: result.verdict,
        deltaScore: result.delta.judgeScore,
      };
    },
    { connection, concurrency: 1 } // evals are expensive — serial
  );

  logger.info("BullMQ workers started", {
    workers: Object.values(QUEUE_NAMES),
  });
}
