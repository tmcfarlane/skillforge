# LLM-as-Judge Scorer

Use an LLM to score whether a prior LLM response correctly solved a task. Returns a normalized [0, 1] score with reasoning. Runs asynchronously after the task completes so it never blocks the primary response path.

## When to Use

Use whenever you need an automated quality signal for LLM outputs without requiring human feedback. Especially useful for:
- Post-task evaluation pipelines
- A/B testing skill injection (with vs. without skill)
- Bootstrapping feedback loops before enough human ratings exist
- Scoring experiments in AutoResearch loops

## Steps

1. **Define the judge prompt** — two-part input: the original task/prompt and the response being evaluated. Optionally include an expected outcome hint.

2. **Set temperature to 0** — the judge must be deterministic. Never allow creative variation in scoring.

3. **Use a separate model/provider** from the one being evaluated — prevents self-favoritism. If evaluating GPT-4o output, judge with Claude (or vice versa).

4. **Route through the same gateway** as all other LLM calls — no direct provider calls.

5. **Request structured JSON output** in this exact format:
   ```json
   {"score": 0.85, "reasoning": "One sentence explanation"}
   ```

6. **Validate with Zod** — never trust raw LLM output. Parse and validate before storing.

7. **Handle parse failures gracefully** — if the judge returns malformed JSON, default to 0.5 (neutral) and log a warning. Do not crash.

8. **Store in a dedicated table** (`judge_scores`) with: skill_id, experiment_id, prompt, response, score, reasoning, model, provider, token counts, timestamp.

9. **Use `skipCache: true`** — evaluations must always be fresh. A cached judge score from a different trace is invalid.

## Algorithm

```
trace (prompt, response)
  → build judge prompt (strip to essentials)
  → completion(judge_model, temperature=0, skipCache=true)
  → parse JSON {"score": float, "reasoning": string}
  → validate with Zod (fallback to 0.5 on error)
  → INSERT INTO judge_scores
  → return JudgeResult
```

## Score Guide

| Score | Meaning |
|-------|---------|
| 1.0   | Fully solved |
| 0.75  | Mostly solved — minor gaps |
| 0.5   | Partially solved — or unknown |
| 0.25  | Attempted but incorrect |
| 0.0   | Off-topic or refused |

## Primitives

- evaluate, http-fetch, data-transform, sql-query

## Tags

evaluation, llm-judge, scoring, typescript, cloudflare, async
