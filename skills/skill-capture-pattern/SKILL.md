# Skill Capture Pattern

When a task completes successfully, extract the reusable pattern and save it as a new SKILL.md. This is the core loop that makes SkillForge compound over time.

## When to Use

After any non-trivial task completes successfully — especially when you had to figure something out that wasn't obvious, combined multiple tools in a new way, or solved a problem that took multiple attempts.

## Steps

1. **Identify the computational skeleton** — strip away domain-specific details and find the abstract algorithm. Ask: "What is the underlying pattern here that would apply in a different context?"

2. **Name the skill** — use a short, noun-phrase slug. Examples: `cloudflare-gateway-setup`, `sqlite-incremental-sync`, `zod-schema-validation`. No verbs, no `how-to-`.

3. **Write the SKILL.md** with this structure:
   ```markdown
   # Skill Name

   One-sentence description of what the skill accomplishes and why.

   ## When to Use
   Explicit trigger conditions. What signals that this skill applies?

   ## Steps
   Numbered, actionable steps. Each step is a complete thought.

   ## Algorithm (optional)
   Pseudocode or diagram of the computational skeleton.

   ## Primitives
   Comma-separated list of reusable patterns: http-fetch, sql-query, caching, etc.

   ## Tags
   Technology tags for taxonomy classification.
   ```

4. **Strip domain specifics** — replace project-specific names with generic placeholders. `skillforge` → `{project}`, `gateway_logs` → `{table_name}`.

5. **Save to `skills/{slug}/SKILL.md`** in the project root.

6. **Trigger extraction** via `POST /skills/extract` or `npm run dev` restart to upsert the new skill into the DB.

7. **Verify taxonomy** — check that the skill was classified in the correct domain via `GET /skills`.

## Algorithm

```
task completes
  → identify skeleton (strip domain)
  → name it (noun slug)
  → write SKILL.md (structure above)
  → POST /skills/extract
  → verify taxonomy
```

## Primitives

- data-transform, event-driven

## Tags

typescript, architecture
