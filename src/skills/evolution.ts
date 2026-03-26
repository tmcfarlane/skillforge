/**
 * Skill Evolution Engine (P0-2)
 *
 * Implements three evolution modes inspired by OpenSpace:
 *
 *   CAPTURED  — Extract a new skill from a successful task trace (no parent).
 *   FIX       — When a skill fails, automatically repair it based on the error.
 *   DERIVED   — When a skill succeeds but could be better, create an improved variant.
 *
 * Each evolution is recorded in the skill_lineage table with:
 *   parent_skill_id, child_skill_id, evolution_type, reason, timestamp
 *
 * LLM-powered evolutions (FIX, DERIVED) route through Cloudflare AI Gateway.
 * CAPTURED can work without LLM when content is provided directly.
 *
 * NOTE: fixSkill and deriveSkill are BLOCKED until CF_ACCOUNT_ID, CF_GATEWAY_NAME,
 * CF_API_TOKEN, and a Key Vault reference are configured. captureSkill works
 * without LLM when content is provided.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { getDb, persistDb } from "../db/database.js";
import { completion } from "../gateway/client.js";
import { extractSkills } from "./extractor.js";
import { scoreAllSkills } from "../scoring/scorer.js";
import { logger } from "../utils/logger.js";

// ─── Zod schemas ────────────────────────────────────────────────────────────

export const EvolutionTypeSchema = z.enum(["FIX", "DERIVED", "CAPTURED"]);
export type EvolutionType = z.infer<typeof EvolutionTypeSchema>;

export const CaptureSkillInputSchema = z.object({
  /** Human-readable skill name (slugified for directory). */
  name: z.string().min(1),
  /** Full SKILL.md markdown content. Provide this OR `trace` + LLM config. */
  content: z.string().min(10).optional(),
  /** Task execution trace to extract skill from (requires LLM config if no content). */
  trace: z.string().optional(),
  /** Required if content is omitted — Key Vault ref for gateway auth. */
  keyVaultRef: z.string().optional(),
  provider: z
    .enum(["openai", "anthropic", "google-ai-studio", "workers-ai"])
    .default("anthropic"),
  model: z.string().default("claude-sonnet-4-6"),
  skillsDir: z.string().default("./skills"),
});

export const FixSkillInputSchema = z.object({
  skillId: z.string().min(1),
  /** Error message or failure description. */
  error: z.string().min(1),
  /** Execution trace that led to the failure. */
  trace: z.string().min(1),
  keyVaultRef: z.string().min(1),
  provider: z
    .enum(["openai", "anthropic", "google-ai-studio", "workers-ai"])
    .default("anthropic"),
  model: z.string().default("claude-sonnet-4-6"),
  skillsDir: z.string().default("./skills"),
});

export const DeriveSkillInputSchema = z.object({
  skillId: z.string().min(1),
  /** Successful execution trace showing the skill worked. */
  trace: z.string().min(1),
  /** Improvement notes or feedback on what could be better. */
  feedback: z.string().min(1),
  keyVaultRef: z.string().min(1),
  provider: z
    .enum(["openai", "anthropic", "google-ai-studio", "workers-ai"])
    .default("anthropic"),
  model: z.string().default("claude-sonnet-4-6"),
  skillsDir: z.string().default("./skills"),
});

export type CaptureSkillInput = z.infer<typeof CaptureSkillInputSchema>;
export type FixSkillInput = z.infer<typeof FixSkillInputSchema>;
export type DeriveSkillInput = z.infer<typeof DeriveSkillInputSchema>;

// ─── Result types ────────────────────────────────────────────────────────────

export interface EvolutionResult {
  skillId: string;
  versionId: string;
  lineageId: string;
  evolutionType: EvolutionType;
  slug: string;
  path: string;
  content: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Read the current SKILL.md for a given skill ID. */
function loadSkillContent(skillId: string): { content: string; slug: string } {
  const db = getDb();
  const result = db.exec(
    "SELECT content, path FROM skills WHERE id = ?",
    [skillId]
  );

  if (!result[0]?.values.length) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  const row = result[0].values[0];
  const content = row?.[0] as string;
  const path = row?.[1] as string;
  const slug = path.split("/").at(-2) ?? skillId;

  return { content, slug };
}

/** Write SKILL.md to disk and record in skill_versions. */
function writeSkillVersion(opts: {
  skillId: string;
  slug: string;
  content: string;
  skillsDir: string;
}): { versionId: string; filePath: string } {
  const dir = resolve(join(opts.skillsDir, opts.slug));
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "SKILL.md");
  writeFileSync(filePath, opts.content, "utf-8");

  const db = getDb();
  const versionResult = db.exec(
    "SELECT COALESCE(MAX(version), 0) FROM skill_versions WHERE skill_id = ?",
    [opts.skillId]
  );
  const currentVersion = (versionResult[0]?.values[0]?.[0] as number) ?? 0;
  const nextVersion = currentVersion + 1;

  const versionId = randomUUID();
  db.run(
    `INSERT INTO skill_versions (id, skill_id, version, content, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [versionId, opts.skillId, nextVersion, opts.content]
  );

  // Update the skill's current content
  db.run(
    "UPDATE skills SET content = ?, updated_at = datetime('now') WHERE id = ?",
    [opts.content, opts.skillId]
  );

  return { versionId, filePath };
}

/** Record an evolution event in skill_lineage. */
function recordLineage(opts: {
  parentId: string | null;
  childId: string;
  relationType: string;
  evolutionType: EvolutionType;
  reason: string;
}): string {
  const db = getDb();
  const lineageId = randomUUID();
  db.run(
    `INSERT INTO skill_lineage
       (id, parent_id, child_id, relation_type, evolution_type, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [lineageId, opts.parentId, opts.childId, opts.relationType, opts.evolutionType, opts.reason]
  );
  return lineageId;
}

// ─── LLM prompts ─────────────────────────────────────────────────────────────

const FIX_SYSTEM = `You are a skill repair specialist. You receive a broken SKILL.md and an error report.
Your job is to produce a corrected SKILL.md that fixes the identified issue while preserving the skill's intent.

Rules:
- Fix ONLY the identified problem — do not rewrite unrelated sections
- Preserve the original title, format, and structure
- If the error is caused by a missing step, add it
- If the error is caused by ambiguous instructions, clarify them
- Output ONLY the raw markdown content — no code fences around the entire document`;

const DERIVE_SYSTEM = `You are a skill improvement specialist. You receive a working SKILL.md and improvement feedback.
Your job is to produce an enhanced variant that incorporates the feedback while preserving the core pattern.

Rules:
- Improve the skill based on the feedback — do not change unrelated sections
- The variant should be a clear upgrade, not a different skill
- Keep the same algorithmic pattern type and primitives
- Append " (Improved)" to the title to distinguish it as a derived variant
- Output ONLY the raw markdown content — no code fences around the entire document`;

const CAPTURE_SYSTEM = `You are a skill extraction specialist. You receive a task execution trace.
Your job is to extract a reusable SKILL.md that captures the computational pattern demonstrated.

Rules:
- Strip all domain-specific details — replace with {placeholders}
- The skill must apply to the same PROBLEM CLASS, not just the specific task
- Follow this template exactly:

# {Skill Name}

{One sentence description}.

## When to Use

{Trigger conditions}

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

{comma-separated list}

Output ONLY the raw markdown content.`;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * FIX evolution: analyze a skill failure and generate a repaired version.
 *
 * BLOCKED until CF credentials are configured (requires Cloudflare AI Gateway).
 */
export async function fixSkill(input: FixSkillInput): Promise<EvolutionResult> {
  const parsed = FixSkillInputSchema.parse(input);
  const { skillId, error, trace, keyVaultRef, provider, model, skillsDir } = parsed;

  const { content: originalContent, slug } = loadSkillContent(skillId);

  logger.info("Evolution: FIX — analyzing failure", { skillId, slug });

  const userPrompt = [
    "ORIGINAL SKILL.md:",
    originalContent,
    "\nFAILURE ERROR:",
    error,
    "\nEXECUTION TRACE:",
    trace,
    "\nGenerate the fixed SKILL.md.",
  ].join("\n\n");

  const result = await completion({
    provider,
    model,
    messages: [
      { role: "system", content: FIX_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 1024,
    keyVaultRef,
    skipCache: true,
  });

  const fixedContent = result.content.trim();
  const { versionId, filePath } = writeSkillVersion({
    skillId,
    slug,
    content: fixedContent,
    skillsDir,
  });

  const lineageId = recordLineage({
    parentId: skillId,
    childId: skillId, // FIX modifies the same skill — points to itself as child
    relationType: "refines",
    evolutionType: "FIX",
    reason: error.slice(0, 500),
  });

  persistDb();
  logger.info("Evolution: FIX complete", { skillId, slug, versionId });

  return {
    skillId,
    versionId,
    lineageId,
    evolutionType: "FIX",
    slug,
    path: filePath,
    content: fixedContent,
  };
}

/**
 * DERIVED evolution: generate an improved variant of a successful skill.
 *
 * Creates a new skill (with its own ID) as a child of the original.
 * BLOCKED until CF credentials are configured.
 */
export async function deriveSkill(input: DeriveSkillInput): Promise<EvolutionResult> {
  const parsed = DeriveSkillInputSchema.parse(input);
  const { skillId, trace, feedback, keyVaultRef, provider, model, skillsDir } = parsed;

  const { content: originalContent, slug: parentSlug } = loadSkillContent(skillId);

  logger.info("Evolution: DERIVED — generating variant", { skillId, parentSlug });

  const userPrompt = [
    "ORIGINAL SKILL.md:",
    originalContent,
    "\nSUCCESSFUL EXECUTION TRACE:",
    trace,
    "\nIMPROVEMENT FEEDBACK:",
    feedback,
    "\nGenerate the improved SKILL.md variant.",
  ].join("\n\n");

  const result = await completion({
    provider,
    model,
    messages: [
      { role: "system", content: DERIVE_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    maxTokens: 1200,
    keyVaultRef,
    skipCache: true,
  });

  const derivedContent = result.content.trim();
  const derivedSlug = `${parentSlug}-derived-${Date.now()}`;
  const dir = resolve(join(skillsDir, derivedSlug));
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "SKILL.md");
  writeFileSync(filePath, derivedContent, "utf-8");

  // Re-extract to register the new skill
  const skills = extractSkills();
  scoreAllSkills();

  const db = getDb();
  const newSkillResult = db.exec(
    "SELECT id FROM skills WHERE path LIKE ?",
    [`%${derivedSlug}%`]
  );
  const newSkillId = (newSkillResult[0]?.values[0]?.[0] as string | undefined) ?? randomUUID();

  // Write initial version record
  const versionId = randomUUID();
  db.run(
    `INSERT INTO skill_versions (id, skill_id, version, content, created_at)
     VALUES (?, ?, 1, ?, datetime('now'))`,
    [versionId, newSkillId, derivedContent]
  );

  const lineageId = recordLineage({
    parentId: skillId,
    childId: newSkillId,
    relationType: "derived_from",
    evolutionType: "DERIVED",
    reason: feedback.slice(0, 500),
  });

  persistDb();
  logger.info("Evolution: DERIVED complete", {
    parentSkillId: skillId,
    newSkillId,
    derivedSlug,
    totalSkills: skills.length,
  });

  return {
    skillId: newSkillId,
    versionId,
    lineageId,
    evolutionType: "DERIVED",
    slug: derivedSlug,
    path: filePath,
    content: derivedContent,
  };
}

/**
 * CAPTURED evolution: extract a skill from a successful task trace.
 *
 * If `content` is provided, no LLM call is needed — the SKILL.md is written
 * directly (works without CF credentials).
 *
 * If only `trace` is provided, an LLM call extracts the pattern (requires CF creds).
 */
export async function captureSkill(input: CaptureSkillInput): Promise<EvolutionResult> {
  const parsed = CaptureSkillInputSchema.parse(input);
  const { name, content, trace, keyVaultRef, provider, model, skillsDir } = parsed;

  let skillContent: string;

  if (content) {
    // Direct capture — no LLM needed
    skillContent = content;
  } else if (trace && keyVaultRef) {
    // LLM-powered extraction from trace
    logger.info("Evolution: CAPTURED — extracting from trace", { name });

    const result = await completion({
      provider: provider ?? "anthropic",
      model: model ?? "claude-sonnet-4-6",
      messages: [
        { role: "system", content: CAPTURE_SYSTEM },
        { role: "user", content: `TASK EXECUTION TRACE:\n\n${trace}\n\nExtract the SKILL.md.` },
      ],
      temperature: 0.3,
      maxTokens: 1024,
      keyVaultRef,
      skipCache: true,
    });

    skillContent = result.content.trim();
  } else {
    throw new Error(
      "captureSkill requires either `content` (direct) or `trace` + `keyVaultRef` (LLM-powered)"
    );
  }

  const slug = slugify(name);
  const dir = resolve(join(skillsDir ?? "./skills", slug));
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "SKILL.md");
  writeFileSync(filePath, skillContent, "utf-8");

  // Re-extract and score
  const skills = extractSkills();
  scoreAllSkills();

  const db = getDb();
  const newSkillResult = db.exec(
    "SELECT id FROM skills WHERE path LIKE ?",
    [`%${slug}%`]
  );
  const newSkillId = (newSkillResult[0]?.values[0]?.[0] as string | undefined) ?? randomUUID();

  const versionId = randomUUID();
  const existingVersion = db.exec(
    "SELECT id FROM skill_versions WHERE skill_id = ? AND version = 1",
    [newSkillId]
  );
  if (!existingVersion[0]?.values.length) {
    db.run(
      `INSERT INTO skill_versions (id, skill_id, version, content, created_at)
       VALUES (?, ?, 1, ?, datetime('now'))`,
      [versionId, newSkillId, skillContent]
    );
  }

  const lineageId = recordLineage({
    parentId: null,
    childId: newSkillId,
    relationType: "captured",
    evolutionType: "CAPTURED",
    reason: trace ? `Captured from trace: ${trace.slice(0, 200)}` : "Direct content capture",
  });

  persistDb();
  logger.info("Evolution: CAPTURED complete", {
    name,
    slug,
    newSkillId,
    totalSkills: skills.length,
  });

  return {
    skillId: newSkillId,
    versionId,
    lineageId,
    evolutionType: "CAPTURED",
    slug,
    path: filePath,
    content: skillContent,
  };
}
