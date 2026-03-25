# Cloudflare AI Gateway Setup

Configure Cloudflare AI Gateway as the provider routing layer for any Node/TypeScript project. Routes all LLM traffic through Cloudflare's managed infrastructure — auth, DLP, rate limiting, caching, failover, logging, and analytics are handled at the infrastructure layer rather than in application code.

## When to Use

Use this skill whenever a project needs to call any LLM provider (OpenAI, Anthropic, Google, Workers AI). Never call provider APIs directly from application code.

## Steps

1. **Create the gateway** at dash.cloudflare.com → AI → AI Gateway → Create Gateway. Note the `Account ID` and `Gateway Name`.

2. **Enable Data Loss Prevention (DLP)** in the gateway settings to prevent sensitive data from appearing in logs.

3. **Enable Zero Data Retention (ZDR)** if the project requires data privacy guarantees — prevents Cloudflare from storing request/response bodies.

4. **Store all provider API keys in Cloudflare Key Vault** (Secrets Store):
   - Navigate to: Workers & Pages → KV / Secrets Store
   - Add secrets: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.
   - These are referenced by name in code, never by value.

5. **Set `baseURL` in the OpenAI SDK** (works for all providers via the OpenAI-compatible interface):
   ```typescript
   const client = new OpenAI({
     apiKey: process.env.CF_KEY_VAULT_REF, // Key Vault reference, not a raw key
     baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/openai`,
     defaultHeaders: {
       "cf-aig-authorization": `Bearer ${process.env.CF_KEY_VAULT_REF}`,
     },
   });
   ```

6. **Set `cf-aig-authorization` header** — authenticates requests to the gateway. Use a Key Vault secret reference, not a raw key.

7. **Verify routing** by making a test completion and checking the gateway dashboard for log entries.

## Security Rules

- API keys NEVER go in `.env` files or source code
- All keys live in Cloudflare Key Vault
- The `cf-aig-authorization` header value is a Key Vault reference
- Enable DLP before handling any user-submitted prompts

## Primitives

- http-fetch, auth, caching, event-driven logging

## Tags

cloudflare, openai, anthropic, typescript, infrastructure
