# Database Migration

## When to Use This Skill

Use this skill when you need to modify database schema in production or staging environments. Applies to:

- Adding or removing columns
- Creating or dropping tables or indexes
- Renaming tables or columns
- Changing column data types or constraints
- Adding or removing foreign key relationships
- Modifying table partitioning or sharding strategies
- Scaling database capacity or changing storage engines

Database migrations are high-risk operations that can cause data loss or downtime if executed incorrectly. This skill provides a structured approach to minimize risk.

## Migration Workflow

Follow these steps in order to safely execute database migrations:

1. **Assess** - Understand the change required, identify all affected tables and queries, estimate the scope (rows affected, execution time). Document the business reason for the migration.

2. **Backup** - Create a full database backup before any migration. Verify backup integrity and ensure it can be restored. Store backup in a separate location from the database.

3. **Write Migration** - Write the migration SQL statement(s) following your framework conventions. Make the migration idempotent (safe to run multiple times). Include comments explaining non-obvious changes.

4. **Write Rollback** - Create a rollback statement that precisely reverses the migration. Test rollback on a copy of production data. Document any data loss or limitations in rollback.

5. **Test on Staging** - Run the migration on a staging database that mirrors production structure and data. Verify the migration completes successfully. Run application tests to confirm functionality.

6. **Production Deploy** - Execute migration during a maintenance window or low-traffic period. Have a rollback plan ready. Monitor for performance issues during and after migration.

7. **Verify** - Run application health checks. Monitor database performance metrics. Verify no data was lost or corrupted. Document the completed migration in your change log.

## Migration Safety Checklist

### Pre-Flight Checks
- [ ] Has the migration been reviewed by a database expert?
- [ ] Is there a complete backup of the production database?
- [ ] Has the migration been tested on staging with production data?
- [ ] Is a tested rollback script prepared?
- [ ] Is the rollback plan documented?
- [ ] Have all affected applications been identified?
- [ ] Is there a maintenance window scheduled?
- [ ] Are monitoring and alerting enabled?

### During Migration
- [ ] Monitor database CPU, memory, and disk I/O during execution
- [ ] Watch for locks on heavily-used tables
- [ ] Verify application error rates remain normal
- [ ] Check transaction logs for errors or warnings
- [ ] Be ready to execute rollback if issues occur

### Post-Migration Verification
- [ ] Confirm migration completed successfully (check migration history table)
- [ ] Run data integrity checks (row counts, foreign key constraints)
- [ ] Execute application smoke tests
- [ ] Monitor database performance metrics for 24 hours
- [ ] Verify backups still work with new schema
- [ ] Document migration completion timestamp and duration

## Rollback Strategy

A rollback strategy must be planned before the migration is executed.

### Writing Rollback Scripts

For additive migrations (ADD COLUMN, CREATE INDEX), rollback is straightforward:
```sql
-- Migration
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;

-- Rollback
ALTER TABLE users DROP COLUMN email_verified;
```

For destructive migrations (DROP, RENAME), document data loss:
```sql
-- Migration
ALTER TABLE legacy_data DROP COLUMN obsolete_field;

-- Rollback (impossible - data cannot be recovered)
-- Rollback only possible from backup. No reversal available in code.
```

### Testing Rollback

1. Restore database from backup on test server
2. Apply migration
3. Apply rollback script
4. Verify schema matches pre-migration state
5. Run data integrity checks
6. Document rollback success and any limitations

### Automatic Rollback Triggers

Define conditions that trigger automatic rollback:
- Migration execution exceeds 30 minutes
- Database errors exceed threshold
- Application error rate spikes above baseline
- Disk space drops below minimum threshold

## Common Migration Patterns

### Additive: Add Column
```sql
ALTER TABLE users
ADD COLUMN last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
```
Safe, non-blocking, fast on large tables. Rollback is destructive (deletes column).

### Additive: Add Index
```sql
CREATE INDEX idx_users_email ON users(email);
```
Safe, non-blocking, but uses disk space. Can be created online in PostgreSQL 11+.

### Additive: Create Table
```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
Safe, fast, reversible with DROP TABLE. No risk of data loss.

### Destructive: Drop Column
```sql
ALTER TABLE users DROP COLUMN deprecated_field;
```
Destructive - data is lost. Only reversible from backup. Requires explicit confirmation.

### Destructive: Rename Column
```sql
ALTER TABLE users RENAME COLUMN old_name TO new_name;
```
Requires application code update. Risk of referential integrity issues. Test thoroughly.

### Destructive: Change Column Type
```sql
ALTER TABLE users ALTER COLUMN phone TYPE VARCHAR(20);
```
Requires full table rewrite on large tables. Can cause significant downtime. Use zero-downtime pattern if available.

## Guardrails

**Never DROP without confirmation:** Always require explicit user approval before running DROP COLUMN or DROP TABLE migrations.

**Always backup first:** No exceptions. A backup is your only safety net for truly destructive operations.

**Test thoroughly:** Never run a migration for the first time in production. Always test on staging first with production data.

**Document everything:** Include comments in migration code explaining why the change is needed and any special considerations.

**Plan rollback:** If you cannot write a rollback, do not run the migration without explicit stakeholder approval.

**Avoid lock times:** Monitor table lock duration. If lock time exceeds acceptable downtime window, use zero-downtime migration patterns.

**Validate data:** Always run data integrity checks after migrations to ensure no data was corrupted or lost.
