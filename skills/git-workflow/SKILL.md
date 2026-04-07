# Git Workflow Skill

## When to Use This Skill

Use the Git Workflow skill when:
- Starting a new feature or bug fix in a team environment
- Preparing code for code review via pull request
- Merging changes from multiple contributors
- Maintaining a clean, auditable commit history
- Onboarding new team members to git practices
- Enforcing consistent branching and commit standards
- Recovering from git mistakes or merge conflicts
- Ensuring the main branch remains deployable at all times

This skill establishes team norms for version control, enabling parallel work, clear history, and safe integration.

## Branch Naming Convention

Follow this pattern to make branch purpose immediately clear:

```
<type>/<issue-id>-<short-description>
```

### Types
- `feature/` - New capability or enhancement
- `bugfix/` - Bug fix
- `hotfix/` - Urgent production fix
- `refactor/` - Code quality improvement, no behavior change
- `docs/` - Documentation only
- `chore/` - Dependency updates, tooling, config
- `test/` - Test additions or improvements
- `wip/` - Work in progress (communicate via PR description that this is incomplete)

### Examples
- `feature/PROJ-234-user-authentication`
- `bugfix/PROJ-567-fix-race-condition`
- `hotfix/PROJ-890-critical-security-patch`
- `refactor/extract-payment-logic`
- `docs/api-endpoint-guide`

### Rules
- Use lowercase and hyphens (no underscores or spaces)
- Keep total length under 60 characters
- Include ticket/issue ID if your workflow uses them
- Make the short description specific (not "fix-stuff")
- Delete branch after merge to keep repository clean

## Commit Message Format

Follow Conventional Commits format for consistency and automation:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type (required)
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Formatting, missing semicolons, whitespace (no logic change)
- `refactor:` - Code reorganization without feature or fix
- `perf:` - Performance improvement
- `test:` - Adding or updating tests
- `chore:` - Dependency updates, build config, tooling

### Scope (optional)
Specify the area affected in parentheses: `fix(auth):`, `feat(api):`, `docs(readme):`

### Subject (required)
- Use imperative mood: "add" not "added" or "adds"
- Don't capitalize first letter
- No period at end
- Keep under 50 characters
- Be specific about what changed, not why

### Body (optional but recommended for non-trivial commits)
- Wrap at 72 characters
- Explain *why* the change was made, not *what* changed (diff shows what)
- Separate from subject with blank line
- Use bullet points for multiple reasons or side effects

### Footer (optional)
Reference issues or breaking changes:
```
Fixes #234
Closes #567
BREAKING CHANGE: Auth API now requires token in header
Co-Authored-By: Alice <alice@example.com>
```

### Examples

**Simple fix:**
```
fix(login): prevent race condition in session validation
```

**Feature with explanation:**
```
feat(api): add pagination to user list endpoint

Previously, fetching all users was slow for large datasets.
Implement cursor-based pagination with page size limit of 100.
This matches the pattern used in other list endpoints.

Fixes #1234
```

**Breaking change:**
```
refactor(auth): require authentication token in all requests

BREAKING CHANGE: Previously anonymous requests were allowed.
All endpoints now require valid Bearer token in Authorization header.

This improves security by preventing accidental public exposure.
```

## Workflow Steps

### 1. Create and Switch to Feature Branch
```bash
git checkout -b feature/PROJ-123-new-feature
```
- Always branch from `main` (or current development branch)
- Never work directly on `main` or `master`
- Sync with remote before creating: `git fetch origin main`

### 2. Make Focused, Atomic Commits
- Commit logically related changes together
- One commit per logical change (not one per file)
- Each commit should be deployable and pass tests independently
- Avoid "WIP" or "fix typo" commits that clutter history
- Use `git add -p` to stage specific hunks if needed

**Good commit pattern:**
```
git add src/auth/login.ts
git commit -m "feat(auth): add session timeout feature"

git add tests/auth/login.test.ts
git commit -m "test(auth): add session timeout tests"
```

**Poor commit pattern:**
```
git add .
git commit -m "wip"
# Later...
git commit -m "fix typo"
git commit -m "refactor stuff"
```

### 3. Synchronize with Main
Before opening a PR, ensure your branch is up to date:
```bash
git fetch origin
git rebase origin/main
```
If conflicts occur, resolve them and continue the rebase:
```bash
# Fix conflict markers in affected files
git add <resolved-files>
git rebase --continue
```

Never use `git merge` locally; prefer rebase to keep history linear.

### 4. Push to Remote
```bash
git push origin feature/PROJ-123-new-feature
```
First push may require: `git push -u origin feature/PROJ-123-new-feature`

### 5. Open a Pull Request
- Use the branch name as context; write a clear description
- Link to related issues: "Fixes #123"
- Describe what changed and why
- Note any breaking changes, database migrations, or deployment steps
- Request reviewers who understand the code
- Do not merge your own PR without explicit approval

### 6. Address Review Feedback
After reviewers request changes:
- Make additional commits addressing feedback
- Don't force-push during code review (helps reviewers see what changed)
- Push commits: `git push origin feature/PROJ-123-new-feature`
- After approval, rebase and squash if needed (see below)

### 7. Prepare for Merge
If your commits are clean and linear, merge as-is. If review created extra commits:
```bash
git rebase -i origin/main
# Mark commits to squash or fixup
git push --force-with-lease origin feature/PROJ-123-new-feature
```

### 8. Merge to Main
- Use GitHub/GitLab UI to merge (creates merge commit with context)
- Or locally: `git checkout main && git pull && git merge --no-ff feature/PROJ-123-new-feature && git push origin main`
- Delete branch after merge: `git push origin -d feature/PROJ-123-new-feature`

### 9. Clean Up Locally
```bash
git checkout main
git pull origin main
git branch -d feature/PROJ-123-new-feature
```

## Pull Request Checklist

Before marking a PR as ready for review, verify:

- [ ] **Branch is up to date** with `main` (no merge conflicts when rebased)
- [ ] **Commits are atomic and well-described** using Conventional Commits format
- [ ] **Tests pass locally** - run full test suite before pushing
- [ ] **No secrets or credentials committed** - scan for .env, API keys, passwords
- [ ] **Documentation updated** - README, API docs, or inline comments if behavior changed
- [ ] **Code follows team style guide** - formatting, naming, patterns
- [ ] **PR description is clear** - explain what, why, and any gotchas
- [ ] **Issue numbers linked** - "Fixes #123" or "Related to #456"
- [ ] **Breaking changes flagged** - prominently call out incompatibilities
- [ ] **Related PRs noted** - if dependent on other work, mention it
- [ ] **No large unrelated changes** - keep scope focused for easier review

## Guardrails

### Never Force-Push to Main or Master
- These branches are the source of truth
- Force-push rewrites history and breaks other clones
- Always merge via pull request workflow
- If urgent hotfix needed, create a new branch and merge through normal process

### Always Confirm Destructive Operations
Before running these commands, double-check you're on the right branch:
```bash
git reset --hard    # Discards uncommitted changes
git clean -f        # Permanently deletes untracked files
git branch -D       # Force-deletes a branch
```

If unsure, create a backup branch first:
```bash
git branch backup-before-reset
git reset --hard origin/main
```

### Require Explicit Confirmation Before Pushing
- Never push to `main` directly; use pull request workflow
- Require at least one approval before merge
- Use branch protection rules to enforce this in your repository settings
- When pushing, double-check the target: `git push origin feature-branch` not `git push origin main`

### Never Commit Secrets or Credentials
Scan commits before pushing:
- No `.env` files, API keys, or credentials
- No database passwords or private certificates
- Use environment variables and `.gitignore` for sensitive data
- If secrets are accidentally committed, revoke them immediately and use `git filter-branch` or BFG Repo-Cleaner to remove from history

```bash
# Add to .gitignore BEFORE committing sensitive files
echo ".env.local" >> .gitignore
echo "*.key" >> .gitignore
git add .gitignore
git commit -m "chore: add sensitive files to gitignore"
```

### Additional Best Practices

- **Rebase don't merge** - locally, merge via PR UI for cleaner history
- **Review your own PR first** - check the diff for accidental changes
- **Keep PRs small** - easier review, faster merge, easier to revert if issues arise
- **Communicate async** - use PR description and comments, not real-time chat
- **Protect main** - require tests to pass, require review, require status checks
- **Tag releases** - `git tag -a v1.2.3 -m "Release version 1.2.3"` after merging to main
