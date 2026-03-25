/**
 * Skill Generator (P2-06)
 *
 * Takes a computational skeleton and generates a full SKILL.md document
 * via Claude through the Cloudflare AI Gateway.
 *
 * Also handles writing the SKILL.md to disk and versioning it in the
 * skill_versions table (P2-07 integration).
 *
 * Flow:
 *   Skeleton → LLM (Claude) → SKILL.md markdown → write to skills/{slug}/SKILL.md
 *                           → INSERT INTO skill_versions
 *                           → trigger extractor re-scan
 */

import { z } from "zod";
import { writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import { completion } from "../gateway/client.js";
import { type Skeleton } from "./skeletonExtractor.js";
import { getDb, persistDb } from "../db/database.js";
import { logger } from "../utils/logger.js";

// ─── Input schema ──────────────────────────────────────────────────────────

export const GeneratorInputSchema = z.object({
  skeleton: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    patternType: z.string().min(1),
    steps: z.array(z.string().min(1)),
    primitives: z.array(z.string()),
    tags: z.array(z.string()),
    strippedDomainTerms: z.array(z.string()),
  }),
  /** Optional: additional context to pass to the generator */
  context: z.string().optional(),
  /** Key Vault ref for gateway auth */
  keyVaultRef: z.string().min(1),
  provider: z.enum(["openai", "anthropic", "google-ai-studio", "workers-ai"]).default("anthropic"),
  model: z.string().default("claude-sonnet-4-6"),
  /** Where to write skills/ directory (defaults to ./skills) */
  skillsDir: z.string().default("./skills"),
});

export type GeneratorInput = z.infer<typeof GeneratorInputSchema>;

export interface GeneratedSkill {
  slug: string;
  path: string;
  content: string;
  versionId: string;
}

// ─── System prompt ─────────────────────────────────────────────────────────

const GENERATOR_SYSTEM = `You are a technical documentation writer specializing in reusable skill patterns.

Given a computational skeleton, generate a complete SKILL.md document that:
1. Has a clear, actionable title
2. Explains WHEN to use this skill (specific trigger conditions)
3. Provides numbered STEPS that are abstract enough to apply across domains
4. Includes an ALGORITHM section with pseudocode
5. Lists PRIMITIVES (comma-separated: http-fetch, sql-query, caching, data-transform, etc.)
6. Lists TAGS for taxonomy classification

Format rules:
- Use second-person imperative voice ("Use this skill when...", "Apply X to...")
- Steps must use {placeholders} for domain-specific terms
- Keep the whole document under 400 words
- No filler, no preamble

Output ONLY the raw markdown content. No code fences around the entire document.

Template:
# {Skill Name}

{One sentence description}.

## When to Use

{Trigger conditions — what signals that this skill applies?}

## Steps

1. {Step one}
2. {Step two}
...

## Algorithm

\`\`\`
{pseudocode}
\`\`\`

## Primitives

{comma-separated list}

## Tags

{comma-separated list}`;

// ─── Generator ─────────────────────────────────────────────────────────────

/**
 * Generate a SKILL.md from a skeleton and write it to disk.
 */
export async function generateSkill(input: GeneratorInput): Promise<GeneratedSkill> {
  const parsed = GeneratorInputSchema.parse(input);
  const { skeleton } = parsed;

  const userContent = [
    `SKELETON NAME: ${skeleton.name}`,
    `DESCRIPTION: ${skeleton.description}`,
    `PATTERN TYPE: ${skeleton.patternType}`,
    `STEPS:\n${skeleton.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    `PRIMITIVES: ${skeleton.primitives.join(", ")}`,
    `TAGS: ${skeleton.tags.join(", ")}`,
    skeleton.strippedDomainTerms.length > 0
      ? `STRIPPED DOMAIN TERMS (replaced with placeholders): ${skeleton.strippedDomainTerms.join(", ")}`
      : "",
    parsed.context ? `ADDITIONAL CONTEXT:\n${parsed.context}` : "",
    "\nGenerate the complete SKILL.md markdown document.",
  ]
    .filter(Boolean)
    .join("\n\n");

  logger.info("SkillGenerator: generating SKILL.md", { name: skeleton.name });

  const result = await completion({
    provider: parsed.provider,
    model: parsed.model,
    messages: [
      { role: "system", content: GENERATOR_SYSTEM },
      { role: "user", content: userContent },
    ],
    temperature: 0.3,
    maxTokens: 1024,
    keyVaultRef: parsed.keyVaultRef,
    skipCache: false,
  });

  const content = result.content.trim();
  const slug = skeleton.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Write to disk
  const dir = resolve(join(parsed.skillsDir, slug));
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "SKILL.md");
  writeFileSync(filePath, content, "utf-8");

  logger.info("SkillGenerator: wrote SKILL.md", { slug, path: filePath });

  // Version in DB
  const versionId = randomUUID();
  const db = getDb();

  // Get or create skill record
  const existing = db.exec("SELECT id FROM skills WHERE path = ?", [filePath]);
  let skillId: string;

  if (existing[0]?.values.length) {
    skillId = existing[0].values[0]?.[0] as string;

    // Bump version
    const versionResult = db.exec(
      "SELECT MAX(version) FROM skill_versions WHERE skill_id = ?",
      [skillId]
    );
    const currentVersion = (versionResult[0]?.values[0]?.[0] as number | null) ?? 0;

    db.run(
      `INSERT INTO skill_versions (id, skill_id, version, content, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [versionId, skillId, currentVersion + 1, content]
    );

    db.run(
      `UPDATE skills SET content = ?, updated_at = datetime('now') WHERE id = ?`,
      [content, skillId]
    );
  } else {
    // New skill — insert skeleton record; extractor will fill taxonomy
    skillId = randomUUID();
    db.run(
      `INSERT INTO skills (id, name, path, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [skillId, skeleton.name, filePath, content]
    );

    db.run(
      `INSERT INTO skill_versions (id, skill_id, version, content, created_at)
       VALUES (?, ?, 1, ?, datetime('now'))`,
      [versionId, skillId, content]
    );
  }

  persistDb();

  return { slug, path: filePath, content, versionId };
}

/**
 * Render a skeleton to SKILL.md format without calling the LLM.
 * Used for deterministic generation in tests or when a simple template is enough.
 */
export function renderSkeletonToMarkdown(skeleton: Skeleton): string {
  const lines: string[] = [
    `# ${skeleton.name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")}`,
    "",
    skeleton.description,
    "",
    "## When to Use",
    "",
    `Use this skill when you need to apply the \`${skeleton.patternType}\` pattern to a problem. ` +
      `Applies when: ${skeleton.tags.join(", ")}.`,
    "",
    "## Steps",
    "",
    ...skeleton.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "## Algorithm",
    "",
    "```",
    `${skeleton.patternType} pattern:`,
    ...skeleton.steps.map((s) => `  → ${s}`),
    "```",
    "",
    "## Primitives",
    "",
    skeleton.primitives.join(", "),
    "",
    "## Tags",
    "",
    skeleton.tags.join(", "),
  ];
  return lines.join("\n");
}
