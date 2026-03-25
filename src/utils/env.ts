/**
 * Runtime environment variable access.
 * API keys are NEVER stored here — they live in Cloudflare Key Vault.
 * Only gateway config (account ID, gateway name, worker URL) comes from env.
 */

import { z } from "zod";

const EnvSchema = z.object({
  /** Cloudflare account ID (not a secret — used in API URLs) */
  CF_ACCOUNT_ID: z.string().min(1),
  /** AI Gateway name configured in the Cloudflare dashboard */
  CF_GATEWAY_NAME: z.string().min(1),
  /** Cloudflare AI Gateway API token (read-only analytics scope) */
  CF_API_TOKEN: z.string().min(1),
  /** HTTP port for the feedback webhook server */
  PORT: z.string().regex(/^\d+$/).default("3000"),
  /** SQLite DB path for local skill/log storage */
  DB_PATH: z.string().default("./data/skillforge.db"),
  /** Log poller interval in milliseconds */
  POLL_INTERVAL_MS: z.string().regex(/^\d+$/).default("300000"),
  /** AutoResearch schedule (cron expression) */
  AUTORESEARCH_CRON: z.string().default("0 2 * * *"),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (_env) return _env;

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Missing or invalid environment variables:\n${result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`
    );
  }
  _env = result.data;
  return _env;
}
