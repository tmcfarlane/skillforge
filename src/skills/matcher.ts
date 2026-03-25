/**
 * Skill Matcher (P2-08)
 *
 * Finds the best matching skills for a given request using BM25 text ranking.
 * BM25 is a probabilistic ranking function — it weighs term frequency against
 * document frequency across the corpus, making it more precise than TF-IDF.
 *
 * Returns top-N candidate skills ranked by relevance to the query.
 *
 * No external dependencies — BM25 implemented inline over the skills corpus
 * loaded from the SQLite registry.
 */

import { getDb } from "../db/database.js";
import { logger } from "../utils/logger.js";

// ─── BM25 parameters ───────────────────────────────────────────────────────

/** Term saturation constant — typical range [1.2, 2.0] */
const K1 = 1.5;
/** Field length normalization — 0 = no normalization, 1 = full normalization */
const B = 0.75;

// ─── Types ─────────────────────────────────────────────────────────────────

interface SkillDoc {
  id: string;
  name: string;
  content: string;
  score: number;
  /** Combined text for ranking */
  text: string;
  /** Token list (lowercased, split) */
  tokens: string[];
}

export interface MatchCandidate {
  id: string;
  name: string;
  score: number;
  bm25Score: number;
  /** Snippet of the most relevant section */
  snippet: string;
  /** Terms from the query that matched */
  matchedTerms: string[];
}

// ─── Tokenization ──────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "do",
  "for", "from", "has", "have", "he", "in", "is", "it", "its", "of", "on",
  "or", "she", "that", "the", "this", "to", "was", "we", "were", "will",
  "with", "you", "not", "use", "used", "when", "how", "what", "where",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// ─── BM25 implementation ───────────────────────────────────────────────────

function buildInvertedIndex(docs: SkillDoc[]): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const doc of docs) {
    const tf = new Map<string, number>();
    for (const token of doc.tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    for (const [token, count] of tf) {
      if (!index.has(token)) index.set(token, new Map());
      index.get(token)!.set(doc.id, count);
    }
  }
  return index;
}

function bm25Score(
  queryTokens: string[],
  doc: SkillDoc,
  index: Map<string, Map<string, number>>,
  avgDocLen: number,
  totalDocs: number
): number {
  let score = 0;
  const docLen = doc.tokens.length;

  for (const term of queryTokens) {
    const postings = index.get(term);
    if (!postings) continue;

    const tf = postings.get(doc.id) ?? 0;
    if (tf === 0) continue;

    const df = postings.size;
    // IDF with Okapi smoothing
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
    // TF normalization with length penalty
    const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (docLen / avgDocLen)));

    score += idf * tfNorm;
  }

  return score;
}

// ─── Snippet extraction ────────────────────────────────────────────────────

function extractSnippet(content: string, queryTokens: string[], maxLen = 160): string {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  // Find the line with the most query term hits
  let bestLine = "";
  let bestHits = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const hits = queryTokens.filter((t) => lower.includes(t)).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestLine = line;
    }
  }

  const snippet = bestLine || lines[0] || "";
  return snippet.length > maxLen ? snippet.slice(0, maxLen - 3) + "..." : snippet;
}

// ─── Main matcher ──────────────────────────────────────────────────────────

/**
 * Find the top-N skills that best match a query string using BM25.
 */
export function matchSkills(
  query: string,
  topN = 3
): MatchCandidate[] {
  const db = getDb();

  const result = db.exec(
    "SELECT id, name, content, score FROM skills ORDER BY score DESC"
  );

  if (!result[0]?.values.length) {
    logger.debug("Matcher: no skills in registry");
    return [];
  }

  const cols = result[0].columns;
  const docs: SkillDoc[] = result[0].values.map((row) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c, i) => { obj[c] = row[i]; });

    const name = obj["name"] as string;
    const content = obj["content"] as string;
    const text = `${name} ${content}`;

    return {
      id: obj["id"] as string,
      name,
      content,
      score: (obj["score"] as number | null) ?? 0,
      text,
      tokens: tokenize(text),
    };
  });

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    logger.debug("Matcher: empty query after tokenization");
    return [];
  }

  const index = buildInvertedIndex(docs);
  const avgDocLen = docs.reduce((sum, d) => sum + d.tokens.length, 0) / docs.length;
  const totalDocs = docs.length;

  const scored = docs.map((doc) => {
    const bm25 = bm25Score(queryTokens, doc, index, avgDocLen, totalDocs);
    const matchedTerms = queryTokens.filter((t) => index.get(t)?.has(doc.id));
    return { doc, bm25, matchedTerms };
  });

  // Sort by BM25 descending, break ties by existing skill score
  scored.sort((a, b) => b.bm25 - a.bm25 || b.doc.score - a.doc.score);

  const candidates = scored
    .slice(0, topN)
    .filter((s) => s.bm25 > 0)
    .map(({ doc, bm25, matchedTerms }) => ({
      id: doc.id,
      name: doc.name,
      score: doc.score,
      bm25Score: bm25,
      snippet: extractSnippet(doc.content, queryTokens),
      matchedTerms,
    }));

  logger.debug("Matcher: top candidates", {
    query: query.slice(0, 80),
    count: candidates.length,
    topBm25: candidates[0]?.bm25Score,
  });

  return candidates;
}
