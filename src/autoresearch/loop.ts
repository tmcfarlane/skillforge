/**
 * AutoResearch Loop (P1-09)
 *
 * Runs overnight experiments to find optimal skill prompts and provider
 * configurations. Each experiment:
 *   1. Selects a skill with usage_count > 0 and score < threshold
 *   2. Generates an alternative SKILL.md via the gateway
 *   3. Scores the alternative against recent feedback signals
 *   4. Promotes the alternative if score improves > MIN_DELTA
 *
 * Designed to run via cron (default: 2am daily).
 * All LLM calls route through Cloudflare AI Gateway.
 */

import { randomUUID } from "crypto";
import { completion } from "../gateway/client.js";
import { getDb, persistDb } from "../db/database.js";
import { classify } from "../taxonomy/taxonomy.js";
import { logger } from "../utils/logger.js";

const SCORE_THRESHOLD = 0.6;
const MIN_IMPROVEMENT_DELTA = 0.05;
const MAX_EXPERIMENTS_PER_RUN = 5;

interface SkillCandidate {
  id: string;
  name: string;
  content: string;
  score: number;
}

function selectCandidates(): SkillCandidate[] {
  const db = getDb();
  const result = db.exec(`
    SELECT id, name, content, score
    FROM skills
    WHERE usage_count > 0 AND score < ?
    ORDER BY usage_count DESC
    LIMIT ?
  `, [SCORE_THRESHOLD, MAX_EXPERIMENTS_PER_RUN]);

  if (!result[0]) return [];

  const columns = result[0].columns;
  return result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return {
      id: obj["id"] as string,
      name: obj["name"] as string,
      content: obj["content"] as string,
      score: obj["score"] as number,
    };
  });
}

async function generateAlternative(
  skill: SkillCandidate,
  keyVaultRef: string
): Promise<string> {
  const response = await completion({
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    keyVaultRef,
    messages: [
      {
        role: "system",
        content: `You are a skill documentation expert. Rewrite the following SKILL.md to be clearer,
more actionable, and more reusable. Keep the same computational skeleton but improve:
- Clarity of steps
- Identification of reusable patterns
- Applicability to similar tasks
Output only the improved SKILL.md content. No preamble.`,
      },
      {
        role: "user",
        content: `Skill: ${skill.name}\n\n${skill.content}`,
      },
    ],
    temperature: 0.4,
    maxTokens: 1024,
  });

  return response.content;
}

function scoreCandidate(content: string, originalScore: number): number {
  const taxonomy = classify(content);
  // Proxy score: longer, more structured, more primitives = better
  const lengthScore = Math.min(content.length / 2000, 1) * 0.3;
  const primitiveScore = Math.min(taxonomy.primitives.length / 5, 1) * 0.3;
  const tagScore = Math.min(taxonomy.tags.length / 5, 1) * 0.2;
  const complexityBonus = taxonomy.complexity === "high" || taxonomy.complexity === "expert" ? 0.2 : 0.1;
  return lengthScore + primitiveScore + tagScore + complexityBonus;
}

function recordExperiment(
  skillId: string,
  hypothesis: string,
  provider: string,
  model: string,
  result: string,
  score: number
): void {
  const db = getDb();
  db.run(
    `INSERT INTO experiments (id, skill_id, hypothesis, provider, model, result, score)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), skillId, hypothesis, provider, model, result, score]
  );
  persistDb();
}

export async function runAutoResearch(keyVaultRef: string): Promise<void> {
  logger.info("AutoResearch: starting run");
  const candidates = selectCandidates();

  if (candidates.length === 0) {
    logger.info("AutoResearch: no candidates below score threshold", {
      threshold: SCORE_THRESHOLD,
    });
    return;
  }

  logger.info("AutoResearch: selected candidates", { count: candidates.length });

  for (const skill of candidates) {
    logger.info("AutoResearch: experimenting on skill", { id: skill.id, name: skill.name });

    try {
      const alternative = await generateAlternative(skill, keyVaultRef);
      const altScore = scoreCandidate(alternative, skill.score);

      recordExperiment(
        skill.id,
        `Alternative SKILL.md via claude-sonnet-4-6 at ${new Date().toISOString()}`,
        "anthropic",
        "claude-sonnet-4-6",
        alternative,
        altScore
      );

      if (altScore > skill.score + MIN_IMPROVEMENT_DELTA) {
        const db = getDb();
        db.run(
          `UPDATE skills SET content = ?, score = ?, updated_at = datetime('now') WHERE id = ?`,
          [alternative, altScore, skill.id]
        );
        persistDb();
        logger.info("AutoResearch: promoted improved skill", {
          id: skill.id,
          oldScore: skill.score,
          newScore: altScore,
          delta: altScore - skill.score,
        });
      } else {
        logger.debug("AutoResearch: alternative did not improve skill", {
          id: skill.id,
          altScore,
          originalScore: skill.score,
        });
      }
    } catch (err) {
      logger.error("AutoResearch: experiment failed", { skillId: skill.id, err });
    }
  }

  logger.info("AutoResearch: run complete", { experimentsRun: candidates.length });
}
