/**
 * LLM-as-Judge Scorer (P2-01)
 *
 * Async post-task evaluator. Sends a trace (prompt + response) to Claude
 * via the Cloudflare AI Gateway and asks: "Did this solve the problem?"
 *
 * Returns a normalized score in [0, 1]:
 *   1.0 = fully solved
 *   0.5 = partially solved / unclear
 *   0.0 = did not solve
 *
 * Security: all LLM calls route through Cloudflare AI Gateway.
 * No provider keys in code — Key Vault refs only.
 */

import { z } from "zod";
import { completion } from "../gateway/client.js";
import { getDb, persistDb } from "../db/database.js";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";

export const JudgeTraceSchema = z.object({
  /** Original user request / task description */
  prompt: z.string().min(1),
  /** LLM response being evaluated */
  response: z.string().min(1),
  /** Optional: expected outcome hint for the judge */
  expectedOutcome: z.string().optional(),
  /** Gateway Key Vault reference for the judge model */
  keyVaultRef: z.string().min(1),
  /** Provider to use for judging (defaults to anthropic) */
  provider: z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]).default("anthropic"),
  /** Model to use for judging */
  model: z.string().default("claude-sonnet-4-6"),
  /** Optional: skill_id being evaluated */
  skillId: z.string().optional(),
  /** Optional: experiment_id for cross-referencing */
  experimentId: z.string().optional(),
});

export type JudgeTrace = z.infer<typeof JudgeTraceSchema>;

export interface JudgeResult {
  id: string;
  score: number;
  reasoning: string;
  model: string;
  provider: string;
  promptTokens: number;
  outputTokens: number;
  judgedAt: string;
}

const JUDGE_SYSTEM_PROMPT = `You are an objective evaluator. You will be shown a task/prompt and an AI response.
Your job is to determine whether the response successfully solved the problem.

Respond with ONLY a valid JSON object in this exact format (no markdown, no explanation):
{"score": <number 0.0-1.0>, "reasoning": "<one sentence>"}

Score guide:
- 1.0: Fully solved — response directly and correctly addresses the task
- 0.75: Mostly solved — minor gaps or caveats but fundamentally correct
- 0.5: Partially solved — addresses some aspects but misses key requirements
- 0.25: Attempted but failed — response tries but is incorrect or incomplete
- 0.0: Not solved — response is off-topic, refused, or completely wrong`;

const JudgeResponseSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

function buildJudgePrompt(trace: JudgeTrace): string {
  const parts = [
    `TASK:\n${trace.prompt}`,
    `RESPONSE:\n${trace.response}`,
  ];
  if (trace.expectedOutcome) {
    parts.push(`EXPECTED OUTCOME:\n${trace.expectedOutcome}`);
  }
  parts.push("\nEvaluate whether the response solved the task. Return JSON only.");
  return parts.join("\n\n");
}

/**
 * Score a single trace asynchronously. Stores result in judge_scores table.
 */
export async function judgeTrace(trace: JudgeTrace): Promise<JudgeResult> {
  const parsed = JudgeTraceSchema.parse(trace);
  const judgePrompt = buildJudgePrompt(parsed);

  logger.info("Judge: evaluating trace", {
    provider: parsed.provider,
    model: parsed.model,
    skillId: parsed.skillId,
  });

  const result = await completion({
    provider: parsed.provider,
    model: parsed.model,
    messages: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: judgePrompt },
    ],
    temperature: 0,
    maxTokens: 256,
    keyVaultRef: parsed.keyVaultRef,
    skipCache: true, // evaluations must be fresh
  });

  let judgeScore: number;
  let reasoning: string;

  try {
    const parsed_response = JudgeResponseSchema.parse(JSON.parse(result.content));
    judgeScore = parsed_response.score;
    reasoning = parsed_response.reasoning;
  } catch {
    logger.warn("Judge: failed to parse response, defaulting to 0.5", {
      raw: result.content,
    });
    judgeScore = 0.5;
    reasoning = "Parse error — defaulting to neutral score";
  }

  const judgedAt = new Date().toISOString();
  const id = randomUUID();

  // Persist to judge_scores table
  const db = getDb();
  db.run(
    `INSERT INTO judge_scores (id, skill_id, experiment_id, prompt, response,
      score, reasoning, model, provider, prompt_tokens, output_tokens, judged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      parsed.skillId ?? null,
      parsed.experimentId ?? null,
      parsed.prompt,
      parsed.response,
      judgeScore,
      reasoning,
      result.model,
      result.provider,
      result.promptTokens,
      result.outputTokens,
      judgedAt,
    ]
  );
  persistDb();

  logger.info("Judge: scored trace", { id, score: judgeScore, reasoning });

  return {
    id,
    score: judgeScore,
    reasoning,
    model: result.model,
    provider: result.provider,
    promptTokens: result.promptTokens,
    outputTokens: result.outputTokens,
    judgedAt,
  };
}

/**
 * Batch judge multiple traces. Runs sequentially to avoid rate-limiting.
 */
export async function judgeTraces(traces: JudgeTrace[]): Promise<JudgeResult[]> {
  const results: JudgeResult[] = [];
  for (const trace of traces) {
    const result = await judgeTrace(trace);
    results.push(result);
  }
  return results;
}
