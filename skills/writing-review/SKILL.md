# Writing Review

## When to Use This Skill

Use this skill to improve writing quality before publishing or sharing. Applies to:

- READMEs and project documentation
- Blog posts and articles
- Technical specifications and proposals
- API documentation and code comments
- User guides and tutorials
- Marketing copy and announcements
- Research papers and white papers
- Internal memos and reports

A writing review catches unclear passages, redundancy, weak structure, and passive voice that the author may have missed. The goal is to enhance clarity and impact while preserving the author's unique voice.

## Review Process

Follow this structured process to review writing effectively:

**1. Read for Understanding** - Read the entire piece without editing. Understand the main message, intended audience, and purpose. Note sections that are unclear or confusing on first read.

**2. Check Structure** - Verify the piece has a clear beginning (context/hook), middle (main argument), and end (call to action or conclusion). Check that paragraphs follow a logical sequence. Ensure transitions between sections are smooth.

**3. Line Edit** - Review sentence by sentence. Check for passive voice, weak verbs, unclear references, and wordiness. Flag grammar and punctuation issues. Ensure consistency in terminology and style.

**4. Final Pass** - Read once more at normal reading speed. Verify suggestions improve clarity without losing the author's voice. Remove any feedback that is a matter of style preference rather than clarity.

## Review Dimensions

| Dimension | What to Check | Example Fix |
|---|---|---|
| Clarity | Sentences are simple and direct. Jargon is explained. References are unambiguous. | "The system processes data" → "The API processes user requests in real time" |
| Concision | No redundant words or repetition. Ideas are expressed efficiently. | "In the final analysis, ultimately" → "ultimately" |
| Structure | Paragraphs have topic sentences. Ideas flow logically. Transitions are smooth. | Add transition sentence between paragraphs |
| Active Voice | Subjects perform actions. Passive voice is rare and justified. | "Errors were found by the system" → "The system found errors" |
| Specificity | Claims are concrete and supported. Vague words are replaced. | "The feature is good" → "The feature reduces load times by 40%" |
| Technical Accuracy | Technical terms are used correctly. Examples are accurate. Claims are verifiable. | "API endpoint returns status" → "API endpoint returns HTTP 200 on success" |

## Output Format

### Inline Suggestions (Recommended)
Present suggestions directly in the text with before/after examples:

**Original:**
"The system was designed in a way that allows it to handle requests effectively."

**Suggestion (Clarity & Concision):**
"The system was designed to handle requests efficiently." or "The system efficiently handles requests."
*Why: Removes redundancy ("designed in a way that allows it to") and weak verb ("allows it to").*

### Grouped by Severity
Organize feedback by priority:

**Critical (Meaning Changes):**
- Fix claims that are factually incorrect
- Clarify ambiguous references
- Add missing essential context

**Important (Clarity):**
- Remove passive voice
- Simplify complex sentences
- Add specific examples

**Nice to Have (Style):**
- Wordiness reduction
- Tone suggestions
- Preferred phrasing

### Summary Report
Provide a brief summary at the end:

**Overall Assessment:** The piece is well-structured with clear examples. Main improvements: reduce passive voice in Section 2, add context for technical terms in the introduction.

**Strengths:** Logical flow, specific examples, appropriate tone.

**Areas to Revise:** 3 instances of passive voice, 2 undefined technical terms, 1 section that needs better transition.

## Writing Principles

Follow these 10 key principles when reviewing:

1. **Show, don't tell** - Use concrete examples instead of abstract claims. Replace "improved performance" with "reduced query time from 800ms to 120ms."

2. **Active over passive** - Prefer subjects that perform actions. "We analyzed the data" is stronger than "The data was analyzed."

3. **One idea per sentence** - Break complex sentences with multiple ideas into separate sentences. Each sentence should express one clear thought.

4. **Specific over general** - Replace vague words (good, bad, thing, stuff) with specific terms (efficient, broken, parameter, configuration).

5. **Short over long** - Prefer shorter sentences and paragraphs. Break up walls of text. Aim for average sentence length under 15 words.

6. **Concrete over abstract** - Use real examples, numbers, and cases. Help readers visualize what you mean.

7. **Defined terms first** - Introduce technical terms before using them. Define acronyms on first use. Explain domain-specific concepts.

8. **Logical progression** - Start with what readers know. Build to new information. Use clear topic sentences to signal new ideas.

9. **Eliminate redundancy** - Remove words and phrases that repeat earlier points. Avoid saying the same thing in multiple ways.

10. **Preserve voice** - Improve clarity without rewriting personality. Keep the author's style and perspective intact.

## Guardrails

**Preserve voice:** Improve clarity without changing the author's personality, tone, or perspective. You are enhancing, not rewriting.

**Flag tone changes:** If suggesting a major tone shift (formal to casual, optimistic to cautious), flag it as a suggestion for author consideration, not a correction.

**Respect limits:** Never rewrite more than 50% of a section without explicit author approval. If a section needs major restructuring, flag it and explain why rather than rewriting.

**Prefer suggestions over corrections:** Present feedback as options when possible. Suggest improvements rather than declaring something "wrong" when style is involved.

**Know your audience:** Tailor feedback to the intended audience and purpose. A technical white paper has different standards than a blog post.
