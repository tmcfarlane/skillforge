/**
 * Skeleton Extractor (P2-03)
 *
 * Converts a raw LLM trace (prompt + response) into a domain-stripped
 * computational skeleton — the abstract pattern that would apply across
 * different problem domains.
 *
 * Uses a multi-step reasoning approach (mirroring sequential-thinking MCP):
 *   Step 1: Identify what was actually computed (not what it was about)
 *   Step 2: Name the primitive operations involved
 *   Step 3: Strip domain names, replace with generic placeholders
 *   Step 4: Classify the pattern type
 *
 * All LLM calls go through Cloudflare AI Gateway.
 */

import { z } from "zod";
import { completion } from "../gateway/client.js";
import { logger } from "../utils/logger.js";

// ─── Schemas ───────────────────────────────────────────────────────────────

export const TraceInputSchema = z.object({
  /** The original user prompt / task description */
  prompt: z.string().min(1),
  /** The LLM response / solution */
  response: z.string().min(1),
  /** Optional domain hint (e.g. "e-commerce", "infrastructure") */
  domain: z.string().optional(),
  /** Gateway Key Vault reference */
  keyVaultRef: z.string().min(1),
  /** Provider (defaults to anthropic) */
  provider: z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]).default("anthropic"),
  /** Model to use for skeleton extraction */
  model: z.string().default("claude-sonnet-4-6"),
});

export type TraceInput = z.infer<typeof TraceInputSchema>;

export const SkeletonSchema = z.object({
  /** Short noun-phrase name for this pattern (kebab-case) */
  name: z.string().min(1),
  /** One sentence: what the pattern accomplishes abstractly */
  description: z.string().min(1),
  /**
   * Pattern type classification:
   * - transform: input → output data transformation
   * - search: find elements matching criteria in a collection
   * - aggregate: combine multiple values into one (sum, avg, max)
   * - validate: check constraints and return pass/fail
   * - orchestrate: coordinate multiple sub-operations in sequence
   * - generate: produce new artifacts from a spec or template
   * - evaluate: score or rank candidates against criteria
   * - route: select next action based on current state
   */
  patternType: z.enum([
    "transform",
    "search",
    "aggregate",
    "validate",
    "orchestrate",
    "generate",
    "evaluate",
    "route",
  ]),
  /**
   * Abstract algorithmic steps — domain names replaced with {placeholders}.
   * Each step is a complete, actionable sentence.
   */
  steps: z.array(z.string().min(1)).min(1).max(10),
  /**
   * Primitive operations used (http-fetch, sql-query, caching, etc.)
   */
  primitives: z.array(z.string().min(1)),
  /**
   * Technology tags for taxonomy classification.
   */
  tags: z.array(z.string().min(1)),
  /**
   * Which parts of the original trace were stripped as domain-specific?
   */
  strippedDomainTerms: z.array(z.string()),
});

export type Skeleton = z.infer<typeof SkeletonSchema>;

// ─── System prompts ────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are a computational pattern recognizer.

Given a task trace (prompt + response), extract the ABSTRACT COMPUTATIONAL SKELETON — the reusable algorithmic pattern stripped of all domain-specific details.

Your job is to identify:
1. What abstract computation happened (not what domain it was in)
2. The primitive operations used
3. The pattern type
4. Generic steps that would apply in any domain

Rules:
- Replace domain names with {placeholders}: "Cloudflare gateway" → "{api_gateway}", "user email" → "{identifier}", etc.
- Keep steps abstract but specific enough to be actionable
- Pattern type must be one of: transform, search, aggregate, validate, orchestrate, generate, evaluate, route

Respond ONLY with a valid JSON object matching this schema:
{
  "name": "<kebab-case-noun-phrase>",
  "description": "<one sentence abstract description>",
  "patternType": "<one of the 8 types>",
  "steps": ["<step 1>", "<step 2>", ...],
  "primitives": ["<primitive 1>", ...],
  "tags": ["<tag1>", ...],
  "strippedDomainTerms": ["<term1>", ...]
}

No markdown. No explanation. JSON only.`;

// ─── Core extraction ───────────────────────────────────────────────────────

/**
 * Extract the computational skeleton from a single trace.
 */
export async function extractSkeleton(input: TraceInput): Promise<Skeleton> {
  const parsed = TraceInputSchema.parse(input);

  const userContent = [
    `TASK PROMPT:\n${parsed.prompt}`,
    `LLM RESPONSE:\n${parsed.response}`,
    parsed.domain ? `DOMAIN HINT: ${parsed.domain}` : "",
    "\nExtract the abstract computational skeleton.",
  ]
    .filter(Boolean)
    .join("\n\n");

  logger.info("SkeletonExtractor: extracting", {
    promptLength: parsed.prompt.length,
    responseLength: parsed.response.length,
  });

  const result = await completion({
    provider: parsed.provider,
    model: parsed.model,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM },
      { role: "user", content: userContent },
    ],
    temperature: 0,
    maxTokens: 1024,
    keyVaultRef: parsed.keyVaultRef,
    skipCache: false,
  });

  let skeleton: Skeleton;
  try {
    skeleton = SkeletonSchema.parse(JSON.parse(result.content));
  } catch (err) {
    logger.error("SkeletonExtractor: parse failed", { raw: result.content, err });
    throw new Error(`Failed to parse skeleton response: ${String(err)}`);
  }

  logger.info("SkeletonExtractor: extracted skeleton", {
    name: skeleton.name,
    patternType: skeleton.patternType,
    stepCount: skeleton.steps.length,
    strippedTerms: skeleton.strippedDomainTerms.length,
  });

  return skeleton;
}

/**
 * Extract skeletons from multiple traces and return the set.
 * Used for P2-04 consistency testing across 10 traces.
 */
export async function extractSkeletons(
  inputs: TraceInput[]
): Promise<Array<{ input: TraceInput; skeleton: Skeleton; error?: string }>> {
  const results: Array<{ input: TraceInput; skeleton: Skeleton; error?: string }> = [];

  for (const input of inputs) {
    try {
      const skeleton = await extractSkeleton(input);
      results.push({ input, skeleton });
    } catch (err) {
      logger.warn("SkeletonExtractor: failed for trace", {
        prompt: input.prompt.slice(0, 80),
        err: String(err),
      });
      results.push({
        input,
        skeleton: {
          name: "unknown",
          description: "Extraction failed",
          patternType: "transform",
          steps: [],
          primitives: [],
          tags: [],
          strippedDomainTerms: [],
        },
        error: String(err),
      });
    }
  }

  return results;
}

/**
 * Measure consistency across multiple extracted skeletons for the same pattern.
 * Returns a score [0..1] where 1.0 means all skeletons share the same patternType.
 */
export function measureSkeletonConsistency(skeletons: Skeleton[]): {
  consistencyScore: number;
  dominantPatternType: string;
  patternTypeCounts: Record<string, number>;
} {
  if (skeletons.length === 0) {
    return { consistencyScore: 0, dominantPatternType: "unknown", patternTypeCounts: {} };
  }

  const counts: Record<string, number> = {};
  for (const s of skeletons) {
    counts[s.patternType] = (counts[s.patternType] ?? 0) + 1;
  }

  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const dominantType = dominant?.[0] ?? "unknown";
  const dominantCount = dominant?.[1] ?? 0;

  return {
    consistencyScore: dominantCount / skeletons.length,
    dominantPatternType: dominantType,
    patternTypeCounts: counts,
  };
}
