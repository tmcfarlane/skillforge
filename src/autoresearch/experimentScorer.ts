/**
 * Experiment Scorer (P3-03)
 *
 * Compares original skill vs variant across three dimensions:
 *   - LLM judge score (quality — higher is better)
 *   - Token count (efficiency — lower is better)
 *   - Latency ms (speed — lower is better)
 *
 * Each dimension is normalized to [0..1] and combined with configurable weights
 * into a single composite delta. A positive delta means the variant is better.
 *
 * Confidence is computed from the magnitude of the composite delta relative
 * to the threshold. Experiments below the confidence threshold are "neutral".
 */

import { z } from "zod";

// ─── Schemas ────────────────────────────────────────────────────────────────

export const ScorerWeightsSchema = z.object({
  /** Weight for LLM judge score delta (0..1) */
  judgeScore: z.number().min(0).max(1).default(0.60),
  /** Weight for token efficiency delta (0..1, negative delta = fewer tokens = better) */
  tokenEfficiency: z.number().min(0).max(1).default(0.25),
  /** Weight for latency delta (0..1, negative delta = faster = better) */
  latency: z.number().min(0).max(1).default(0.15),
}).refine(
  (w) => Math.abs(w.judgeScore + w.tokenEfficiency + w.latency - 1.0) < 0.001,
  { message: "Scorer weights must sum to 1.0" }
);

export type ScorerWeights = z.infer<typeof ScorerWeightsSchema>;

export const DEFAULT_WEIGHTS: ScorerWeights = {
  judgeScore: 0.60,
  tokenEfficiency: 0.25,
  latency: 0.15,
};

export const ExperimentMetricsSchema = z.object({
  judgeScore: z.number().min(0).max(1),
  tokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
});

export type ExperimentMetrics = z.infer<typeof ExperimentMetricsSchema>;

export const ScorerResultSchema = z.object({
  /** Composite delta (variant - original), normalized. Positive = variant wins. */
  compositeDelta: z.number(),
  /** Per-dimension deltas */
  dimensions: z.object({
    judgeScoreDelta: z.number(),
    tokenDelta: z.number(),     // negative = variant used fewer tokens (good)
    latencyDelta: z.number(),   // negative = variant was faster (good)
  }),
  /** 0..1: how confident are we in the result? */
  confidence: z.number().min(0).max(1),
  /** Who won? */
  winner: z.enum(["variant", "original", "tie"]),
});

export type ScorerResult = z.infer<typeof ScorerResultSchema>;

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum composite delta to declare a winner (below this = tie). */
export const CONFIDENCE_THRESHOLD = 0.05;

/**
 * Max token reference used for normalization.
 * If either run uses more than this, normalize at 100%.
 */
const MAX_TOKEN_REF = 2000;

/**
 * Max latency reference (ms) for normalization.
 */
const MAX_LATENCY_REF = 10_000;

// ─── Normalization helpers ───────────────────────────────────────────────────

/**
 * Normalize a token-efficiency improvement to [-1, 1].
 * Positive means variant used fewer tokens (better).
 */
function normalizeTokenDelta(originalTokens: number, variantTokens: number): number {
  const rawDelta = originalTokens - variantTokens; // positive = variant saved tokens
  return rawDelta / MAX_TOKEN_REF;
}

/**
 * Normalize a latency improvement to [-1, 1].
 * Positive means variant was faster (better).
 */
function normalizeLatencyDelta(originalMs: number, variantMs: number): number {
  const rawDelta = originalMs - variantMs; // positive = variant was faster
  return rawDelta / MAX_LATENCY_REF;
}

// ─── Scorer ──────────────────────────────────────────────────────────────────

/**
 * Score an experiment comparing original vs variant metrics.
 * Returns composite delta, per-dimension deltas, confidence, and winner.
 */
export function scoreExperiment(
  original: ExperimentMetrics,
  variant: ExperimentMetrics,
  weights: ScorerWeights = DEFAULT_WEIGHTS
): ScorerResult {
  const parsedOriginal = ExperimentMetricsSchema.parse(original);
  const parsedVariant = ExperimentMetricsSchema.parse(variant);
  const parsedWeights = ScorerWeightsSchema.parse(weights);

  // Judge score: direct delta (already normalized [0..1])
  const judgeScoreDelta = parsedVariant.judgeScore - parsedOriginal.judgeScore;

  // Token efficiency: normalized (positive = variant used fewer tokens)
  const tokenNorm = normalizeTokenDelta(parsedOriginal.tokens, parsedVariant.tokens);
  const tokenDelta = parsedVariant.tokens - parsedOriginal.tokens; // raw for reporting

  // Latency: normalized (positive = variant was faster)
  const latencyNorm = normalizeLatencyDelta(parsedOriginal.latencyMs, parsedVariant.latencyMs);
  const latencyDelta = parsedVariant.latencyMs - parsedOriginal.latencyMs; // raw for reporting

  // Composite: weight × contribution
  // judgeScore: direct delta (positive = variant better)
  // tokenEfficiency: normalized positive = variant better
  // latency: normalized positive = variant better
  const compositeDelta =
    parsedWeights.judgeScore * judgeScoreDelta +
    parsedWeights.tokenEfficiency * tokenNorm +
    parsedWeights.latency * latencyNorm;

  // Confidence: how far above threshold is the magnitude?
  const absComposite = Math.abs(compositeDelta);
  const confidence = Math.min(absComposite / (CONFIDENCE_THRESHOLD * 2), 1);

  let winner: ScorerResult["winner"];
  if (compositeDelta > CONFIDENCE_THRESHOLD) {
    winner = "variant";
  } else if (compositeDelta < -CONFIDENCE_THRESHOLD) {
    winner = "original";
  } else {
    winner = "tie";
  }

  return ScorerResultSchema.parse({
    compositeDelta,
    dimensions: { judgeScoreDelta, tokenDelta, latencyDelta },
    confidence,
    winner,
  });
}

/**
 * Summarize multiple experiment results into an aggregate score.
 * Returns the average composite delta and dominant winner across runs.
 */
export function aggregateScores(results: ScorerResult[]): {
  avgDelta: number;
  winRate: number;
  dominantWinner: "variant" | "original" | "tie";
} {
  if (results.length === 0) {
    return { avgDelta: 0, winRate: 0, dominantWinner: "tie" };
  }

  const avgDelta = results.reduce((s, r) => s + r.compositeDelta, 0) / results.length;
  const variantWins = results.filter((r) => r.winner === "variant").length;
  const winRate = variantWins / results.length;

  let dominantWinner: "variant" | "original" | "tie";
  if (avgDelta > CONFIDENCE_THRESHOLD) {
    dominantWinner = "variant";
  } else if (avgDelta < -CONFIDENCE_THRESHOLD) {
    dominantWinner = "original";
  } else {
    dominantWinner = "tie";
  }

  return { avgDelta, winRate, dominantWinner };
}
