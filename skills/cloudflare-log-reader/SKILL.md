# Cloudflare AI Gateway Log Reader

Read execution traces from Cloudflare AI Gateway via the Cloudflare API and store them in local SQLite for skill extraction and analytics.

## When to Use

Use this skill to poll gateway logs after LLM calls complete, feed the AutoResearch loop with real usage data, or build a local analytics cache.

## Steps

1. **Get a Cloudflare API token** with `AI Gateway: Read` permission scope. Store it in the environment as `CF_API_TOKEN` (not in code).

2. **Build the request URL**:
   ```
   GET https://api.cloudflare.com/client/v4/accounts/{account_id}/ai-gateway/gateways/{gateway_name}/logs
   ```
   Query parameters:
   - `status=success` — only successful completions
   - `order_by=created_at&direction=asc` — chronological order
   - `since={iso_timestamp}` — incremental polling from last seen entry

3. **Authenticate with Bearer token**:
   ```typescript
   headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
   ```

4. **Parse the response** — `result` array contains log entries with fields: `id`, `provider`, `model`, `status`, `cached`, `prompt_tokens`, `completion_tokens`, `duration`, `request`, `response`, `created_at`.

5. **Deduplicate by `id`** before inserting — the API may return overlapping entries on incremental polls.

6. **Insert into local SQLite** `gateway_logs` table for offline analysis.

7. **Flush DB to disk** after batch insert (required when using sql.js WASM).

8. **Track `MAX(logged_at)`** as the cursor for the next incremental poll.

## Algorithm

```
lastSeen = SELECT MAX(logged_at) FROM gateway_logs
entries = GET /logs?since=lastSeen&status=success
for entry in entries:
  if entry.id not in gateway_logs:
    INSERT INTO gateway_logs(...)
persistDb()
```

## Primitives

- http-fetch, sql-query, scheduling, data-transform

## Tags

cloudflare, sqlite, typescript, observability
