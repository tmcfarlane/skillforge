# SQLite Registry Pattern

Store, version, and query structured records in a local SQLite database using sql.js (pure WASM — no native binaries). Supports versioning, lineage tracking, and composite scoring across related tables.

## When to Use

Use whenever you need a persistent, queryable registry for artifacts that evolve over time (skills, experiments, documents). Especially suited for local-first Node.js services where:
- No C++ toolchain is available (Windows/Linux CI)
- Records need version history
- Multiple score signals must be aggregated per record
- No external DB server is acceptable

## Steps

1. **Define tables with `CREATE TABLE IF NOT EXISTS`** — always idempotent. Tables: `{records}`, `{record}_versions`, `{record}_scores`, `{record}_lineage`.

2. **Use TEXT PRIMARY KEY with `randomUUID()`** — avoids integer ID collisions across distributed writes.

3. **Run all migrations in a single `runMigrations(db)` function** called at startup, before any queries.

4. **Call `persistDb()` after every write batch** — sql.js stores the DB in-memory; `persistDb()` flushes to disk as a binary Buffer.

5. **Version records on update** — INSERT into `{record}_versions` with an incremented version number before updating the main record. Never delete versions.

6. **Track lineage via `{record}_lineage` table** — record `parent_id`, `child_id`, and `relation_type` ('derived_from', 'refines', 'conflicts_with') when one record produces another.

7. **Store composite scores in `{record}_scores`** — separate rows for each signal type ('judge', 'feedback', 'implicit', 'composite'). Never overwrite; always INSERT.

8. **Read with `db.exec(SQL, params)`** — returns `[{ columns, values }]`. Map values to typed objects via `columns.forEach((col, i) => obj[col] = row[i])`.

## Algorithm

```
startup:
  SQL = await initSqlJs()
  db = existsSync(path) ? new SQL.Database(readFileSync(path)) : new SQL.Database()
  runMigrations(db)
  persistDb()

write:
  db.run("INSERT/UPDATE ...", [params])
  persistDb()  ← always after writes

version:
  version = MAX(version) FROM {record}_versions WHERE id = ?
  INSERT INTO {record}_versions (id, record_id, version+1, content, now)

read:
  result = db.exec("SELECT ...", [params])
  rows = result[0].values.map(row => mapColumns(columns, row))
```

## Primitives

- sql-query, data-transform, versioning, event-driven

## Tags

sqlite, sql.js, typescript, registry, versioning, wasm, node
