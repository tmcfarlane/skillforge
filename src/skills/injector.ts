/**
 * Skill Injector (P1-07, enhanced P2-09)
 *
 * Assembles a context-window-aware skill prompt from stored skills.
 * Given a task description, retrieves the top-N relevant skills using:
 *   1. BM25 text matching (primary — P2-08)
 *   2. Taxonomy domain match (boost)
 *   3. Tag overlap (boost)
 *   4. Composite score (tiebreaker)
 *
 * Returns a formatted system prompt fragment and Cloudflare AI Gateway
 * metadata headers for pre-request context enrichment.
 *
 * Cloudflare metadata tag:
 *   cf-aig-metadata: {"injected_skills": ["skill-a", "skill-b"]}
 * This allows gateway logs to show which skills were injected per request.
 */

import { getDb } from "../db/database.js";
import { classify } from "../taxonomy/taxonomy.js";
import { matchSkills } from "./matcher.js";
import { logger } from "../utils/logger.js";

interface StoredSkill {
  id: string;
  name: string;
  content: string;
  taxonomy: string | null;
  score: number;
}

export interface InjectionResult {
  skills: StoredSkill[];
  systemFragment: string;
  tokenEstimate: number;
  /** Cloudflare AI Gateway metadata header value for logging */
  cfMetadataHeader: string;
}

function estimateTokens(text: string): number {
  // ~4 chars per token for English prose
  return Math.ceil(text.length / 4);
}

function parseTagsFromTaxonomy(taxonomyJson: string | null): string[] {
  if (!taxonomyJson) return [];
  try {
    const t = JSON.parse(taxonomyJson) as { tags?: string[] };
    return t.tags ?? [];
  } catch {
    return [];
  }
}

function parseDomainFromTaxonomy(taxonomyJson: string | null): string {
  if (!taxonomyJson) return "unknown";
  try {
    const t = JSON.parse(taxonomyJson) as { domain?: string };
    return t.domain ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function injectSkills(
  taskDescription: string,
  opts: { topN?: number; maxTokens?: number } = {}
): InjectionResult {
  const topN = opts.topN ?? 5;
  const maxTokens = opts.maxTokens ?? 2000;

  const taskTaxonomy = classify(taskDescription);
  const db = getDb();

  // P2-09: Primary ranking via BM25 matcher
  const bm25Matches = matchSkills(taskDescription, topN * 2); // over-fetch then re-rank
  const bm25IdSet = new Set(bm25Matches.map((m) => m.id));

  // Fetch full skill records for BM25 matches + top-scored fallbacks
  const result = db.exec(`
    SELECT id, name, content, taxonomy, score
    FROM skills
    ORDER BY score DESC
    LIMIT ?
  `, [topN * 3]);

  if (!result[0]) {
    return { skills: [], systemFragment: "", tokenEstimate: 0, cfMetadataHeader: "{}" };
  }

  const columns = result[0].columns;
  const allSkills: StoredSkill[] = result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return {
      id: obj["id"] as string,
      name: obj["name"] as string,
      content: obj["content"] as string,
      taxonomy: obj["taxonomy"] as string | null,
      score: obj["score"] as number,
    };
  });

  // Build BM25 score lookup
  const bm25ScoreLookup = new Map(bm25Matches.map((m) => [m.id, m.bm25Score]));

  // Rank: BM25 match + taxonomy boost + tag overlap + composite score
  const ranked = allSkills
    .map((skill) => {
      const domain = parseDomainFromTaxonomy(skill.taxonomy);
      const tags = parseTagsFromTaxonomy(skill.taxonomy);

      const bm25Boost = (bm25ScoreLookup.get(skill.id) ?? 0) * 0.5;
      const domainBoost = domain === taskTaxonomy.domain ? 0.3 : 0;
      const tagOverlap = taskTaxonomy.tags.filter((t) => tags.includes(t)).length * 0.1;

      return { skill, relevance: skill.score + bm25Boost + domainBoost + tagOverlap };
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, topN);

  // Build system fragment within token budget
  const selected: StoredSkill[] = [];
  let totalTokens = 0;
  const header = "## Relevant Skills\n\n";
  totalTokens += estimateTokens(header);

  for (const { skill } of ranked) {
    const block = `### ${skill.name}\n${skill.content}\n\n`;
    const blockTokens = estimateTokens(block);
    if (totalTokens + blockTokens > maxTokens) break;
    selected.push(skill);
    totalTokens += blockTokens;
  }

  const systemFragment =
    selected.length > 0
      ? header + selected.map((s) => `### ${s.name}\n${s.content}`).join("\n\n")
      : "";

  // P2-09: Build Cloudflare AI Gateway metadata header
  // cf-aig-metadata allows tagging gateway log entries with which skills were injected
  const cfMetadataHeader = JSON.stringify({
    injected_skills: selected.map((s) => s.name),
    bm25_matched: bm25Matches.slice(0, 3).map((m) => m.name),
  });

  logger.debug("Injector: assembled skill context", {
    task: taskDescription.slice(0, 60),
    skillsSelected: selected.length,
    tokenEstimate: totalTokens,
    cfMetadata: cfMetadataHeader,
  });

  // Increment usage counts
  if (selected.length > 0) {
    for (const skill of selected) {
      db.run("UPDATE skills SET usage_count = usage_count + 1 WHERE id = ?", [skill.id]);
    }
  }

  return { skills: selected, systemFragment, tokenEstimate: totalTokens, cfMetadataHeader };
}
