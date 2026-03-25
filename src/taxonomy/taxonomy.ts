/**
 * Algorithmic Taxonomy (P1-04)
 *
 * Maps skills to a CS-grounded taxonomy. Each skill gets assigned:
 *   - domain: top-level CS domain (e.g., "infrastructure", "security")
 *   - subdomain: specific area (e.g., "api-gateway", "key-management")
 *   - complexity: O(1) | O(n) | O(log n) | O(n²) analog for skill difficulty
 *   - primitives: reusable computational patterns the skill embodies
 *
 * Classification uses keyword matching + optional LLM classification.
 */

import { z } from "zod";

export const DomainSchema = z.enum([
  "infrastructure",
  "security",
  "data",
  "networking",
  "observability",
  "ai-ml",
  "devops",
  "language",
  "testing",
  "architecture",
  "unknown",
]);

export const ComplexitySchema = z.enum(["trivial", "low", "medium", "high", "expert"]);

export const TaxonomySchema = z.object({
  domain: DomainSchema,
  subdomain: z.string(),
  complexity: ComplexitySchema,
  primitives: z.array(z.string()),
  tags: z.array(z.string()),
});

export type Domain = z.infer<typeof DomainSchema>;
export type Complexity = z.infer<typeof ComplexitySchema>;
export type Taxonomy = z.infer<typeof TaxonomySchema>;

// Keyword → domain mapping
const DOMAIN_KEYWORDS: Record<Domain, readonly string[]> = {
  infrastructure: ["cloudflare", "gateway", "proxy", "cdn", "worker", "edge", "deploy", "infra"],
  security: ["key", "secret", "vault", "auth", "token", "dlp", "encrypt", "certificate", "tls"],
  data: ["sqlite", "database", "sql", "schema", "migration", "query", "index", "storage"],
  networking: ["http", "tcp", "dns", "websocket", "fetch", "request", "response", "url"],
  observability: ["log", "trace", "metric", "monitor", "alert", "dashboard", "analytics"],
  "ai-ml": ["llm", "embedding", "model", "prompt", "inference", "fine-tune", "rag", "vector"],
  devops: ["ci", "cd", "pipeline", "docker", "kubernetes", "terraform", "helm", "npm"],
  language: ["typescript", "javascript", "python", "rust", "go", "parse", "ast", "compile"],
  testing: ["test", "vitest", "jest", "assert", "mock", "fixture", "coverage"],
  architecture: ["pattern", "design", "ddd", "event", "cqrs", "saga", "service", "module"],
  unknown: [],
};

// Keyword → complexity mapping
const COMPLEXITY_KEYWORDS: Record<Complexity, readonly string[]> = {
  trivial: ["rename", "format", "echo", "print", "hello"],
  low: ["read", "write", "list", "get", "set", "add", "remove"],
  medium: ["parse", "transform", "fetch", "validate", "route", "schedule"],
  high: ["orchestrate", "pipeline", "migration", "optimize", "cache", "distribute"],
  expert: ["cryptography", "compiler", "consensus", "distributed", "zero-knowledge"],
};

function scoreKeywords(text: string, keywords: readonly string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((count, kw) => (lower.includes(kw) ? count + 1 : count), 0);
}

function classifyDomain(content: string): Domain {
  let bestDomain: Domain = "unknown";
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as [Domain, readonly string[]][]) {
    if (domain === "unknown") continue;
    const score = scoreKeywords(content, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

function classifyComplexity(content: string): Complexity {
  let bestComplexity: Complexity = "medium";
  let bestScore = 0;

  for (const [complexity, keywords] of Object.entries(COMPLEXITY_KEYWORDS) as [
    Complexity,
    readonly string[],
  ][]) {
    const score = scoreKeywords(content, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestComplexity = complexity;
    }
  }

  return bestComplexity;
}

function extractPrimitives(content: string): string[] {
  const primitives: string[] = [];
  const patterns: [RegExp, string][] = [
    [/fetch|http request/i, "http-fetch"],
    [/sql|database query/i, "sql-query"],
    [/parse|transform/i, "data-transform"],
    [/retry|backoff/i, "retry-backoff"],
    [/cache|memoize/i, "caching"],
    [/validate|schema/i, "validation"],
    [/stream|iterator/i, "streaming"],
    [/event|webhook/i, "event-driven"],
    [/schedule|cron/i, "scheduling"],
    [/auth|token|key/i, "auth"],
  ];

  for (const [regex, name] of patterns) {
    if (regex.test(content)) primitives.push(name);
  }

  return primitives;
}

function extractTags(content: string): string[] {
  const tagRegex = /\b(cloudflare|typescript|node|sqlite|openai|anthropic|zod|hono|vitest)\b/gi;
  const matches = content.match(tagRegex) ?? [];
  return [...new Set(matches.map((t) => t.toLowerCase()))];
}

function inferSubdomain(domain: Domain, content: string): string {
  const lower = content.toLowerCase();
  const subdomainMap: Record<Domain, [RegExp, string][]> = {
    infrastructure: [
      [/gateway/i, "api-gateway"],
      [/worker/i, "edge-compute"],
      [/cdn/i, "content-delivery"],
      [/deploy/i, "deployment"],
    ],
    security: [
      [/key vault/i, "key-management"],
      [/dlp/i, "data-loss-prevention"],
      [/tls|certificate/i, "tls-certificates"],
      [/auth/i, "authentication"],
    ],
    data: [
      [/migration/i, "schema-migration"],
      [/query/i, "query-optimization"],
      [/index/i, "indexing"],
    ],
    networking: [[/http/i, "http"], [/websocket/i, "websockets"], [/dns/i, "dns"]],
    observability: [[/log/i, "logging"], [/trace/i, "tracing"], [/metric/i, "metrics"]],
    "ai-ml": [[/prompt/i, "prompting"], [/embedding/i, "embeddings"], [/rag/i, "rag"]],
    devops: [[/ci\/cd/i, "ci-cd"], [/docker/i, "containers"], [/npm/i, "package-management"]],
    language: [[/typescript/i, "typescript"], [/javascript/i, "javascript"]],
    testing: [[/vitest/i, "vitest"], [/mock/i, "mocking"]],
    architecture: [[/event/i, "event-driven"], [/service/i, "microservices"]],
    unknown: [],
  };

  const candidates = subdomainMap[domain] ?? [];
  for (const [regex, sub] of candidates) {
    if (regex.test(lower)) return sub;
  }
  return domain;
}

export function classify(skillContent: string): Taxonomy {
  const domain = classifyDomain(skillContent);
  const complexity = classifyComplexity(skillContent);
  const primitives = extractPrimitives(skillContent);
  const tags = extractTags(skillContent);
  const subdomain = inferSubdomain(domain, skillContent);

  return TaxonomySchema.parse({ domain, subdomain, complexity, primitives, tags });
}
