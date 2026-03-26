# AutoResearch Program

Reusable instructions for the SkillForge AutoResearch experiment loop.

## Purpose

This program drives overnight experiments to discover better skill prompt formulations.
Each run picks skills below a score threshold, generates variants using a strategy,
evaluates both against benchmark tasks, and promotes winners.

## Config

The JSON block below is machine-parsed by the CLI (`skillforge autoResearch start`).
Edit values here to tune experiment behavior.

```json
{
  "maxExperimentsPerRun": 5,
  "scoreThreshold": 0.8,
  "minImprovementDelta": 0.05,
  "confidenceThreshold": 0.05,
  "keyVaultRef": "vault:anthropic-key",
  "provider": "anthropic",
  "taskModel": "claude-haiku-4-5-20251001",
  "judgeModel": "claude-sonnet-4-6",
  "scorerWeights": {
    "judgeScore": 0.60,
    "tokenEfficiency": 0.25,
    "latency": 0.15
  }
}
```

## Variant Strategies

The runner cycles through these strategies to generate skill variants:

| Strategy | Description |
|----------|-------------|
| `prompt-restructure` | Reorder and clarify steps — lead with the most actionable instruction |
| `few-shot-examples` | Add 2–3 abstract examples with `{placeholders}` to each step |
| `chain-of-thought` | Make reasoning explicit — annotate each step with a brief "Why:" |
| `direct-answer` | Terse style — one crisp imperative sentence per step, no preamble |
| `algorithm-first` | Lead with pseudocode, follow with prose — ideal for developer skills |

## Scoring Weights

| Dimension | Default Weight | Rationale |
|-----------|---------------|-----------|
| Judge score | 60% | Quality matters most — did the response solve the problem? |
| Token efficiency | 25% | Fewer tokens = lower cost + faster response |
| Latency | 15% | Speed matters but is secondary to quality and cost |

Weights must sum to 1.0. Adjust in the JSON config block above.

## Safety Controls

- **`maxExperimentsPerRun`**: Hard cap on experiments per CLI invocation. Default: 5.
  Prevents runaway cost on a misconfigured run.
- **`scoreThreshold`**: Only skills below this score are eligible. Default: 0.8.
  Prevents wasting experiments on already-high-quality skills.
- **`confidenceThreshold`**: Minimum composite delta to declare a winner. Default: 0.05.
  Below this, the result is "inconclusive" — no change is made.
- **`minImprovementDelta`**: Minimum score improvement to promote. Default: 0.05.
  Prevents noise from triggering unnecessary promotions.

## Rollback

If a promoted variant degrades real-world performance after deployment:
1. Check `skill_versions` table — each promotion creates a versioned snapshot
2. Run: `UPDATE skills SET content = (SELECT content FROM skill_versions WHERE skill_id = ? AND version = ?) WHERE id = ?`
3. Re-run `POST /skills/extract` to re-index taxonomy

## Stopping a Run

- Graceful: `skillforge autoResearch stop` — writes `.autoresearch-stop` flag file
- Immediate: `Ctrl+C` (SIGINT) — loop finishes the current experiment then exits
- Both methods generate a partial report for experiments completed so far

## What to Try When Results Are Poor

1. **All ties**: Eval tasks may not be specific enough — edit `eval.md` with harder benchmarks
2. **Original always wins**: Skills may already be near-optimal — lower `scoreThreshold`
3. **High confidence but wrong winner**: Check if judge model is appropriate — consider switching judge
4. **Costs too high**: Reduce `maxExperimentsPerRun` or switch `taskModel` to a cheaper model
