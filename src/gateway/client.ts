/**
 * Cloudflare AI Gateway client (P1-01)
 *
 * All LLM calls route through Cloudflare AI Gateway. Provider API keys are
 * stored exclusively in Cloudflare Key Vault — NEVER in code or .env.
 *
 * baseURL pattern:
 *   https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/{provider}
 *
 * The cf-aig-authorization header carries a Key Vault secret reference, not
 * a raw key. Cloudflare resolves the secret server-side.
 */

import OpenAI from "openai";
import { z } from "zod";
import { getEnv } from "../utils/env.js";
import { logger } from "../utils/logger.js";

export const ProviderSchema = z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]);
export type Provider = z.infer<typeof ProviderSchema>;

export const ModelSchema = z.string().min(1);

export interface GatewayClientOptions {
  provider: Provider;
  /** Key Vault secret reference — NOT a raw API key */
  keyVaultRef: string;
  /** Optional: skip cache for this request */
  skipCache?: boolean;
}

const GATEWAY_BASE = "https://gateway.ai.cloudflare.com/v1";

function buildBaseUrl(accountId: string, gatewayName: string, provider: Provider): string {
  return `${GATEWAY_BASE}/${accountId}/${gatewayName}/${provider}`;
}

export function createGatewayClient(opts: GatewayClientOptions): OpenAI {
  const env = getEnv();

  const baseURL = buildBaseUrl(env.CF_ACCOUNT_ID, env.CF_GATEWAY_NAME, opts.provider);

  logger.debug("Creating gateway client", {
    provider: opts.provider,
    baseURL,
  });

  const extraHeaders: Record<string, string> = {
    "cf-aig-authorization": `Bearer ${opts.keyVaultRef}`,
  };
  if (opts.skipCache === true) {
    extraHeaders["cf-aig-skip-cache"] = "true";
  }

  return new OpenAI({
    apiKey: opts.keyVaultRef,
    baseURL,
    defaultHeaders: extraHeaders,
  });
}

export const CompletionRequestSchema = z.object({
  provider: ProviderSchema,
  model: ModelSchema,
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  keyVaultRef: z.string().min(1),
  skipCache: z.boolean().optional(),
});

export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;

export interface CompletionResult {
  content: string;
  model: string;
  provider: Provider;
  promptTokens: number;
  outputTokens: number;
  cached: boolean;
}

export async function completion(req: CompletionRequest): Promise<CompletionResult> {
  const parsed = CompletionRequestSchema.parse(req);
  const client = createGatewayClient({
    provider: parsed.provider,
    keyVaultRef: parsed.keyVaultRef,
    ...(parsed.skipCache !== undefined ? { skipCache: parsed.skipCache } : {}),
  });

  const response = await client.chat.completions.create({
    model: parsed.model,
    messages: parsed.messages,
    ...(parsed.temperature !== undefined ? { temperature: parsed.temperature } : {}),
    ...(parsed.maxTokens !== undefined ? { max_tokens: parsed.maxTokens } : {}),
  });

  const choice = response.choices[0];
  if (!choice) throw new Error("Gateway returned no choices");

  const content = choice.message.content;
  if (!content) throw new Error("Gateway returned empty content");

  const responseAsUnknown = response as unknown as Record<string, unknown>;
  const cached =
    "cf-cache-status" in responseAsUnknown
      ? responseAsUnknown["cf-cache-status"] === "HIT"
      : false;

  return {
    content,
    model: response.model,
    provider: parsed.provider,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    cached,
  };
}
