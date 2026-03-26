# AutoResearch Loop Pattern

Systematically improve a registry of prompt documents by running controlled variant experiments, scoring outcomes, and promoting winners.

## When to Use

Use this skill when you have a collection of reusable prompt/instruction documents (skills, system prompts, templates) and want to automatically improve them over time without manual editing. Applies when: documents have measurable quality (LLM judge scorable), multiple variant strategies exist (restructure, few-shot, chain-of-thought), and you can define benchmark eval tasks that are representative of real usage.

## Steps

1. **Select candidates**: Query the registry for documents below a score threshold, ordered by usage count descending. This targets the highest-impact documents first.
2. **Choose a strategy**: Pick a variant generation strategy from your strategy set (prompt-restructure, few-shot-examples, chain-of-thought, direct-answer, algorithm-first). Rotate strategies to avoid local optima.
3. **Generate variant**: Send the original document + strategy instruction to the LLM. Use temperature ~0.35 for creative but deterministic output.
4. **Run controlled eval**: For each benchmark task, run both original and variant as system context. Measure: LLM judge score, token count, latency ms.
5. **Score with configurable weights**: Compute composite delta = w₁×judgeDelta + w₂×tokenNorm + w₃×latencyNorm. Apply a confidence threshold (e.g. 0.05) to filter noise.
6. **Determine winner**: If composite delta > threshold → variant wins. If < -threshold → original wins. Otherwise → tie (inconclusive).
7. **Apply outcome**: Promote variant (update registry content + bump version) or discard (log what was tried). Never modify the original without a clear win.
8. **Write audit log**: Record strategy, deltas, winner, and whether promoted in a persistent store. Required for reporting and rollback.
9. **Generate report**: After the run, emit a structured markdown report showing skills tested, variants tried, wins/losses, and performance deltas.

## Algorithm

```
loop until (experiments >= maxPerRun OR stopSignal):
  candidate = selectLowestScoringWithUsage(registry, threshold)
  if not candidate: break

  strategy = pickStrategy(strategies, recentHistory)
  variant  = llm.generate(original=candidate.content, strategy=strategy)

  scores = []
  for task in evalTasks[0:3]:
    original_run = eval(task, context=original)
    variant_run  = eval(task, context=variant)
    scores.append(computeDelta(original_run, variant_run, weights))

  aggregate = mean(scores)
  if aggregate.delta > confidenceThreshold:
    promote(candidate, variant)    → update registry + version
  elif aggregate.delta < -threshold:
    discard(variant)               → log tried strategy
  else:
    logInconclusive()

  writeAuditEntry(runId, skillId, strategy, aggregate, promoted)

generateNightlyReport(allResults)
```

## Primitives

llm-completion, sql-upsert, sql-versioning, score-normalization, file-write, signal-handling, structured-logging, markdown-generation

## Tags

autoresearch, prompt-optimization, a-b-testing, skill-evolution, eval-loop, variant-generation, overnight-experiments, quality-improvement
