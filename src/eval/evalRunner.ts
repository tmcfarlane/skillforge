/**
 * Eval Runner (P2-10)
 *
 * Runs controlled A/B experiments: same task, with and without skill injection.
 * Measures the delta across three dimensions:
 *   - LLM judge score (did the response solve the problem?)
 *   - Token count (efficiency)
 *   - Latency (ms per completion)
 *
 * Stores results in the `experiments` table and records per-skill score
 * deltas in `skill_scores` for the aggregator to consume.
 *
 * Flow:
 *   task + skill_id
 *     → run WITHOUT skill (baseline)
 *     → run WITH skill injected (treatment)
 *     → judge both responses
 *     → compute delta (treatment - baseline)
 *     → store in experiments
 *     → store score delta in skill_scores
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { completion } from "../gateway/client.js";
import { injectSkills } from "../skills/injector.js";
import { judgeTrace } from "../judge/judgeScorer.js";
import { getDb, persistDb } from "../db/database.js";
import { logger } from "../utils/logger.js";

// ─── Schemas ───────────────────────────────────────────────────────────────

export const EvalTaskSchema = z.object({
  /** The task prompt to run the A/B experiment on */
  prompt: z.string().min(1),
  /** The skill to test injection for */
  skillId: z.string().min(1),
  /** Key Vault reference for LLM calls */
  keyVaultRef: z.string().min(1),
  provider: z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]).default("anthropic"),
  /** Model to use for the task completion (not the judge) */
  model: z.string().default("claude-haiku-4-5-20251001"),
  /** Model to use for judging (should differ from task model) */
  judgeModel: z.string().default("claude-sonnet-4-6"),
  /** Optional: expected outcome for the judge */
  expectedOutcome: z.string().optional(),
});

export type EvalTask = z.infer<typeof EvalTaskSchema>;

export interface EvalRun {
  id: string;
  tokens: number;
  latencyMs: number;
  judgeScore: number;
  response: string;
}

export interface EvalResult {
  experimentId: string;
  skillId: string;
  baseline: EvalRun;
  treatment: EvalRun;
  delta: {
    judgeScore: number;   // treatment - baseline (positive = skill helped)
    tokens: number;       // treatment - baseline (negative = skill reduced tokens)
    latencyMs: number;    // treatment - baseline (negative = skill was faster)
  };
  verdict: "improved" | "degraded" | "neutral";
  ranAt: string;
}

// ─── Single LLM run ────────────────────────────────────────────────────────

async function runCompletion(
  prompt: string,
  systemContext: string,
  task: EvalTask
): Promise<{ response: string; tokens: number; latencyMs: number }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  if (systemContext.length > 0) {
    messages.push({ role: "system", content: systemContext });
  }
  messages.push({ role: "user", content: prompt });

  const start = Date.now();
  const result = await completion({
    provider: task.provider,
    model: task.model,
    messages,
    keyVaultRef: task.keyVaultRef,
    skipCache: true, // eval runs must be fresh
  });
  const latencyMs = Date.now() - start;

  return {
    response: result.content,
    tokens: result.promptTokens + result.outputTokens,
    latencyMs,
  };
}

// ─── Eval runner ───────────────────────────────────────────────────────────

/**
 * Run a single A/B eval for one skill on one task.
 */
export async function runEval(task: EvalTask): Promise<EvalResult> {
  const parsed = EvalTaskSchema.parse(task);
  const db = getDb();

  logger.info("EvalRunner: starting eval", {
    skillId: parsed.skillId,
    prompt: parsed.prompt.slice(0, 80),
  });

  // ── Baseline: no skill injection ──────────────────────────────────────
  const baselineRun = await runCompletion(parsed.prompt, "", parsed);
  const baselineJudge = await judgeTrace({
    prompt: parsed.prompt,
    response: baselineRun.response,
    expectedOutcome: parsed.expectedOutcome,
    keyVaultRef: parsed.keyVaultRef,
    provider: parsed.provider,
    model: parsed.judgeModel,
    skillId: parsed.skillId,
  });

  const baseline: EvalRun = {
    id: baselineJudge.id,
    tokens: baselineRun.tokens,
    latencyMs: baselineRun.latencyMs,
    judgeScore: baselineJudge.score,
    response: baselineRun.response,
  };

  // ── Treatment: with skill injection ───────────────────────────────────
  const injection = injectSkills(parsed.prompt, { topN: 3 });
  const treatmentRun = await runCompletion(parsed.prompt, injection.systemFragment, parsed);
  const treatmentJudge = await judgeTrace({
    prompt: parsed.prompt,
    response: treatmentRun.response,
    expectedOutcome: parsed.expectedOutcome,
    keyVaultRef: parsed.keyVaultRef,
    provider: parsed.provider,
    model: parsed.judgeModel,
    skillId: parsed.skillId,
  });

  const treatment: EvalRun = {
    id: treatmentJudge.id,
    tokens: treatmentRun.tokens,
    latencyMs: treatmentRun.latencyMs,
    judgeScore: treatmentJudge.score,
    response: treatmentRun.response,
  };

  // ── Delta computation ─────────────────────────────────────────────────
  const deltaScore = treatment.judgeScore - baseline.judgeScore;
  const deltaTokens = treatment.tokens - baseline.tokens;
  const deltaLatency = treatment.latencyMs - baseline.latencyMs;

  const verdict: EvalResult["verdict"] =
    deltaScore > 0.05
      ? "improved"
      : deltaScore < -0.05
      ? "degraded"
      : "neutral";

  const ranAt = new Date().toISOString();
  const experimentId = randomUUID();

  // ── Persist experiment ────────────────────────────────────────────────
  db.run(
    `INSERT INTO experiments (id, skill_id, hypothesis, provider, model, result, score, ran_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      experimentId,
      parsed.skillId,
      `A/B eval: does skill injection improve "${parsed.prompt.slice(0, 100)}"?`,
      parsed.provider,
      parsed.model,
      JSON.stringify({
        baseline: { judgeScore: baseline.judgeScore, tokens: baseline.tokens, latencyMs: baseline.latencyMs },
        treatment: { judgeScore: treatment.judgeScore, tokens: treatment.tokens, latencyMs: treatment.latencyMs },
        delta: { judgeScore: deltaScore, tokens: deltaTokens, latencyMs: deltaLatency },
        verdict,
      }),
      treatment.judgeScore,
      ranAt,
    ]
  );

  // Record the judge score delta in skill_scores
  db.run(
    `INSERT INTO skill_scores (id, skill_id, score_type, score, weight, recorded_at)
     VALUES (?, ?, 'judge', ?, 1.0, ?)`,
    [randomUUID(), parsed.skillId, treatment.judgeScore, ranAt]
  );

  persistDb();

  logger.info("EvalRunner: eval complete", {
    experimentId,
    skillId: parsed.skillId,
    deltaScore,
    verdict,
  });

  return {
    experimentId,
    skillId: parsed.skillId,
    baseline,
    treatment,
    delta: { judgeScore: deltaScore, tokens: deltaTokens, latencyMs: deltaLatency },
    verdict,
    ranAt,
  };
}

/**
 * Run evals for multiple skill+task combinations.
 * Runs sequentially to avoid rate limits.
 */
export async function runEvalBatch(tasks: EvalTask[]): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const task of tasks) {
    const result = await runEval(task);
    results.push(result);
  }
  return results;
}

/**
 * Retrieve eval results from the DB for a given skill.
 */
export function getEvalResults(
  skillId: string,
  limit = 20
): Array<{ experimentId: string; score: number; verdict: string; ranAt: string }> {
  const db = getDb();
  const result = db.exec(
    `SELECT id, score, result, ran_at FROM experiments
     WHERE skill_id = ?
     ORDER BY ran_at DESC
     LIMIT ?`,
    [skillId, limit]
  );

  if (!result[0]) return [];

  return result[0].values.map((row) => {
    let verdict = "neutral";
    try {
      const parsed = JSON.parse(row[2] as string) as { verdict?: string };
      verdict = parsed.verdict ?? "neutral";
    } catch { /* leave neutral */ }

    return {
      experimentId: row[0] as string,
      score: row[1] as number,
      verdict,
      ranAt: row[3] as string,
    };
  });
}
