/**
 * Experiment Runner (P3-02)
 *
 * Picks a skill from the registry, generates a variant using a strategy,
 * then tests both original and variant against a set of eval tasks.
 *
 * Flow:
 *   1. Pick skill candidate (usage_count > 0, below score threshold)
 *   2. Select a variant strategy (prompt-restructure, few-shot, chain-of-thought, etc.)
 *   3. Generate variant SKILL.md via LLM
 *   4. Run original + variant through the eval runner on each task
 *   5. Score results with the experimentScorer
 *   6. Persist to autoresearch_experiments
 *
 * All LLM calls route through Cloudflare AI Gateway — no direct provider calls.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { completion } from "../gateway/client.js";
import { getDb, persistDb } from "../db/database.js";
import { judgeTrace } from "../judge/judgeScorer.js";
import { injectSkills } from "../skills/injector.js";
import { scoreExperiment, aggregateScores, type ScorerWeights, DEFAULT_WEIGHTS } from "./experimentScorer.js";
import { logger } from "../utils/logger.js";

// ─── Schemas ────────────────────────────────────────────────────────────────

/** Strategies for generating skill variants */
export const VARIANT_STRATEGIES = [
  "prompt-restructure",
  "few-shot-examples",
  "chain-of-thought",
  "direct-answer",
  "algorithm-first",
] as const;

export type VariantStrategy = (typeof VARIANT_STRATEGIES)[number];

export const EvalTaskSpecSchema = z.object({
  prompt: z.string().min(1),
  expectedOutcome: z.string().optional(),
  domain: z.string().optional(),
});
export type EvalTaskSpec = z.infer<typeof EvalTaskSpecSchema>;

export const RunnerConfigSchema = z.object({
  runId: z.string().min(1),
  keyVaultRef: z.string().min(1),
  provider: z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]).default("anthropic"),
  taskModel: z.string().default("claude-haiku-4-5-20251001"),
  judgeModel: z.string().default("claude-sonnet-4-6"),
  scorerWeights: z.custom<ScorerWeights>().optional(),
  strategy: z.enum(VARIANT_STRATEGIES).optional(),
  maxTokens: z.number().int().positive().default(1024),
});
export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

// ─── Skill picker ────────────────────────────────────────────────────────────

interface SkillCandidate {
  id: string;
  name: string;
  content: string;
  score: number;
  usageCount: number;
}

export function pickSkillCandidate(
  scoreThreshold = 0.8,
  limit = 5
): SkillCandidate | undefined {
  const db = getDb();
  const result = db.exec(
    `SELECT id, name, content, score, usage_count
     FROM skills
     WHERE score < ?
     ORDER BY usage_count DESC, score ASC
     LIMIT ?`,
    [scoreThreshold, limit]
  );

  if (!result[0]?.values.length) return undefined;

  // Pick one pseudo-randomly from the candidates
  const values = result[0].values;
  const cols = result[0].columns;
  const idx = Math.floor(Math.random() * values.length);
  const row = values[idx]!;
  const obj: Record<string, unknown> = {};
  cols.forEach((col, i) => { obj[col] = row[i]; });

  return {
    id: obj["id"] as string,
    name: obj["name"] as string,
    content: obj["content"] as string,
    score: (obj["score"] as number | null) ?? 0,
    usageCount: (obj["usage_count"] as number | null) ?? 0,
  };
}

// ─── Variant generator ───────────────────────────────────────────────────────

const STRATEGY_PROMPTS: Record<VariantStrategy, string> = {
  "prompt-restructure":
    "Rewrite this SKILL.md with a clearer structure: lead with the most actionable step, " +
    "consolidate redundant steps, and sharpen every sentence to remove ambiguity.",
  "few-shot-examples":
    "Rewrite this SKILL.md to include 2–3 concrete, domain-agnostic examples " +
    "illustrating how to apply each step. Keep examples abstract (use {placeholders}).",
  "chain-of-thought":
    "Rewrite this SKILL.md to make the reasoning chain explicit: for each step, " +
    "add a brief 'Why:' annotation explaining the rationale.",
  "direct-answer":
    "Rewrite this SKILL.md in a terse, direct style. Remove all preamble, " +
    "cut every step to one crisp imperative sentence, and eliminate optional guidance.",
  "algorithm-first":
    "Rewrite this SKILL.md to lead with the algorithm/pseudocode section, " +
    "then follow with prose steps. Programmers should be able to implement from the pseudocode alone.",
};

export async function generateVariant(
  skill: SkillCandidate,
  strategy: VariantStrategy,
  config: RunnerConfig
): Promise<string> {
  const strategyPrompt = STRATEGY_PROMPTS[strategy];

  const response = await completion({
    provider: config.provider,
    model: "claude-sonnet-4-6",
    keyVaultRef: config.keyVaultRef,
    messages: [
      {
        role: "system",
        content: `You are a technical documentation specialist optimizing skill documentation for AI agents.
Output ONLY the improved SKILL.md markdown. No preamble, no code fences around the full document.`,
      },
      {
        role: "user",
        content: `STRATEGY: ${strategyPrompt}

ORIGINAL SKILL.md for "${skill.name}":
${skill.content}

Apply the strategy above and output the improved SKILL.md.`,
      },
    ],
    temperature: 0.35,
    maxTokens: config.maxTokens,
  });

  return response.content.trim();
}

// ─── Single eval run (one task, one context) ────────────────────────────────

async function runSingleEval(
  task: EvalTaskSpec,
  systemContext: string,
  config: RunnerConfig
): Promise<{ response: string; tokens: number; latencyMs: number; judgeScore: number }> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  if (systemContext.length > 0) {
    messages.push({ role: "system", content: systemContext });
  }
  messages.push({ role: "user", content: task.prompt });

  const start = Date.now();
  const result = await completion({
    provider: config.provider,
    model: config.taskModel,
    messages,
    keyVaultRef: config.keyVaultRef,
    skipCache: true,
  });
  const latencyMs = Date.now() - start;
  const tokens = result.promptTokens + result.outputTokens;

  const judgeResult = await judgeTrace({
    prompt: task.prompt,
    response: result.content,
    expectedOutcome: task.expectedOutcome,
    keyVaultRef: config.keyVaultRef,
    provider: config.provider,
    model: config.judgeModel,
  });

  return { response: result.content, tokens, latencyMs, judgeScore: judgeResult.score };
}

// ─── Experiment runner ───────────────────────────────────────────────────────

export interface ExperimentResult {
  id: string;
  runId: string;
  skillId: string;
  strategy: VariantStrategy;
  variantContent: string;
  scorerResult: ReturnType<typeof scoreExperiment>;
  aggregated: ReturnType<typeof aggregateScores>;
  promoted: boolean;
  ranAt: string;
}

/**
 * Run a single experiment: pick → generate variant → eval both → score → persist.
 */
export async function runExperiment(
  skill: SkillCandidate,
  tasks: EvalTaskSpec[],
  config: RunnerConfig
): Promise<ExperimentResult> {
  const parsedConfig = RunnerConfigSchema.parse(config);
  const strategy: VariantStrategy =
    parsedConfig.strategy ??
    VARIANT_STRATEGIES[Math.floor(Math.random() * VARIANT_STRATEGIES.length)]!;
  const weights: ScorerWeights = parsedConfig.scorerWeights ?? DEFAULT_WEIGHTS;

  logger.info("ExperimentRunner: generating variant", {
    skillId: skill.id,
    skillName: skill.name,
    strategy,
  });

  const variantContent = await generateVariant(skill, strategy, parsedConfig);

  // Run all tasks against original and variant, accumulate raw metrics
  const perTaskScores: ReturnType<typeof scoreExperiment>[] = [];
  let totalOriginalTokens = 0;
  let totalVariantTokens = 0;
  let totalOriginalLatency = 0;
  let totalVariantLatency = 0;
  let avgOriginalJudge = 0;
  let avgVariantJudge = 0;

  for (const task of tasks) {
    // Original: skill content as system context
    const originalCtx = `# Context\nYou have access to this skill:\n\n${skill.content}`;
    // Variant: generated variant content as system context
    const variantCtx = `# Context\nYou have access to this skill:\n\n${variantContent}`;
    // Shared BM25 injected context as a normalized baseline for both arms
    const injection = injectSkills(task.prompt, { topN: 1 });
    const baseCtx = injection.systemFragment;

    const [originalRun, variantRun] = await Promise.all([
      runSingleEval(task, `${baseCtx}\n\n${originalCtx}`, parsedConfig),
      runSingleEval(task, `${baseCtx}\n\n${variantCtx}`, parsedConfig),
    ]);

    totalOriginalTokens += originalRun.tokens;
    totalVariantTokens += variantRun.tokens;
    totalOriginalLatency += originalRun.latencyMs;
    totalVariantLatency += variantRun.latencyMs;
    avgOriginalJudge += originalRun.judgeScore;
    avgVariantJudge += variantRun.judgeScore;

    const taskScore = scoreExperiment(
      { judgeScore: originalRun.judgeScore, tokens: originalRun.tokens, latencyMs: originalRun.latencyMs },
      { judgeScore: variantRun.judgeScore, tokens: variantRun.tokens, latencyMs: variantRun.latencyMs },
      weights
    );
    perTaskScores.push(taskScore);

    logger.debug("ExperimentRunner: task scored", {
      prompt: task.prompt.slice(0, 60),
      winner: taskScore.winner,
      delta: taskScore.compositeDelta.toFixed(3),
    });
  }

  const taskCount = Math.max(tasks.length, 1);
  avgOriginalJudge /= taskCount;
  avgVariantJudge /= taskCount;

  const aggregated = aggregateScores(perTaskScores);
  const representativeScore = perTaskScores[perTaskScores.length - 1] ?? perTaskScores[0]!;

  const id = randomUUID();
  const ranAt = new Date().toISOString();
  const promoted = aggregated.dominantWinner === "variant";

  const db = getDb();
  db.run(
    `INSERT INTO autoresearch_experiments
       (id, run_id, skill_id, strategy,
        original_score, variant_score,
        original_tokens, variant_tokens,
        original_latency_ms, variant_latency_ms,
        composite_delta, winner, confidence, promoted, ran_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      parsedConfig.runId,
      skill.id,
      strategy,
      avgOriginalJudge,
      avgVariantJudge,
      totalOriginalTokens,
      totalVariantTokens,
      totalOriginalLatency,
      totalVariantLatency,
      aggregated.avgDelta,
      aggregated.dominantWinner,
      representativeScore.confidence,
      promoted ? 1 : 0,
      ranAt,
    ]
  );
  persistDb();

  logger.info("ExperimentRunner: experiment complete", {
    id,
    skillId: skill.id,
    strategy,
    winner: aggregated.dominantWinner,
    avgDelta: aggregated.avgDelta.toFixed(3),
    winRate: aggregated.winRate.toFixed(2),
    promoted,
  });

  return {
    id,
    runId: parsedConfig.runId,
    skillId: skill.id,
    strategy,
    variantContent,
    scorerResult: representativeScore,
    aggregated,
    promoted,
    ranAt,
  };
}
