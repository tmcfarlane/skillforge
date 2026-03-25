import { describe, it, expect } from "vitest";
import { classify } from "../taxonomy/taxonomy.js";

describe("classify", () => {
  it("classifies Cloudflare gateway content as infrastructure", () => {
    const content = `# Cloudflare AI Gateway Setup
Configure Cloudflare AI Gateway as the provider routing layer for edge compute.
Set baseURL to the gateway proxy CDN endpoint. Deploy to the Cloudflare worker.
Configure gateway route, set infra deploy script, add to CDN proxy config.`;
    const result = classify(content);
    expect(result.domain).toBe("infrastructure");
    expect(result.tags).toContain("cloudflare");
  });

  it("classifies SQLite database content as data domain", () => {
    const content = `# SQLite Schema Migration
Run SQL migrations against a SQLite database. Use CREATE TABLE IF NOT EXISTS.`;
    const result = classify(content);
    expect(result.domain).toBe("data");
  });

  it("classifies authentication content as security domain", () => {
    const content = `# API Key Management
Store API keys in a vault. Never put secret token values in .env files.
Use auth headers with Bearer token for requests.`;
    const result = classify(content);
    expect(result.domain).toBe("security");
  });

  it("always returns a valid Taxonomy shape", () => {
    const result = classify("some random content");
    expect(result).toMatchObject({
      domain: expect.any(String),
      subdomain: expect.any(String),
      complexity: expect.any(String),
      primitives: expect.any(Array),
      tags: expect.any(Array),
    });
  });

  it("extracts typescript tag when content mentions TypeScript", () => {
    const content = "Use TypeScript strict mode with Zod validation.";
    const result = classify(content);
    expect(result.tags).toContain("typescript");
  });
});
