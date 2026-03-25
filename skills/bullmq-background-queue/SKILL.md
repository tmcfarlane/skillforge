# BullMQ Background Queue

Offload expensive async tasks (LLM calls, file writes, DB operations) to named BullMQ queues backed by Redis. Workers process jobs in the background with retry, backoff, and concurrency control.

## When to Use

Use whenever an HTTP request triggers work that should not block the response:
- LLM API calls that take 1-30 seconds
- File generation or disk writes
- Chained multi-step pipelines (log → skeleton → skill-gen → eval)
- Work that should retry on failure

## Steps

1. **Define a Zod schema for each job payload** — validate before enqueuing and again inside the worker. Never trust unvalidated job data.

2. **Create one Queue per job type** with a shared Redis connection: `new Queue("queue-name", { connection })`.

3. **Use `ioredis` for the Redis connection** — pass the same connection instance to queues and workers (BullMQ clones it internally).

4. **Set retry options on `queue.add()`**:
   ```typescript
   { attempts: 3, backoff: { type: "exponential", delay: 2000 },
     removeOnComplete: 100, removeOnFail: 50 }
   ```

5. **Guard worker startup** — only start workers when Redis is available. Check `process.env.REDIS_HOST` before calling `startWorkers()`.

6. **Import heavy dependencies lazily inside workers** — use `await import(...)` to avoid loading LLM clients at startup.

7. **Chain jobs inside workers** — a log-analysis worker can enqueue a skill-gen job, which can enqueue an eval-runner job.

8. **Limit concurrency for expensive workers** — LLM eval runners should run serial (`concurrency: 1`); lighter workers can use `concurrency: 2-5`.

## Algorithm

```
HTTP handler:
  data = Schema.parse(body)
  jobId = await queue.add("task-name", data, retryOpts)
  return 202 { jobId }

Worker:
  data = Schema.parse(job.data)
  result = await doExpensiveWork(data)
  await enqueueNextJob(result)  ← optional chaining
  return result
```

## Primitives

- event-driven, orchestrate, http-fetch

## Tags

bullmq, redis, async, queues, typescript, background-jobs, node
