/**
 * Skill Scoring Engine (P1-05)
 *
 * Computes a composite score [0..1] for each skill based on:
 *   - usage_count (normalized against max)
 *   - feedback ratings (avg / 5)
 *   - taxonomy complexity (higher complexity = higher potential value)
 *   - recency (more recently updated = higher relevance)
 *
 * Score formula:
 *   score = w_usage * usage_score
 *         + w_feedback * feedback_score
 *         + w_complexity * complexity_score
 *         + w_recency * recency_score
 */

import { getDb, persistDb } from "../db/database.js";
import { logger } from "../utils/logger.js";

const WEIGHTS = {
  usage: 0.35,
  feedback: 0.40,
  complexity: 0.15,
  recency: 0.10,
} as const;

const COMPLEXITY_SCORES: Record<string, number> = {
  trivial: 0.1,
  low: 0.3,
  medium: 0.5,
  high: 0.75,
  expert: 1.0,
};

interface SkillRow {
  id: string;
  usage_count: number;
  taxonomy: string | null;
  updated_at: string;
  avg_rating: number | null;
}

function normalizeUsage(count: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(count / max, 1);
}

function normalizeFeedback(avgRating: number | null): number {
  if (avgRating === null) return 0.5; // neutral when no feedback
  return avgRating / 5;
}

function normalizeComplexity(taxonomy: string | null): number {
  if (!taxonomy) return 0.5;
  try {
    const parsed = JSON.parse(taxonomy) as { complexity?: string };
    return COMPLEXITY_SCORES[parsed.complexity ?? "medium"] ?? 0.5;
  } catch {
    return 0.5;
  }
}

function normalizeRecency(updatedAt: string): number {
  const now = Date.now();
  const updated = new Date(updatedAt).getTime();
  const ageMs = now - updated;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Decay: 100% at 0 days, ~50% at 30 days, ~0% at 180 days
  return Math.max(0, 1 - ageDays / 180);
}

export function computeScore(skill: SkillRow, maxUsage: number): number {
  const usageScore = normalizeUsage(skill.usage_count, maxUsage);
  const feedbackScore = normalizeFeedback(skill.avg_rating);
  const complexityScore = normalizeComplexity(skill.taxonomy);
  const recencyScore = normalizeRecency(skill.updated_at);

  return (
    WEIGHTS.usage * usageScore +
    WEIGHTS.feedback * feedbackScore +
    WEIGHTS.complexity * complexityScore +
    WEIGHTS.recency * recencyScore
  );
}

export function scoreAllSkills(): void {
  const db = getDb();

  const usageResult = db.exec("SELECT MAX(usage_count) as max_usage FROM skills");
  const maxUsage = (usageResult[0]?.values[0]?.[0] as number | null) ?? 0;

  const skillsResult = db.exec(`
    SELECT s.id, s.usage_count, s.taxonomy, s.updated_at,
           AVG(f.rating) as avg_rating
    FROM skills s
    LEFT JOIN feedback f ON f.skill_id = s.id
    GROUP BY s.id
  `);

  if (!skillsResult[0]) {
    logger.info("Scorer: no skills to score");
    return;
  }

  const columns = skillsResult[0].columns;
  const rows: SkillRow[] = skillsResult[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return {
      id: obj["id"] as string,
      usage_count: (obj["usage_count"] as number | null) ?? 0,
      taxonomy: (obj["taxonomy"] as string | null) ?? null,
      updated_at: obj["updated_at"] as string,
      avg_rating: (obj["avg_rating"] as number | null) ?? null,
    };
  });

  let updated = 0;
  for (const row of rows) {
    const score = computeScore(row, maxUsage);
    db.run("UPDATE skills SET score = ? WHERE id = ?", [score, row.id]);
    updated++;
  }

  if (updated > 0) persistDb();
  logger.info("Scorer: scores updated", { count: updated });
}
