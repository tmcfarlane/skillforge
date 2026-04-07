# Deep Research Skill

## When to Use This Skill

Use the Deep Research skill when:
- You need comprehensive, well-sourced answers to complex questions
- Investigating emerging technologies, trends, or frameworks
- Building the knowledge foundation for architectural decisions
- Comparing competing solutions, vendors, or approaches
- Understanding best practices in unfamiliar domains
- Conducting competitive analysis or market research
- Validating claims or resolving conflicting information
- Preparing for high-stakes decisions that require evidence

This skill is ideal when a single source is insufficient and you need multiple perspectives, primary sources, and synthesis across domains.

## Research Process

### 1. Define Scope
Clarify the research question by identifying:
- Primary focus (what is the core question?)
- Boundaries (what's in scope, what's explicitly out of scope?)
- Target audience (who will consume this research?)
- Required depth (survey overview vs. detailed technical analysis?)
- Time constraints (current state vs. historical context vs. future trends?)
- Success criteria (what would constitute a complete answer?)

Write a one-sentence research hypothesis to guide searches.

### 2. Identify Search Angles
Plan multiple search queries to capture different perspectives:
- **Definitional**: "What is [topic]? How does [X] work?"
- **Comparative**: "[Solution A] vs [Solution B]", "Alternatives to [X]"
- **Evaluative**: "Pros and cons of [topic]", "Best practices for [X]"
- **Trend-based**: "[Topic] 2024", "Future of [domain]"
- **Problem-focused**: "How to [solve problem]", "Common pitfalls with [X]"

Aim for 5-8 distinct search queries per research session.

### 3. Execute Parallel Searches
Run searches concurrently to maximize coverage and efficiency. Capture:
- URL and source name
- Publication date (for relevance)
- Author/organization credibility
- Key quotations or data points
- Summary of source position on the topic

Track which searches yielded the most useful results for future iterations.

### 4. Synthesize Findings
Extract common themes, areas of consensus, and points of disagreement:
- **Consensus clusters**: What do most sources agree on?
- **Outlier positions**: What's disputed or controversial?
- **Complementary views**: How do sources build on each other?
- **Evidence hierarchy**: Which claims are backed by data vs. opinion?

Create a "map" of the knowledge landscape: foundational concepts, key debates, and open questions.

### 5. Verify and Reconcile Conflicts
When sources disagree:
- Check publication dates (newer info may supersede older claims)
- Evaluate source credibility (academic papers vs. opinion blogs)
- Look for contextual differences (different use cases, assumptions, or constraints)
- Dig deeper on high-impact disagreements (run additional searches if needed)
- Document the conflict explicitly rather than glossing over it

Never assume one source is correct without independent verification.

### 6. Compile and Report
Structure findings in the output format below. Include confidence levels and explicit gaps. Distinguish sharply between facts, expert consensus, and your own analysis.

## Source Quality Guidelines

### Tier 1: Authoritative
- Peer-reviewed academic journals and publications
- Government and regulatory agencies
- Primary source documentation (official specs, APIs, whitepapers)
- Established industry standards bodies (IEEE, IETF, W3C)
- Books by recognized experts in the field
- Official company/project documentation

**Use for**: Foundational claims, technical accuracy, regulatory requirements

### Tier 2: Strong
- Major news outlets (Reuters, AP, BBC, WSJ)
- Established industry publications (TechCrunch for tech, HBR for business)
- University research centers and think tanks
- Well-maintained open-source project documentation
- Technical blogs by experienced practitioners
- Conference talks and recorded presentations from recognized experts

**Use for**: Current state, trends, practitioner perspectives

### Tier 3: Useful But Limited
- Blog posts from individuals (even experienced ones)
- Social media discussions (Reddit, Twitter, Hacker News)
- Vendor whitepapers and marketing materials
- Podcasts and interviews
- Community wikis (Stack Overflow, MDN)

**Use for**: Alternative perspectives, implementation details, nuance. Verify critical claims against Tier 1-2 sources.

### Tier 4: Red Flags
- Obvious sales pitches without supporting evidence
- Outdated sources (verify claims against recent sources)
- Anonymous sources without institutional credibility
- Sensationalized headlines without substance
- Sources with clear conflicts of interest and no acknowledgment

**Use with caution**: Cross-reference against higher tiers before citing.

## Synthesis Framework

### Identify Consensus
List claims where 3+ independent, credible sources agree. This represents strong consensus and safe to state as fact. Example:
- "Multiple sources consistently identify X as a best practice because [reason]."

### Document Competing Views
When credible sources disagree, present both positions fairly:
- "Source A argues [position] based on [evidence]. Source B argues [position] based on [evidence]. The difference hinges on [key assumption]."

Never pick a side without explicit justification.

### Connect Across Domains
Look for insights from adjacent fields:
- Does research on [Topic A] inform [Topic B]?
- How do different industries solve similar problems?
- Are there historical parallels?

Explicitly note when you're making cross-domain inferences.

### Extract Actionable Insights
Move beyond summarizing sources to deriving meaning:
- What are the practical implications?
- What decisions or actions does this research inform?
- What are the key trade-offs?
- What remains unknown or uncertain?

Label these as "Analysis" rather than factual findings.

## Output Format

Structure deep research findings as follows:

```
## Summary
[2-3 sentence executive summary of key findings and thesis]

## Key Findings
1. [Finding] [Source: URL]
2. [Finding] [Source: URL]
3. [Finding with important caveat or nuance] [Source: URL]
[Continue, organized by theme or logical flow]

## Consensus and Disagreement
[Document areas of strong agreement and explain competing viewpoints where they exist]

## Sources Reviewed
[Annotated list of sources by tier, with brief credibility notes]
- [Title](URL) - Tier 1, [brief credibility note]
- [Title](URL) - Tier 2, [credibility note]
[Continue]

## Analysis & Synthesis
[Your synthesis connecting sources, identifying patterns, and deriving implications]

## Confidence Level
[HIGH/MEDIUM/LOW assessment of research completeness]

## Gaps & Limitations
[What remains unanswered? What would improve this research?]
[Potential biases in sources reviewed]
[Time sensitivity of findings]
```

## Guardrails

1. **Always cite sources with URLs** - Every factual claim requires a source attribution. Enable users to verify or drill deeper.

2. **Distinguish between facts and analysis/opinion** - Label your own synthesis clearly. Don't present derived conclusions as primary findings.

3. **Flag conflicting information across sources explicitly** - Don't hide disagreement. Surface it, explain it, and note what drives the difference.

4. **Never fabricate citations or sources** - If you don't have a source, say so. Speculation should be labeled as such.

5. **Acknowledge source limitations** - Note publication date, potential bias (vendor materials, opinion pieces), and context that shapes credibility.

6. **Verify high-stakes claims** - For claims that significantly influence decisions, cite multiple independent sources and validate consistency.

7. **Revisit and update research** - Research has shelf life. Note when findings may become outdated and recommend re-validation timelines.

8. **Disclose your own confidence** - Be honest about what you're confident in and what involves inference or educated guessing.
