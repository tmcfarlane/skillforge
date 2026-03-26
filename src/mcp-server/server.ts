/**
 * SkillForge MCP Server (P0-1)
 *
 * Exposes the SkillForge skill registry as an MCP server so AI agents can
 * use skills as tools.
 *
 * Tools exposed:
 *   search_skills  — BM25 full-text search over the skill registry
 *   get_skill      — retrieve a single skill by ID with full SKILL.md content
 *   inject_skill   — given a request, return the best-matching skill context
 *   capture_skill  — given a task trace, extract and save a new skill
 *   score_skill    — submit feedback/score for a skill execution
 *
 * Transport: StdioServerTransport (stdin/stdout) — suitable for Claude Desktop,
 * Cursor, Continue, and any MCP-compatible host.
 *
 * Usage:
 *   node dist/mcp-server/server.js
 * or:
 *   npx tsx src/mcp-server/server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initDb, getDb, persistDb } from "../db/database.js";
import { matchSkills } from "../skills/matcher.js";
import { injectSkills } from "../skills/injector.js";
import { extractSkills } from "../skills/extractor.js";
import { scoreAllSkills } from "../scoring/scorer.js";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";

// ─── Server definition ─────────────────────────────────────────────────────

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "skillforge",
    version: "2.0.0",
  });

  // ── search_skills ────────────────────────────────────────────────────────

  server.registerTool(
    "search_skills",
    {
      description:
        "Search the SkillForge skill registry by natural language query. " +
        "Returns the top-N matching skills with relevance scores and snippets. " +
        "Use this to discover what skills are available before executing a task.",
      inputSchema: {
        query: z.string().min(1).describe("Natural language search query"),
        topN: z
          .number()
          .int()
          .positive()
          .max(20)
          .default(5)
          .describe("Maximum number of results to return (default: 5)"),
      },
    },
    async ({ query, topN }) => {
      const matches = matchSkills(query, topN ?? 5);

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ results: [], message: "No matching skills found." }),
            },
          ],
        };
      }

      const results = matches.map((m) => ({
        id: m.id,
        name: m.name,
        bm25Score: Math.round(m.bm25Score * 1000) / 1000,
        compositeScore: Math.round(m.score * 1000) / 1000,
        matchedTerms: m.matchedTerms,
        snippet: m.snippet,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ results, count: results.length }),
          },
        ],
      };
    }
  );

  // ── get_skill ─────────────────────────────────────────────────────────────

  server.registerTool(
    "get_skill",
    {
      description:
        "Retrieve a specific skill by ID. Returns full SKILL.md content, " +
        "taxonomy classification, score, and usage statistics.",
      inputSchema: {
        id: z.string().min(1).describe("Skill ID (from search_skills results)"),
      },
    },
    async ({ id }) => {
      const db = getDb();
      const result = db.exec(
        `SELECT id, name, path, content, taxonomy, score, usage_count, created_at, updated_at
         FROM skills WHERE id = ?`,
        [id]
      );

      if (!result[0]?.values.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `Skill not found: ${id}` }),
            },
          ],
          isError: true,
        };
      }

      const cols = result[0].columns;
      const row = result[0].values[0];
      if (!row) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Skill not found" }) }],
          isError: true,
        };
      }

      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });

      if (obj["taxonomy"] && typeof obj["taxonomy"] === "string") {
        try { obj["taxonomy"] = JSON.parse(obj["taxonomy"] as string); } catch { /* keep string */ }
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }],
      };
    }
  );

  // ── inject_skill ──────────────────────────────────────────────────────────

  server.registerTool(
    "inject_skill",
    {
      description:
        "Given a task description, find the best-matching skills and return a " +
        "formatted system prompt fragment ready to inject into an LLM context. " +
        "Also returns a Cloudflare AI Gateway metadata header for log tagging.",
      inputSchema: {
        task: z.string().min(1).describe("Natural language task description"),
        topN: z
          .number()
          .int()
          .positive()
          .max(10)
          .default(3)
          .describe("Maximum skills to inject (default: 3)"),
        maxTokens: z
          .number()
          .int()
          .positive()
          .max(8000)
          .default(2000)
          .describe("Token budget for the injected fragment (default: 2000)"),
      },
    },
    async ({ task, topN, maxTokens }) => {
      const result = injectSkills(task, {
        topN: topN ?? 3,
        maxTokens: maxTokens ?? 2000,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              systemFragment: result.systemFragment,
              skillCount: result.skills.length,
              tokenEstimate: result.tokenEstimate,
              cfMetadataHeader: result.cfMetadataHeader,
              injectedSkills: result.skills.map((s) => ({ id: s.id, name: s.name })),
            }),
          },
        ],
      };
    }
  );

  // ── capture_skill ─────────────────────────────────────────────────────────

  server.registerTool(
    "capture_skill",
    {
      description:
        "Capture a new reusable skill pattern from a successful task trace. " +
        "Writes the SKILL.md to disk and upserts it into the registry. " +
        "The trace should describe the problem, steps taken, and outcome.",
      inputSchema: {
        name: z.string().min(1).describe("Skill name (will be slugified for the directory)"),
        content: z
          .string()
          .min(50)
          .describe("Full SKILL.md markdown content to capture"),
        trace: z
          .string()
          .optional()
          .describe("Optional: task execution trace that produced this skill"),
      },
    },
    async ({ name, content, trace }) => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const dir = resolve(`./skills/${slug}`);
      mkdirSync(dir, { recursive: true });

      const filePath = join(dir, "SKILL.md");
      writeFileSync(filePath, content, "utf-8");

      // Record lineage as CAPTURED evolution
      const db = getDb();
      const skillResult = db.exec(
        "SELECT id FROM skills WHERE path LIKE ?",
        [`%${slug}%`]
      );

      const skills = extractSkills();
      scoreAllSkills();

      // Find the newly extracted skill
      const newSkillResult = db.exec("SELECT id FROM skills WHERE path LIKE ?", [`%${slug}%`]);
      const newSkillId = newSkillResult[0]?.values[0]?.[0] as string | undefined;

      if (newSkillId) {
        const lineageId = randomUUID();
        db.run(
          `INSERT INTO skill_lineage (id, parent_id, child_id, relation_type, evolution_type, reason, created_at)
           VALUES (?, NULL, ?, 'captured', 'CAPTURED', ?, datetime('now'))`,
          [lineageId, newSkillId, trace ?? "Captured via MCP capture_skill tool"]
        );
        persistDb();
      }

      logger.info("MCP: captured skill", { name, slug, trace: trace?.slice(0, 80) });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              slug,
              path: filePath,
              totalSkills: skills.length,
              message: `Skill '${name}' captured and registered.`,
            }),
          },
        ],
      };
    }
  );

  // ── score_skill ───────────────────────────────────────────────────────────

  server.registerTool(
    "score_skill",
    {
      description:
        "Submit feedback or a score for a skill execution. " +
        "Rating must be 1–5. Scores are aggregated into the skill's composite score " +
        "and influence future injection ranking.",
      inputSchema: {
        skillId: z.string().min(1).describe("ID of the skill to score"),
        rating: z
          .number()
          .int()
          .min(1)
          .max(5)
          .describe("Rating from 1 (poor) to 5 (excellent)"),
        comment: z
          .string()
          .optional()
          .describe("Optional qualitative feedback comment"),
        source: z
          .string()
          .optional()
          .default("mcp")
          .describe("Source tag for the feedback (default: mcp)"),
      },
    },
    async ({ skillId, rating, comment, source }) => {
      const db = getDb();

      // Verify skill exists
      const exists = db.exec("SELECT id, name FROM skills WHERE id = ?", [skillId]);
      if (!exists[0]?.values.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: `Skill not found: ${skillId}` }),
            },
          ],
          isError: true,
        };
      }

      const skillName = exists[0].values[0]?.[1] as string;

      const feedbackId = randomUUID();
      db.run(
        `INSERT INTO feedback (id, skill_id, rating, comment, source, received_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [feedbackId, skillId, rating, comment ?? null, source ?? "mcp"]
      );

      // Also record as a skill_score entry (normalized 0–1)
      const scoreId = randomUUID();
      const normalizedScore = (rating - 1) / 4; // 1→0.0, 3→0.5, 5→1.0
      db.run(
        `INSERT INTO skill_scores (id, skill_id, score_type, score, weight, recorded_at)
         VALUES (?, ?, 'feedback', ?, 1.0, datetime('now'))`,
        [scoreId, skillId, normalizedScore]
      );

      persistDb();

      logger.info("MCP: scored skill", { skillId, skillName, rating });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              feedbackId,
              skillId,
              skillName,
              rating,
              normalizedScore,
              message: `Feedback recorded for '${skillName}'.`,
            }),
          },
        ],
      };
    }
  );

  return server;
}

// ─── Entry point ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await initDb();

  const server = createMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info("SkillForge MCP server running on stdio");
}

main().catch((err: unknown) => {
  logger.error("MCP server fatal error", err);
  process.exit(1);
});
