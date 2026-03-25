/**
 * Success Signal Aggregator (P2-02)
 *
 * Combines multiple evidence sources into a single composite success score
 * for a skill or experiment. Signal hierarchy (highest → lowest trust):
 *
 *   1. Explicit feedback  (weight 0.50) — user-submitted rating via webhook
 *   2. LLM judge score    (weight 0.35) — async Claude evaluation
 *   3. Implicit signal    (weight 0.15) — absence of follow-up = task done
 *
 * All signals are normalized to [0, 1] before weighting.
 * Missing signals fall back to a neutral 0.5 rather than being excluded,
 * so the composite never over-penalizes for lack of data.
 */

import { z } from "zod";
import { getDb, persistDb } from "../db/database.js";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";

// ─── Signal weights ────────────────────────────────────────────────────────

const WEIGHTS = {
  explicit: 0.50,
  judge: 0.35,
  implicit: 0.15,
} as const;

const NEUTRAL = 0.5;

// ─── Input schema ──────────────────────────────────────────────────────────

export const SignalInputSchema = z.object({
  skillId: z.string().min(1),
  /**
   * Explicit feedback rating [1..5] from a human via POST /feedback.
   * Null if no human feedback available.
   */
  explicitRating: z.number().min(1).max(5).nullable(),
  /**
   * LLM judge score [0..1] from judgeScorer.
   * Null if the judge has not been run yet.
   */
  judgeScore: z.number().min(0).max(1).nullable(),
  /**
   * Implicit signal: did the user follow up with a correction?
   * true = no follow-up (success), false = follow-up detected (failure)
   * null = unknown
   */
  noFollowUp: z.boolean().nullable(),
});

export type SignalInput = z.infer<typeof SignalInputSchema>;

export interface AggregatedSignal {
  skillId: string;
  compositeScore: number;
  /** Per-signal breakdown for explainability */
  breakdown: {
    explicit: number | null;
    judge: number | null;
    implicit: number | null;
  };
  /** Number of real (non-neutral) signals present */
  signalCount: number;
  recordedAt: string;
}

// ─── Normalization helpers ─────────────────────────────────────────────────

function normalizeExplicit(rating: number | null): number {
  if (rating === null) return NEUTRAL;
  return (rating - 1) / 4; // [1..5] → [0..1]
}

function normalizeJudge(score: number | null): number {
  return score ?? NEUTRAL;
}

function normalizeImplicit(noFollowUp: boolean | null): number {
  if (noFollowUp === null) return NEUTRAL;
  return noFollowUp ? 1.0 : 0.0;
}

// ─── Core aggregation ──────────────────────────────────────────────────────

export function aggregateSignals(input: SignalInput): AggregatedSignal {
  const parsed = SignalInputSchema.parse(input);

  const explicitNorm = normalizeExplicit(parsed.explicitRating);
  const judgeNorm = normalizeJudge(parsed.judgeScore);
  const implicitNorm = normalizeImplicit(parsed.noFollowUp);

  const compositeScore =
    WEIGHTS.explicit * explicitNorm +
    WEIGHTS.judge * judgeNorm +
    WEIGHTS.implicit * implicitNorm;

  const signalCount = [
    parsed.explicitRating !== null,
    parsed.judgeScore !== null,
    parsed.noFollowUp !== null,
  ].filter(Boolean).length;

  const recordedAt = new Date().toISOString();

  logger.debug("Aggregated signals", {
    skillId: parsed.skillId,
    compositeScore,
    signalCount,
    explicit: explicitNorm,
    judge: judgeNorm,
    implicit: implicitNorm,
  });

  return {
    skillId: parsed.skillId,
    compositeScore,
    breakdown: {
      explicit: parsed.explicitRating !== null ? explicitNorm : null,
      judge: parsed.judgeScore !== null ? judgeNorm : null,
      implicit: parsed.noFollowUp !== null ? implicitNorm : null,
    },
    signalCount,
    recordedAt,
  };
}

// ─── Persistence ───────────────────────────────────────────────────────────

/**
 * Compute aggregate for a skill using all available DB evidence, then
 * persist each component to skill_scores and update skills.score.
 */
export function persistAggregatedScore(skillId: string): AggregatedSignal {
  const db = getDb();

  // Fetch latest judge score for this skill
  const judgeResult = db.exec(
    `SELECT AVG(score) as avg_score FROM judge_scores WHERE skill_id = ? ORDER BY judged_at DESC LIMIT 10`,
    [skillId]
  );
  const judgeScore = (judgeResult[0]?.values[0]?.[0] as number | null) ?? null;

  // Fetch average explicit feedback rating
  const feedbackResult = db.exec(
    `SELECT AVG(rating) as avg_rating FROM feedback WHERE skill_id = ?`,
    [skillId]
  );
  const avgRating = (feedbackResult[0]?.values[0]?.[0] as number | null) ?? null;

  // Implicit signal: use usage_count as proxy (higher usage = people found it useful)
  // No correction signal available yet — default to neutral
  const signal = aggregateSignals({
    skillId,
    explicitRating: avgRating,
    judgeScore,
    noFollowUp: null,
  });

  // Record each component in skill_scores
  const components: Array<{ type: string; score: number; weight: number }> = [
    { type: "explicit", score: signal.breakdown.explicit ?? NEUTRAL, weight: WEIGHTS.explicit },
    { type: "judge", score: signal.breakdown.judge ?? NEUTRAL, weight: WEIGHTS.judge },
    { type: "implicit", score: signal.breakdown.implicit ?? NEUTRAL, weight: WEIGHTS.implicit },
    { type: "composite", score: signal.compositeScore, weight: 1.0 },
  ];

  for (const c of components) {
    db.run(
      `INSERT INTO skill_scores (id, skill_id, score_type, score, weight, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), skillId, c.type, c.score, c.weight, signal.recordedAt]
    );
  }

  // Update the composite score on the skills table
  db.run(`UPDATE skills SET score = ?, updated_at = ? WHERE id = ?`, [
    signal.compositeScore,
    signal.recordedAt,
    skillId,
  ]);

  persistDb();

  logger.info("Persisted aggregated score", {
    skillId,
    compositeScore: signal.compositeScore,
    signalCount: signal.signalCount,
  });

  return signal;
}

/**
 * Re-aggregate scores for ALL skills in the registry.
 */
export function reAggregateAllSkills(): void {
  const db = getDb();
  const result = db.exec("SELECT id FROM skills");
  if (!result[0]) return;

  for (const row of result[0].values) {
    const skillId = row[0] as string;
    try {
      persistAggregatedScore(skillId);
    } catch (err) {
      logger.warn("Aggregator: failed for skill", { skillId, err });
    }
  }
}
