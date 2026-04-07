# SkillForge Usage

## When to Use This Skill

SkillForge Usage is the bootstrap skill—the foundation for discovering and leveraging all other available skills. Use this skill in the following scenarios:

- **At the start of any session** where complex tasks are expected. Before diving into implementation work, take 2-3 minutes to survey what skills might be relevant.
- **Before starting a multi-step workflow** such as research, code review, git operations, testing, or infrastructure changes. Skills are designed to guide these workflows optimally.
- **When the user asks about available capabilities.** Rather than relying on your training knowledge, consult SkillForge directly to get up-to-date information about what can be automated or guided.
- **When tackling a new domain or technology** you're less familiar with. A domain skill can provide essential context and best practices.
- **When unsure which approach to take.** Search SkillForge for related keywords and let the skill summaries guide your strategy.

SkillForge exists to make you more effective. The skill discovery overhead (30 seconds of checking) is far outweighed by the time saved by following a proven workflow or avoiding a common pitfall.

---

## Available MCP Tools

SkillForge provides four core MCP tools for skill discovery and management. These tools are always available once the SkillForge MCP server is connected.

### skillforge_list
**Purpose:** List all available skills with essential metadata.

**Returns:** A complete inventory of skills, including id, name, category, tags, and short description for each.

**When to use:** At the start of a session to survey what's available, or when you want to browse all skills in a category.

**Example:** `skillforge_list()` returns all 40+ skills with their metadata.

### skillforge_search
**Purpose:** Search for skills by query string, matching against skill names, descriptions, tags, and categories.

**Returns:** A filtered list of relevant skills ranked by relevance.

**When to use:** When you have a rough idea of the task ("code review", "testing", "git workflow") but aren't sure which skill to use.

**Example:** `skillforge_search("code review")` returns the code-review skill, quality-review skill, and security-review skill with brief descriptions of each.

### skillforge_get
**Purpose:** Retrieve the full SKILL.md instructions for a skill by its id.

**Returns:** The complete skill documentation, including workflow steps, examples, guardrails, and advanced usage.

**When to use:** After identifying a skill via list or search, call skillforge_get to read its full instructions before executing the workflow.

**Example:** `skillforge_get("code-review")` returns the complete code-review skill guide with step-by-step process.

### skillforge_validate
**Purpose:** Validate a skill's manifest.json and report any structural or metadata errors.

**Returns:** Validation results (pass/fail) and detailed error messages if issues are found.

**When to use:** When creating a new skill or debugging manifest issues. Not typically needed during normal skill usage.

**Example:** `skillforge_validate("my-new-skill")` checks that the manifest is well-formed and all required fields are present.

---

## Skill Discovery Workflow

Follow these steps to discover and apply the right skill for your task:

### Step 1: List All Skills (Optional)
Call `skillforge_list()` to see the full inventory. Scan the category and tag columns to get a sense of what's available. This takes 30 seconds and orients you.

### Step 2: Search for Relevant Skills
If you have a task or keyword in mind, call `skillforge_search(query)` with a relevant word or phrase:
- "code review" → searches for review-related skills
- "testing" → finds test-engineering and TDD skills
- "git" → finds git-workflow and version-control skills
- "documentation" → finds writer and documentation skills

The search returns a ranked list of matches. Read the short descriptions to see which skill(s) fit your need.

### Step 3: Get Full Skill Instructions
Once you've identified a skill, call `skillforge_get(skill_id)` to retrieve the full SKILL.md documentation. This is **always required before executing a skill's workflow**—the full instructions contain important context, guardrails, and step-by-step guidance that the short description doesn't cover.

### Step 4: Follow the Skill's Workflow
Read the skill's instructions carefully. Most skills provide:
- A clear objective and expected outcome
- Step-by-step process or workflow
- Examples showing how to apply the skill
- Guardrails and what NOT to do
- Integration points with other tools

Execute the skill's workflow exactly as documented. If the skill calls for specific tools, prompts, or verification steps, follow them. Skills are distilled from best practices and error-resistant workflows.

### Step 5: Verify and Iterate
After completing a skill's workflow, verify the outcome matches the expected result. If something is off, re-read the skill instructions—you may have missed a step or misunderstood a requirement.

---

## Skill Categories

SkillForge skills are organized into five main categories. Understanding these categories helps you find the right skill quickly.

### workflow
**Purpose:** End-to-end task automation and multi-step execution frameworks.

**When to reach for it:** When you need to orchestrate a complex, multi-phase task from start to finish (e.g., "build me a feature", "set up CI/CD", "release a new version").

**Examples:** autopilot, team, ralph, ultrawork.

**Value:** Workflow skills remove ambiguity about sequencing, dependencies, and verification. They keep you moving forward without decision paralysis.

### tool_guide
**Purpose:** How-to guides for specific tools, APIs, platforms, or technologies.

**When to reach for it:** When you need to learn or use a specific tool effectively (e.g., "how do I use this API?", "what's the right way to use git worktrees?").

**Examples:** skillforge-usage, git-workflow, claude-api, tailwind-guide.

**Value:** Tool guides distill best practices, common pitfalls, and command sequences so you don't have to hunt through documentation or trial-and-error.

### domain
**Purpose:** Reference knowledge, context, and best practices for a subject area.

**When to reach for it:** When you need domain-specific guidance before diving into implementation (e.g., "best practices for testing", "security review checklist", "database design patterns").

**Examples:** test-engineering, security-review, performance-optimization.

**Value:** Domain skills level up your knowledge and help you ask better questions before coding.

### integration
**Purpose:** Connecting to external services, APIs, platforms, and data sources.

**When to reach for it:** When you need to integrate with a third-party service or fetch external data (e.g., "connect to Slack", "fetch data from an API", "set up webhooks").

**Examples:** slack-integration, github-api, stripe-payment.

**Value:** Integration skills provide pre-built patterns, authentication flows, and error handling so you don't have to reverse-engineer an API.

### guardrail
**Purpose:** Safety behaviors, constraints, and what NOT to do.

**When to reach for it:** When you need to understand risk boundaries or enforce constraints (e.g., "what should I never do with user data?", "how do I prevent regressions?").

**Examples:** data-privacy, secure-coding, performance-guardrails.

**Value:** Guardrail skills keep you from making costly mistakes and help you build systems that are safe, compliant, and maintainable.

---

## Example: Starting a Code Review

Here's a concrete example of how to use SkillForge to start a code review workflow.

### Scenario
You've just completed a feature implementation and want to conduct a thorough code review before merging.

### Discovery Steps

**Step 1: Search for code review skills**
```
skillforge_search("code review")
```
Returns:
- `code-review` (comprehensive review, API contracts, backward compatibility)
- `quality-reviewer` (logic defects, maintainability, anti-patterns)
- `security-reviewer` (vulnerabilities, trust boundaries, authn/authz)

**Step 2: Get the full code-review skill instructions**
```
skillforge_get("code-review")
```
This returns the complete workflow with:
- Setup: files to review, what to prepare
- Checklist: areas to examine (logic, performance, security, testing, docs)
- Review process: step-by-step how to conduct the review
- Guardrails: common pitfalls to avoid
- Integration: how to handle review feedback

**Step 3: Follow the workflow**
Read through the returned SKILL.md and execute each step in order. The skill guides you on:
- How to structure your review (by area or file)
- What to look for at each stage
- How to document issues and suggestions
- When to involve additional reviewers or specialists

**Step 4: Use specialist reviews as needed**
If the code-review skill identifies security or performance concerns, use `skillforge_get("security-reviewer")` or another relevant skill to dive deeper.

---

## Guardrails

These guardrails ensure you use SkillForge effectively and avoid common pitfalls.

### DO's

- **Always check SkillForge first** before starting a multi-step task or entering unfamiliar territory. It takes 30 seconds and saves time.
- **Read the full SKILL.md before executing.** Short descriptions in the search results are helpful but incomplete. The full instructions are load-bearing.
- **Follow the skill's workflow exactly as documented.** Skills are designed with a specific sequence and set of checkpoints. Skipping steps often leads to rework.
- **Search for multiple skills** if you're unsure. Search results are ranked by relevance, but multiple skills may apply to your task. Compare them and pick the best fit.
- **Verify the outcome** against the skill's stated objective. If something doesn't match, re-read the instructions or try again.

### DON'Ts

- **Don't skip the skill discovery step** when tackling unfamiliar tasks. The "I'll figure it out" approach costs more than the upfront check.
- **Don't rely on the short skill description.** Always call `skillforge_get()` to read the full instructions. Critical context and guardrails live in SKILL.md.
- **Don't modify or bypass a skill's workflow** because you think you know a faster way. Skills are distilled from best practices. Deviations usually cause problems.
- **Don't use an outdated or cached version of a skill.** Always call `skillforge_get()` to fetch the latest version with any recent updates or fixes.
- **Don't assume a skill applies to your task without reading it fully.** Skill names can be misleading. A "testing" skill might apply only to unit tests, not integration tests.
- **Don't use a skill outside its intended scope.** If a skill is designed for frontend testing and you need backend testing, search for a better match.

---

## Integration with Other Tools

SkillForge is designed to work alongside other tools and workflows in the Claude ecosystem:

- **oh-my-claudecode skills:** SkillForge complements the OMC plugin. When OMC asks "which skill should I use?", SkillForge is your reference.
- **MCP servers:** Skills often guide you on when and how to use other MCP tools (Supabase, Vercel, GitHub, etc.).
- **Agents and workflows:** SkillForge skills inform multi-agent orchestration. Agents use skillforge_get to discover best-practice workflows.
- **Documentation:** Skills reference external docs but distill them into actionable guidance. Always prefer the skill's instructions over raw documentation.

---

## Quick Reference

| Tool | Purpose | When to Use |
|------|---------|------------|
| `skillforge_list()` | See all available skills | Session start, browsing |
| `skillforge_search(query)` | Find relevant skills | When you have a task keyword |
| `skillforge_get(id)` | Read full instructions | Before executing a skill |
| `skillforge_validate(id)` | Check skill manifest | Creating/debugging skills |

---

## Summary

SkillForge Usage teaches you to be a power user of SkillForge itself. The bootstrap workflow is simple:

1. **Search** for skills relevant to your task
2. **Get** the full instructions for the best match
3. **Follow** the workflow as documented
4. **Verify** the outcome

By spending 30 seconds on skill discovery, you save hours of trial-and-error and leverage distilled best practices. Make SkillForge your first stop for any non-trivial task.
