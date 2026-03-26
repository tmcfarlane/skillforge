/**
 * Skill Updater (P3-04)
 *
 * Handles the outcome of an experiment:
 *   - Variant wins  → promote variant as new default skill content + bump version
 *   - Original wins → discard variant, record what was tried in the audit log
 *   - Tie           → no change, log as inconclusive
 *
 * All changes are written to:
 *   - skills table (content + updated_at)
 *   - skill_versions table (versioned snapshot)
 *   - autoresearch_experiments (promoted flag + notes)
 *
 * Audit trail: every outcome is recorded so nightly reports can show
 * what was tried, what changed, and what was rolled back.
 */

import { writeFileSync } from "fs";
import { randomUUID } from "crypto";
import { getDb, persistDb } from "../db/database.js";
import { logger } from "../utils/logger.js";
import { type ExperimentResult } from "./experimentRunner.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type UpdateOutcome = "promoted" | "discarded" | "inconclusive";

export interface UpdateResult {
  skillId: string;
  outcome: UpdateOutcome;
  previousScore: number;
  newScore: number;
  versionId: string | null;
  reason: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNextVersion(skillId: string): number {
  const db = getDb();
  const result = db.exec(
    "SELECT MAX(version) FROM skill_versions WHERE skill_id = ?",
    [skillId]
  );
  const max = result[0]?.values[0]?.[0];
  return typeof max === "number" ? max + 1 : 1;
}

function getSkillPath(skillId: string): string | null {
  const db = getDb();
  const result = db.exec("SELECT path FROM skills WHERE id = ?", [skillId]);
  const path = result[0]?.values[0]?.[0];
  return typeof path === "string" ? path : null;
}

function getCurrentScore(skillId: string): number {
  const db = getDb();
  const result = db.exec("SELECT score FROM skills WHERE id = ?", [skillId]);
  const score = result[0]?.values[0]?.[0];
  return typeof score === "number" ? score : 0;
}

// ─── Updater ─────────────────────────────────────────────────────────────────

/**
 * Apply the experiment result:
 *   - If variant won, promote it as the new default skill content.
 *   - If original won or tie, discard variant and write audit note.
 */
export function applyExperimentOutcome(experiment: ExperimentResult): UpdateResult {
  const db = getDb();
  const { skillId, variantContent, aggregated, scorerResult, id: experimentId } = experiment;

  const previousScore = getCurrentScore(skillId);
  const winner = aggregated.dominantWinner;

  if (winner === "variant") {
    // Promote variant
    const versionId = randomUUID();
    const nextVersion = getNextVersion(skillId);

    // Bump composite score (averaged with existing score using the delta)
    const newScore = Math.min(previousScore + Math.abs(aggregated.avgDelta) * 0.5, 1.0);

    db.run(
      `INSERT INTO skill_versions (id, skill_id, version, content, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [versionId, skillId, nextVersion, variantContent]
    );

    db.run(
      `UPDATE skills
       SET content = ?, score = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [variantContent, newScore, skillId]
    );

    // Update the experiment record
    db.run(
      `UPDATE autoresearch_experiments
       SET promoted = 1, notes = ?
       WHERE id = ?`,
      [
        `Variant promoted (v${nextVersion}). Delta: ${aggregated.avgDelta.toFixed(3)}, ` +
          `winRate: ${(aggregated.winRate * 100).toFixed(0)}%. ` +
          `Score: ${previousScore.toFixed(3)} → ${newScore.toFixed(3)}.`,
        experimentId,
      ]
    );

    // Write updated content back to disk if path exists
    const skillPath = getSkillPath(skillId);
    if (skillPath) {
      try {
        writeFileSync(skillPath, variantContent, "utf-8");
        logger.info("SkillUpdater: wrote promoted variant to disk", { skillPath });
      } catch (err) {
        logger.warn("SkillUpdater: could not write to disk (DB still updated)", { err });
      }
    }

    persistDb();

    logger.info("SkillUpdater: variant promoted", {
      skillId,
      version: nextVersion,
      delta: aggregated.avgDelta.toFixed(3),
      scoreChange: `${previousScore.toFixed(3)} → ${newScore.toFixed(3)}`,
    });

    return {
      skillId,
      outcome: "promoted",
      previousScore,
      newScore,
      versionId,
      reason:
        `Variant won (strategy: ${experiment.strategy}). ` +
        `Avg delta: ${aggregated.avgDelta.toFixed(3)}, win rate: ${(aggregated.winRate * 100).toFixed(0)}%.`,
    };
  }

  if (winner === "original") {
    // Discard variant
    db.run(
      `UPDATE autoresearch_experiments
       SET promoted = 0, notes = ?
       WHERE id = ?`,
      [
        `Variant discarded — original won. Delta: ${aggregated.avgDelta.toFixed(3)}, ` +
          `winRate: ${(aggregated.winRate * 100).toFixed(0)}%. Tried: ${experiment.strategy}.`,
        experimentId,
      ]
    );
    persistDb();

    logger.info("SkillUpdater: variant discarded (original wins)", {
      skillId,
      strategy: experiment.strategy,
      delta: aggregated.avgDelta.toFixed(3),
    });

    return {
      skillId,
      outcome: "discarded",
      previousScore,
      newScore: previousScore,
      versionId: null,
      reason:
        `Original won. Tried strategy: ${experiment.strategy}. ` +
        `Avg delta: ${aggregated.avgDelta.toFixed(3)}.`,
    };
  }

  // Tie / inconclusive
  db.run(
    `UPDATE autoresearch_experiments
     SET promoted = 0, notes = ?
     WHERE id = ?`,
    [
      `Inconclusive — no clear winner. Delta: ${aggregated.avgDelta.toFixed(3)}, ` +
        `confidence: ${scorerResult.confidence.toFixed(3)}.`,
      experimentId,
    ]
  );
  persistDb();

  logger.info("SkillUpdater: inconclusive experiment", {
    skillId,
    delta: aggregated.avgDelta.toFixed(3),
    confidence: scorerResult.confidence.toFixed(3),
  });

  return {
    skillId,
    outcome: "inconclusive",
    previousScore,
    newScore: previousScore,
    versionId: null,
    reason:
      `Tie — composite delta ${aggregated.avgDelta.toFixed(3)} below confidence threshold.`,
  };
}

/**
 * Retrieve full audit history for a skill.
 */
export function getSkillAuditLog(
  skillId: string
): Array<{
  experimentId: string;
  strategy: string;
  winner: string;
  compositeDelta: number;
  promoted: boolean;
  notes: string | null;
  ranAt: string;
}> {
  const db = getDb();
  const result = db.exec(
    `SELECT id, strategy, winner, composite_delta, promoted, notes, ran_at
     FROM autoresearch_experiments
     WHERE skill_id = ?
     ORDER BY ran_at DESC`,
    [skillId]
  );

  if (!result[0]) return [];

  return result[0].values.map((row) => ({
    experimentId: row[0] as string,
    strategy: row[1] as string,
    winner: row[2] as string,
    compositeDelta: row[3] as number,
    promoted: row[4] === 1,
    notes: row[5] as string | null,
    ranAt: row[6] as string,
  }));
}
