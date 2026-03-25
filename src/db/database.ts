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

  logger.info("Database migrations complete");
}
