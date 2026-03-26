/**
 * P0-2: Skill Evolution Engine Tests
 *
 * Verifies:
 * 1. Schema validation for all three evolution modes
 * 2. captureSkill (direct content) without LLM — filesystem + DB ops
 * 3. fixSkill / deriveSkill schemas and error handling
 *
 * Live LLM calls are NOT made — gateway completion is mocked.
 * DB is mocked at module level so getDb() returns a stable mock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { randomUUID } from "crypto";

import {
  CaptureSkillInputSchema,
  FixSkillInputSchema,
  DeriveSkillInputSchema,
  EvolutionTypeSchema,
} from "../skills/evolution.js";

// ─── Module-level mocks (hoisted by Vitest) ──────────────────────────────

vi.mock("../db/database.js", () => ({
  getDb: vi.fn(),
  persistDb: vi.fn(),
}));

vi.mock("../skills/extractor.js", () => ({
  extractSkills: vi.fn().mockReturnValue([]),
}));

vi.mock("../scoring/scorer.js", () => ({
  scoreAllSkills: vi.fn(),
}));

vi.mock("../gateway/client.js", () => ({
  completion: vi.fn().mockRejectedValue(new Error("Gateway not configured in tests")),
}));

// ─── Evolution type enum ──────────────────────────────────────────────────

describe("EvolutionType enum values", () => {
  it("contains exactly FIX, DERIVED, CAPTURED", () => {
    const valid = ["FIX", "DERIVED", "CAPTURED"] as const;
    for (const v of valid) {
      expect(EvolutionTypeSchema.safeParse(v).success).toBe(true);
    }
  });

  it("rejects lowercase variants", () => {
    expect(EvolutionTypeSchema.safeParse("fix").success).toBe(false);
    expect(EvolutionTypeSchema.safeParse("derived").success).toBe(false);
    expect(EvolutionTypeSchema.safeParse("captured").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(EvolutionTypeSchema.safeParse("").success).toBe(false);
  });
});

// ─── CaptureSkillInputSchema ──────────────────────────────────────────────

describe("CaptureSkillInputSchema validation", () => {
  it("accepts direct content capture (no LLM required)", () => {
    const result = CaptureSkillInputSchema.safeParse({
      name: "Test",
      content: "# Test\n\nEnough content here.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts LLM-powered trace capture", () => {
    const result = CaptureSkillInputSchema.safeParse({
      name: "Trace Skill",
      trace: "I solved a problem by iterating over the list and filtering duplicates",
      keyVaultRef: "vault:anthropic-key",
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for provider, model, and skillsDir", () => {
    const result = CaptureSkillInputSchema.parse({
      name: "Skill",
      content: "# Skill\n\nContent that is long enough to pass validation.",
    });
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.skillsDir).toBe("./skills");
  });

  it("rejects content shorter than 10 chars", () => {
    expect(() =>
      CaptureSkillInputSchema.parse({ name: "Skill", content: "short" })
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      CaptureSkillInputSchema.parse({ name: "", content: "valid content here" })
    ).toThrow();
  });
});

// ─── FixSkillInputSchema ──────────────────────────────────────────────────

describe("FixSkillInputSchema validation", () => {
  const validInput = {
    skillId: "skill-123",
    error: "Step 3 is ambiguous — unclear what 'transform' means",
    trace: "Attempted to apply skill, failed at step 3 with TypeError",
    keyVaultRef: "vault:anthropic-key",
  };

  it("accepts valid FIX input", () => {
    const result = FixSkillInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider).toBe("anthropic");
    }
  });

  it("rejects missing keyVaultRef", () => {
    const { keyVaultRef: _, ...withoutRef } = validInput;
    expect(FixSkillInputSchema.safeParse(withoutRef).success).toBe(false);
  });

  it("rejects empty error", () => {
    expect(FixSkillInputSchema.safeParse({ ...validInput, error: "" }).success).toBe(false);
  });

  it("rejects empty trace", () => {
    expect(FixSkillInputSchema.safeParse({ ...validInput, trace: "" }).success).toBe(false);
  });

  it("allows custom provider and model", () => {
    const result = FixSkillInputSchema.parse({
      ...validInput,
      provider: "openai",
      model: "gpt-4o",
    });
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
  });

  it("accepts all valid providers", () => {
    const providers = ["openai", "anthropic", "google-ai-studio", "workers-ai"] as const;
    for (const p of providers) {
      expect(
        FixSkillInputSchema.safeParse({ ...validInput, provider: p }).success
      ).toBe(true);
    }
  });
});

// ─── DeriveSkillInputSchema ──────────────────────────────────────────────

describe("DeriveSkillInputSchema validation", () => {
  const validInput = {
    skillId: "skill-456",
    trace: "Used skill to successfully process 1000 records in batch",
    feedback: "Steps 4-5 could be parallelized using Promise.all for 3x speedup",
    keyVaultRef: "vault:anthropic-key",
  };

  it("accepts valid DERIVE input", () => {
    const result = DeriveSkillInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing feedback", () => {
    const { feedback: _, ...withoutFeedback } = validInput;
    expect(DeriveSkillInputSchema.safeParse(withoutFeedback).success).toBe(false);
  });

  it("rejects empty feedback", () => {
    expect(
      DeriveSkillInputSchema.safeParse({ ...validInput, feedback: "" }).success
    ).toBe(false);
  });

  it("rejects empty trace", () => {
    expect(
      DeriveSkillInputSchema.safeParse({ ...validInput, trace: "" }).success
    ).toBe(false);
  });

  it("rejects missing keyVaultRef", () => {
    const { keyVaultRef: _, ...withoutRef } = validInput;
    expect(DeriveSkillInputSchema.safeParse(withoutRef).success).toBe(false);
  });
});

// ─── Slug generation (pure function extracted for testing) ────────────────

describe("skill slug generation", () => {
  function slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  it("lowercases and hyphenates words", () => {
    expect(slugify("My Skill Name")).toBe("my-skill-name");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  Skill  ")).toBe("skill");
  });

  it("collapses multiple separators", () => {
    expect(slugify("foo--bar__baz")).toBe("foo-bar-baz");
  });

  it("handles alphanumeric with numbers", () => {
    expect(slugify("BM25 Skill v2")).toBe("bm25-skill-v2");
  });

  it("handles special characters like parentheses", () => {
    expect(slugify("My Complex Skill (2024)")).toBe("my-complex-skill-2024");
  });
});

// ─── captureSkill (direct content, no LLM) ───────────────────────────────

describe("captureSkill with direct content", () => {
  let tmpDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `sf-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });

    mockDb = {
      exec: vi.fn().mockReturnValue([]),
      run: vi.fn(),
    };

    const { getDb } = await import("../db/database.js");
    vi.mocked(getDb).mockReturnValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes SKILL.md to disk and returns CAPTURED evolution result", async () => {
    const { captureSkill } = await import("../skills/evolution.js");

    const content = `# Test Capture Skill

A skill for testing the capture flow.

## When to Use

Use when testing skill capture without LLM calls.

## Steps

1. Prepare the input
2. Execute the action
3. Validate the result

## Algorithm

\`\`\`
input → transform → validate → output
\`\`\`

## Primitives

data-transform, validation

## Tags

test, capture, unit-test`;

    const result = await captureSkill({
      name: "test-capture-skill",
      content,
      skillsDir: tmpDir,
    });

    expect(result.evolutionType).toBe("CAPTURED");
    expect(result.slug).toBe("test-capture-skill");
    expect(existsSync(result.path)).toBe(true);
    expect(result.content).toBe(content);
    expect(result.lineageId).toBeDefined();
  });

  it("throws if neither content nor trace+keyVaultRef is provided", async () => {
    const { captureSkill } = await import("../skills/evolution.js");

    await expect(
      captureSkill({
        name: "Incomplete Skill",
        skillsDir: tmpDir,
      })
    ).rejects.toThrow(/content.*trace.*keyVaultRef/i);
  });
});

// ─── fixSkill throws when skill not found ─────────────────────────────────

describe("fixSkill error handling", () => {
  beforeEach(async () => {
    const mockDb = {
      exec: vi.fn().mockReturnValue([]), // empty = skill not found
      run: vi.fn(),
    };
    const { getDb } = await import("../db/database.js");
    vi.mocked(getDb).mockReturnValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Skill not found' when skillId does not exist", async () => {
    const { fixSkill } = await import("../skills/evolution.js");

    await expect(
      fixSkill({
        skillId: "nonexistent-id",
        error: "Step 3 failed",
        trace: "Execution trace here",
        keyVaultRef: "vault:key",
      })
    ).rejects.toThrow("Skill not found: nonexistent-id");
  });
});

// ─── deriveSkill throws when skill not found ──────────────────────────────

describe("deriveSkill error handling", () => {
  beforeEach(async () => {
    const mockDb = {
      exec: vi.fn().mockReturnValue([]),
      run: vi.fn(),
    };
    const { getDb } = await import("../db/database.js");
    vi.mocked(getDb).mockReturnValue(mockDb);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Skill not found' when skillId does not exist", async () => {
    const { deriveSkill } = await import("../skills/evolution.js");

    await expect(
      deriveSkill({
        skillId: "nonexistent-id",
        trace: "Successful trace",
        feedback: "Could be better",
        keyVaultRef: "vault:key",
      })
    ).rejects.toThrow("Skill not found: nonexistent-id");
  });
});
