/**
 * Cloudflare AI Gateway Log Poller (P1-02)
 *
 * Polls the Cloudflare API for successful gateway log entries and stores
 * them in the local SQLite database for skill extraction analysis.
 *
 * API: GET /accounts/{account_id}/ai-gateway/gateways/{gateway_name}/logs
 *
 * Docs: https://developers.cloudflare.com/ai-gateway/observability/logging/
 */

import { z } from "zod";
import { getEnv } from "../utils/env.js";
import { getDb, persistDb } from "../db/database.js";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

const GatewayLogEntrySchema = z.object({
  id: z.string(),
  provider: z.string(),
  model: z.string(),
  status: z.string(),
  cached: z.boolean(),
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  duration: z.number().optional(),
  request: z.string().optional(),
  response: z.string().optional(),
  created_at: z.string(),
});

const GatewayLogsResponseSchema = z.object({
  result: z.array(GatewayLogEntrySchema),
  success: z.boolean(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

type GatewayLogEntry = z.infer<typeof GatewayLogEntrySchema>;

async function fetchLogs(since?: string): Promise<GatewayLogEntry[]> {
  const env = getEnv();
  const url = new URL(
    `${CF_API_BASE}/accounts/${env.CF_ACCOUNT_ID}/ai-gateway/gateways/${env.CF_GATEWAY_NAME}/logs`
  );
  url.searchParams.set("status", "success");
  url.searchParams.set("order_by", "created_at");
  url.searchParams.set("direction", "asc");
  if (since) url.searchParams.set("since", since);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Cloudflare API error: ${res.status} ${res.statusText}`);
  }

  const json: unknown = await res.json();
  const parsed = GatewayLogsResponseSchema.parse(json);

  if (!parsed.success) {
    const msgs = parsed.errors?.map((e) => e.message).join(", ") ?? "unknown";
    throw new Error(`Gateway logs API returned failure: ${msgs}`);
  }

  return parsed.result;
}

function getLastSeenTimestamp(): string | undefined {
  const db = getDb();
  const result = db.exec(
    "SELECT MAX(logged_at) as ts FROM gateway_logs"
  );
  const ts = result[0]?.values[0]?.[0];
  return typeof ts === "string" ? ts : undefined;
}

function insertLogEntries(entries: GatewayLogEntry[]): number {
  const db = getDb();
  let inserted = 0;

  for (const entry of entries) {
    const exists = db.exec(
      "SELECT id FROM gateway_logs WHERE id = ?",
      [entry.id]
    );
    if (exists[0]?.values.length) continue;

    db.run(
      `INSERT INTO gateway_logs
         (id, provider, model, prompt_tokens, output_tokens, latency_ms,
          status, cached, request_body, response_body, logged_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id ?? randomUUID(),
        entry.provider,
        entry.model,
        entry.prompt_tokens ?? null,
        entry.completion_tokens ?? null,
        entry.duration ?? null,
        entry.status,
        entry.cached ? 1 : 0,
        entry.request ?? null,
        entry.response ?? null,
        entry.created_at,
      ]
    );
    inserted++;
  }

  if (inserted > 0) persistDb();
  return inserted;
}

async function poll(): Promise<void> {
  logger.info("Log poller: starting poll");
  try {
    const since = getLastSeenTimestamp();
    const entries = await fetchLogs(since);
    const count = insertLogEntries(entries);
    logger.info("Log poller: poll complete", { fetched: entries.length, inserted: count });
  } catch (err) {
    logger.error("Log poller: poll failed", err);
  }
}

export function startLogPoller(): void {
  const env = getEnv();
  const intervalMs = Number(env.POLL_INTERVAL_MS);

  logger.info("Log poller: starting", { intervalMs });
  void poll();
  setInterval(() => void poll(), intervalMs);
}
