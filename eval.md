# AutoResearch Eval Tasks

Five benchmark tasks covering distinct Claude Code workflow domains.
Each task can be scored by the LLM judge and reproduced deterministically.

---

## Task 1

**Domain:** coding
**Skill under test:** Writing reusable, well-structured functions

**Prompt:**
```
Write a TypeScript function `parseCsv(input: string): Record<string, string>[]` that:
1. Accepts a raw CSV string (may include a header row)
2. Returns an array of objects where keys are column headers
3. Handles quoted fields that may contain commas
4. Returns an empty array for blank input
Include the function signature and implementation only — no explanation.
```

**Expected:**
```
A complete TypeScript function that:
- Parses a header row and uses it as object keys
- Handles quoted fields (fields wrapped in double quotes, possibly containing commas)
- Returns [] for empty/blank input
- Has correct TypeScript types with no `any`
```

---

## Task 2

**Domain:** debugging
**Skill under test:** Identifying and fixing async/await race conditions

**Prompt:**
```
The following Node.js code has a bug — it sometimes logs results out of order and occasionally throws "Cannot read properties of undefined":

```typescript
async function fetchUser(id: number) {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

const ids = [1, 2, 3];
ids.forEach(async (id) => {
  const user = await fetchUser(id);
  console.log(user.name);
});
```

Identify the bug, explain why it causes the observed symptoms, and provide the fixed version.
```

**Expected:**
```
Identifies that forEach does not await async callbacks — each iteration fires independently and the loop completes before any fetch resolves.
Fixes by replacing forEach with Promise.all + .map, or for...of with await.
Explains why out-of-order results occur and why undefined errors happen when the response is incomplete.
```

---

## Task 3

**Domain:** analysis
**Skill under test:** Comparing and choosing between architectural patterns

**Prompt:**
```
You are designing a background job system for a Node.js API that processes 10,000 image uploads per day. Compare these two approaches:

A) BullMQ with Redis — queue-based, persistent, supports retries and priorities
B) Node.js worker_threads — in-process, no external dependency, limited to one machine

Provide a structured comparison covering: scalability, fault tolerance, operational complexity, and cost. Recommend one and justify your choice for this workload.
```

**Expected:**
```
Structured comparison covering all four dimensions.
Recommendation of BullMQ for this workload (10K/day is non-trivial, needs retry/fault tolerance, horizontal scaling likely needed).
Acknowledges trade-offs: Redis adds operational overhead, worker_threads simpler for smaller scale.
```

---

## Task 4

**Domain:** planning
**Skill under test:** Breaking down a vague feature request into an implementation plan

**Prompt:**
```
A product manager says: "We need a skill score dashboard so users can see which skills are performing well."

You are the tech lead. Produce a concrete implementation plan with:
1. The minimum set of backend endpoints needed
2. The key data that needs to be exposed
3. A list of 3–5 implementation tasks ordered by dependency
4. Any risks or open questions to resolve before starting
```

**Expected:**
```
Backend endpoints: at minimum GET /skills/scores or similar summary endpoint.
Key data: skill name, composite score, usage_count, judge_score trend, last updated.
Ordered tasks starting with data layer (query aggregation), then API, then UI.
At least one meaningful risk or open question (e.g., score history not yet tracked, pagination strategy).
```

---

## Task 5

**Domain:** writing
**Skill under test:** Turning technical notes into clear developer documentation

**Prompt:**
```
Convert the following rough implementation notes into a clean API reference section for a README:

Notes:
- POST /skills/extract scans ./skills dir, parses SKILL.md files, upserts into db
- needs content-type application/json but body is empty (just fires the scan)
- returns { extracted: number, errors: string[] }
- GET /skills returns all skills, has optional ?tag= filter and ?limit= param
- GET /skills/inject?task=xxx returns top N skill fragments for the given task string
```

**Expected:**
```
Clean markdown API reference with:
- Proper HTTP method + path headers (### POST /skills/extract)
- Description of what each endpoint does
- Request format (method, headers, body if any)
- Response format with field descriptions
- Query parameter documentation for GET /skills and GET /skills/inject
Reads as professional documentation, not raw notes.
```
