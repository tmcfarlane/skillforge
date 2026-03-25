/**
 * P2-08: Skill Matcher (BM25) Tests
 *
 * Verifies BM25 tokenization and scoring behavior without needing a live DB.
 * The matchSkills function is tested via its internal logic extracted here.
 */

import { describe, it, expect } from "vitest";

// ─── Replicate tokenizer for unit testing ──────────────────────────────────

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

// ─── Tokenizer tests ───────────────────────────────────────────────────────

describe("BM25 tokenizer", () => {
  it("lowercases and splits on whitespace", () => {
    const tokens = tokenize("Cloudflare AI Gateway");
    expect(tokens).toContain("cloudflare");
    expect(tokens).toContain("ai");
    expect(tokens).toContain("gateway");
  });

  it("removes stopwords", () => {
    const tokens = tokenize("how to use the gateway");
    expect(tokens).not.toContain("how");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("use");
    expect(tokens).toContain("gateway");
  });

  it("filters tokens shorter than 2 chars", () => {
    const tokens = tokenize("a b c test");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("b");
    expect(tokens).not.toContain("c");
    expect(tokens).toContain("test");
  });

  it("handles empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("handles special characters by replacing with spaces", () => {
    const tokens = tokenize("sql.js + BullMQ@redis!");
    expect(tokens).toContain("sql");
    expect(tokens).toContain("js");
    expect(tokens).toContain("bullmq");
    expect(tokens).toContain("redis");
  });

  it("preserves hyphenated terms", () => {
    const tokens = tokenize("llm-as-judge evaluation");
    expect(tokens).toContain("llm-as-judge");
    expect(tokens).toContain("evaluation");
  });
});

// ─── BM25 scoring behavior ─────────────────────────────────────────────────

describe("BM25 scoring properties", () => {
  // Inline BM25 for unit testing without DB dependency
  const K1 = 1.5;
  const B = 0.75;

  function simpleBm25(
    queryTerms: string[],
    docTokens: string[],
    avgDocLen: number,
    totalDocs: number,
    df: number
  ): number {
    let score = 0;
    const tf = queryTerms.filter((t) => docTokens.includes(t)).length;
    if (tf === 0) return 0;

    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
    const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (docTokens.length / avgDocLen)));
    score = idf * tfNorm;
    return score;
  }

  it("returns 0 when query has no matching terms", () => {
    const score = simpleBm25(["xyz", "abc"], ["cloudflare", "gateway"], 50, 10, 1);
    expect(score).toBe(0);
  });

  it("returns positive score when query matches document", () => {
    const score = simpleBm25(["cloudflare", "gateway"], ["cloudflare", "gateway", "setup"], 50, 10, 2);
    expect(score).toBeGreaterThan(0);
  });

  it("rare terms (low df) score higher than common terms (high df)", () => {
    const rareScore = simpleBm25(["rareterm"], ["rareterm", "doc"], 50, 100, 1);
    const commonScore = simpleBm25(["common"], ["common", "doc"], 50, 100, 90);
    expect(rareScore).toBeGreaterThan(commonScore);
  });

  it("longer documents get penalized (length normalization)", () => {
    const shortDocScore = simpleBm25(["gateway"], ["gateway"], 50, 10, 1);
    const longDocScore = simpleBm25(
      ["gateway"],
      ["gateway", ...Array(200).fill("padding")],
      50,
      10,
      1
    );
    expect(shortDocScore).toBeGreaterThan(longDocScore);
  });
});

// ─── Snippet extraction ────────────────────────────────────────────────────

describe("Snippet extraction", () => {
  function extractSnippet(content: string, queryTokens: string[], maxLen = 160): string {
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
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

  it("returns the line with the most query term hits", () => {
    const content = "First line about nothing\nSecond line about cloudflare gateway setup\nThird line";
    const snippet = extractSnippet(content, ["cloudflare", "gateway", "setup"]);
    expect(snippet).toContain("cloudflare");
  });

  it("truncates long snippets at maxLen", () => {
    const longLine = "x".repeat(200);
    const snippet = extractSnippet(longLine, ["x"], 160);
    expect(snippet.length).toBeLessThanOrEqual(160);
    expect(snippet.endsWith("...")).toBe(true);
  });

  it("returns first line when no query terms match", () => {
    const content = "First line\nSecond line";
    const snippet = extractSnippet(content, ["nomatch"]);
    expect(snippet).toBe("First line");
  });

  it("returns empty string for empty content", () => {
    expect(extractSnippet("", ["query"])).toBe("");
  });
});
