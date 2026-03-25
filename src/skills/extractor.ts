/**
 * Skill Extractor (P1-06)
 *
 * Scans the skills/ directory tree for SKILL.md files, parses them,
 * classifies them via the taxonomy engine, and upserts them into the DB.
 *
 * SKILL.md format:
 *   # Title
 *   <description prose>
 *   ## Steps / Algorithm
 *   <numbered steps or pseudocode>
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, resolve } from "path";
import { randomUUID } from "crypto";
import { getDb, persistDb } from "../db/database.js";
import { classify, type Taxonomy } from "../taxonomy/taxonomy.js";
import { logger } from "../utils/logger.js";

const SKILLS_DIR = resolve("./skills");

export interface ParsedSkill {
  id: string;
  name: string;
  path: string;
  content: string;
  taxonomy: Taxonomy;
}

function parseSkillMd(filePath: string): { name: string; content: string } {
  const raw = readFileSync(filePath, "utf-8");
  const titleMatch = raw.match(/^#\s+(.+)/m);
  const name = titleMatch?.[1]?.trim() ?? filePath.split("/").at(-2) ?? "untitled";
  return { name, content: raw };
}

function walkSkillsDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const paths: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      paths.push(...walkSkillsDir(full));
    } else if (entry === "SKILL.md") {
      paths.push(full);
    }
  }

  return paths;
}

export function extractSkills(): ParsedSkill[] {
  const skillPaths = walkSkillsDir(SKILLS_DIR);
  logger.info("Extractor: found SKILL.md files", { count: skillPaths.length });

  const results: ParsedSkill[] = [];
  const db = getDb();

  for (const filePath of skillPaths) {
    const relPath = relative(SKILLS_DIR, filePath);
    const { name, content } = parseSkillMd(filePath);
    const taxonomy = classify(content);

    const existing = db.exec("SELECT id FROM skills WHERE path = ?", [relPath]);
    const id = (existing[0]?.values[0]?.[0] as string | undefined) ?? randomUUID();

    db.run(
      `INSERT INTO skills (id, name, path, content, taxonomy, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(path) DO UPDATE SET
         name = excluded.name,
         content = excluded.content,
         taxonomy = excluded.taxonomy,
         updated_at = excluded.updated_at`,
      [id, name, relPath, content, JSON.stringify(taxonomy)]
    );

    results.push({ id, name, path: relPath, content, taxonomy });
    logger.debug("Extractor: upserted skill", { name, path: relPath, domain: taxonomy.domain });
  }

  if (results.length > 0) persistDb();
  logger.info("Extractor: extraction complete", { upserted: results.length });
  return results;
}
