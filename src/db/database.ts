/**
 * SQLite database layer using sql.js (pure WASM — no native binaries required).
 *
 * Tables:
 *   skills         — extracted SKILL.md records
 *   gateway_logs   — cached Cloudflare AI Gateway log entries
 *   experiments    — AutoResearch loop results
 *   feedback       — webhook feedback events
 */

import initSqlJs, { type Database } from "sql.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { logger } from "../utils/logger.js";

let _db: Database | undefined;
let _dbPath: string;

export async function initDb(dbPath = "./data/skillforge.db"): Promise<Database> {
  if (_db) return _db;

  _dbPath = dbPath;
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath);
    _db = new SQL.Database(fileBuffer);
    logger.info("Loaded existing database", { path: dbPath });
  } else {
    _db = new SQL.Database();
    logger.info("Created new database", { path: dbPath });
  }

  runMigrations(_db);
  persistDb();

  return _db;
}

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialized — call initDb() first");
  return _db;
}

/** Flush in-memory WASM DB to disk. Call after every write batch. */
export function persistDb(): void {
  if (!_db) return;
  const data = _db.export();
  writeFileSync(_dbPath, Buffer.from(data));
}

function runMigrations(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS skills (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL UNIQUE,
      content     TEXT NOT NULL,
      taxonomy    TEXT,
      score       REAL DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gateway_logs (
      id           TEXT PRIMARY KEY,
      provider     TEXT NOT NULL,
      model        TEXT NOT NULL,
      prompt_tokens  INTEGER,
      output_tokens  INTEGER,
      latency_ms     INTEGER,
      status         TEXT NOT NULL,
      cached         INTEGER NOT NULL DEFAULT 0,
      request_body   TEXT,
      response_body  TEXT,
      logged_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS experiments (
      id          TEXT PRIMARY KEY,
      skill_id    TEXT REFERENCES skills(id),
      hypothesis  TEXT NOT NULL,
      provider    TEXT NOT NULL,
      model       TEXT NOT NULL,
      result      TEXT,
      score       REAL,
      ran_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id          TEXT PRIMARY KEY,
      skill_id    TEXT REFERENCES skills(id),
      rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment     TEXT,
      source      TEXT NOT NULL DEFAULT 'webhook',
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // P2-01: LLM-as-judge evaluation scores
  db.run(`
    CREATE TABLE IF NOT EXISTS judge_scores (
      id              TEXT PRIMARY KEY,
      skill_id        TEXT REFERENCES skills(id),
      experiment_id   TEXT REFERENCES experiments(id),
      prompt          TEXT NOT NULL,
      response        TEXT NOT NULL,
      score           REAL NOT NULL CHECK(score BETWEEN 0 AND 1),
      reasoning       TEXT NOT NULL,
      model           TEXT NOT NULL,
      provider        TEXT NOT NULL,
      prompt_tokens   INTEGER NOT NULL DEFAULT 0,
      output_tokens   INTEGER NOT NULL DEFAULT 0,
      judged_at       TEXT NOT NULL
    );
  `);

  // P2-07: Skill versioning, per-skill scores, and lineage tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS skill_versions (
      id          TEXT PRIMARY KEY,
      skill_id    TEXT NOT NULL REFERENCES skills(id),
      version     INTEGER NOT NULL DEFAULT 1,
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, version)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS skill_scores (
      id            TEXT PRIMARY KEY,
      skill_id      TEXT NOT NULL REFERENCES skills(id),
      score_type    TEXT NOT NULL,  -- 'judge' | 'feedback' | 'implicit' | 'composite'
      score         REAL NOT NULL CHECK(score BETWEEN 0 AND 1),
      weight        REAL NOT NULL DEFAULT 1.0,
      recorded_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS skill_lineage (
      id            TEXT PRIMARY KEY,
      parent_id     TEXT REFERENCES skills(id),
      child_id      TEXT NOT NULL REFERENCES skills(id),
      relation_type TEXT NOT NULL,  -- 'derived_from' | 'refines' | 'conflicts_with'
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // P3-01: AutoResearch run tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS autoresearch_runs (
      id            TEXT PRIMARY KEY,
      started_at    TEXT NOT NULL DEFAULT (datetime('now')),
      stopped_at    TEXT,
      status        TEXT NOT NULL DEFAULT 'running',
      experiments   INTEGER NOT NULL DEFAULT 0,
      wins          INTEGER NOT NULL DEFAULT 0,
      losses        INTEGER NOT NULL DEFAULT 0,
      report_path   TEXT
    );
  `);

  // P3-02: Per-experiment variant results
  db.run(`
    CREATE TABLE IF NOT EXISTS autoresearch_experiments (
      id                  TEXT PRIMARY KEY,
      run_id              TEXT NOT NULL REFERENCES autoresearch_runs(id),
      skill_id            TEXT NOT NULL REFERENCES skills(id),
      strategy            TEXT NOT NULL,
      original_score      REAL NOT NULL DEFAULT 0,
      variant_score       REAL NOT NULL DEFAULT 0,
      original_tokens     INTEGER NOT NULL DEFAULT 0,
      variant_tokens      INTEGER NOT NULL DEFAULT 0,
      original_latency_ms INTEGER NOT NULL DEFAULT 0,
      variant_latency_ms  INTEGER NOT NULL DEFAULT 0,
      composite_delta     REAL NOT NULL DEFAULT 0,
      winner              TEXT NOT NULL DEFAULT 'original',
      confidence          REAL NOT NULL DEFAULT 0,
      promoted            INTEGER NOT NULL DEFAULT 0,
      notes               TEXT,
      ran_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  logger.info("Database migrations complete");
}
