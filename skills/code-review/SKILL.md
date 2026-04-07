# Code Review Skill

## When to Use This Skill

Use the Code Review skill when:
- A pull request needs comprehensive evaluation before merging
- You're auditing code changes for security vulnerabilities, performance issues, or maintainability concerns
- A team wants consistent, structured feedback on code quality
- You need to verify compliance with coding standards and best practices
- Mentoring junior developers and providing detailed, constructive feedback
- Assessing third-party contributions or integrations

This skill is ideal for catching issues early before they reach production and for knowledge sharing across teams.

## Review Process

1. **Establish Context** - Understand the PR's purpose, the issue it solves, and the scope of changes. Read the PR description, linked issues, and acceptance criteria.

2. **Scan the Diff** - Review the overall structure of changes. Identify new files, deleted files, and major refactors. Get a bird's-eye view before diving into details.

3. **Assess Correctness** - Trace through logic paths, verify algorithm correctness, check for off-by-one errors, validate state transitions, and confirm edge cases are handled.

4. **Evaluate Security** - Check for injection vulnerabilities, authentication/authorization flaws, secret leakage, unsafe dependencies, and improper input validation. This takes priority over other concerns.

5. **Analyze Performance** - Identify N+1 queries, unnecessary loops, memory leaks, inefficient data structures, and algorithmic complexity issues. Consider impact on scalability.

6. **Review Maintainability** - Assess code clarity, naming conventions, documentation, test coverage, and adherence to architectural patterns. Check for unnecessary complexity or over-engineering.

7. **Verify Tests** - Confirm test coverage for new code, validate test quality, check for flaky or brittle tests, and ensure edge cases are covered.

8. **Compile Feedback** - Organize findings by severity and category. Provide actionable, specific suggestions with examples where possible. Balance criticism with recognition of good work.

9. **Recommend Action** - Suggest approval, conditional approval (with required changes), or request major revisions based on severity and number of issues.

## Severity Classification

| Severity | Definition | Examples | Action |
|----------|-----------|----------|--------|
| **CRITICAL** | Causes production outages, security breaches, or data loss | SQL injection, authentication bypass, unhandled exception in payment code, hardcoded credentials, infinite loop | Must fix before merge |
| **HIGH** | Significant functional or security issues; affects reliability or user experience | Incorrect business logic, race condition, privilege escalation, unvalidated user input, missing error handling on critical path | Should fix before merge |
| **MEDIUM** | Code quality or minor functionality concerns; impacts maintainability or performance | Inefficient query, unclear naming, missing docstring, N+1 database access, unnecessary complexity | Fix in follow-up or address before merge |
| **LOW** | Style, convention, or minor improvement suggestions | Inconsistent formatting, redundant variable, minor documentation improvement, naming preference | Nice to have; can defer |

## Review Checklist

### Correctness
- [ ] Logic is correct and handles all documented cases
- [ ] Edge cases are explicitly handled (empty inputs, null values, boundary conditions)
- [ ] State transitions are valid and consistent
- [ ] Off-by-one errors are absent
- [ ] Algorithm complexity is appropriate for the use case
- [ ] No infinite loops or deadlock potential

### Security
- [ ] No hardcoded secrets, credentials, or API keys
- [ ] User input is validated and sanitized
- [ ] SQL queries are parameterized to prevent injection
- [ ] Authentication and authorization checks are present and correct
- [ ] No use of weak cryptography or outdated libraries
- [ ] Error messages don't leak sensitive information
- [ ] CORS, CSRF, and other web security concerns addressed

### Performance
- [ ] No N+1 query patterns (database or API)
- [ ] Appropriate use of caching where beneficial
- [ ] Algorithmic complexity is acceptable (no unnecessary O(n²) or worse)
- [ ] Memory usage is reasonable; no obvious leaks
- [ ] Bulk operations used instead of loops where applicable
- [ ] Database indexes considered for new queries

### Maintainability
- [ ] Code is clear and easy to understand
- [ ] Variable and function names are descriptive
- [ ] Complex logic has explanatory comments
- [ ] DRY principle followed; minimal duplication
- [ ] Architectural patterns are consistent with codebase
- [ ] No premature optimization or over-engineering
- [ ] Public APIs documented with examples

### Tests
- [ ] New code paths have test coverage
- [ ] Tests are clear and focus on one concern each
- [ ] Edge cases and error paths are tested
- [ ] No test-specific hacks or brittle assertions
- [ ] Tests are deterministic and not flaky
- [ ] Integration tests validate contracts with external systems

## Output Format

Structure code review feedback as follows:

```
## Summary
[1-2 sentence overview of the review: approve, conditional, or major revisions needed]

## Critical Issues
[List any CRITICAL severity findings that must be addressed]

## High Priority Issues
[List HIGH severity findings with specific line references and suggested fixes]

## Medium Priority Suggestions
[List MEDIUM severity observations with improvement ideas]

## Low Priority Observations
[Nice-to-have suggestions for style or consistency]

## Strengths
[Positive observations: what was done well, elegant solutions, good patterns]

## Recommendation
[APPROVED | APPROVED WITH MINOR CHANGES | REQUEST CHANGES | REQUEST MAJOR REVISIONS]
```

Always include specific line numbers, code snippets, and actionable suggestions. Explain the "why" behind each comment, not just the "what."

## Guardrails

1. **Never modify code without explicit user confirmation** - Your role is to provide feedback, not to rewrite. Suggest changes; don't impose them.

2. **Flag security issues at CRITICAL severity immediately** - Do not continue the review in standard order if a critical vulnerability is discovered. Highlight it prominently and recommend the fix before other concerns.

3. **Do not approve PRs with unresolved CRITICAL or HIGH issues** - Even if only one issue exists, conditional or major revision recommendation is appropriate.

4. **Provide constructive, respectful feedback** - Critique the code, not the author. Use language like "This could be simplified by..." rather than "You did this wrong."

5. **Consider context and conventions** - Review against the team's established patterns, not arbitrary style preferences. A consistent "wrong" is better than inconsistent correctness.

6. **Avoid scope creep in suggestions** - Don't request refactors of adjacent code unless it directly impacts understanding the current PR.

7. **Distinguish must-fix from nice-to-have** - Use severity levels consistently. Not everything requires action before merge.
