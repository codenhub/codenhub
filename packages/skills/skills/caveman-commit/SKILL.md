---
name: caveman-commit
description: Writes terse commit messages in the project's convention that keep intent and reasoning without noise. Use when the user says "write a commit", "commit message", or "generate commit", or when changes are staged for a commit.
---

Write commit messages terse and exact. Conventional Commits format, unless `git log` shows the project uses another convention; then match it. No fluff. Why over what.

## Rules

**Subject line:**

- `<type>(<scope>): <imperative summary>` — `<scope>` optional
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Imperative mood: "add", "fix", "remove" — not "added", "adds", "adding"
- ≤50 chars when possible, hard cap 72
- No trailing period
- Match project convention for capitalization after the colon
- Use `git log` to see recent commits and match style

**Body (only if needed):**

- Skip entirely when subject is self-explanatory
- Add body only for: non-obvious _why_, breaking changes, security fixes, data migrations, reverts, linked issues
- Wrap at 72 chars
- Bullets `-` not `*`
- Reference issues/PRs at end: `Closes #42`, `Refs: #17`

**Trailers:**

- Keep every trailer the project or workflow uses, such as `Skipped:`, `Co-authored-by:`, or `Refs:`, even when the subject alone would do. Tools read them from the log
- Put them in the final paragraph, after a blank line

**Leave out:**

- "This commit does X", "I", "we", "now", "currently" — the diff says what
- "As requested by..." — the requester is not an author; leave it out
- "Generated with ..." lines or other tool promotion. Add a `Co-authored-by` trailer only when the project or workflow requires one, in its format.
- Emoji (unless project convention requires)
- Restating the file name when scope already says it

## Examples

Diff: new endpoint for user profile with body explaining the why

- ❌ "feat: add a new endpoint to get user profile information from the database"
- ✅

  ```
  feat(api): add GET /users/:id/profile

  Mobile client needs profile data without the full user payload
  to reduce LTE bandwidth on cold-launch screens.

  Closes #128
  ```

Diff: breaking API change

- ✅

  ```
  feat(api)!: rename /v1/orders to /v1/checkout

  BREAKING CHANGE: clients on /v1/orders must migrate to /v1/checkout
  before 2026-06-01. Old route returns 410 after that date.
  ```

## Auto-Clarity

Always include body for: breaking changes, security fixes, data migrations, anything reverting a prior commit. Never compress these into subject-only — future debuggers need the context.

## Boundaries

Write the message. Stage, commit, or amend only when the user asked for that; otherwise output the message as a code block ready to paste.
