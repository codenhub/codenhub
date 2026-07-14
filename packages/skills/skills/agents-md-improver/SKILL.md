---
name: agents-md-improver
description: Audit and improve AGENTS.md files in repositories. Use when the user asks to check, audit, update, improve, or fix AGENTS.md files. Evaluate the target file against a quality rubric, output a report, then make targeted updates after approval.
metadata:
  short-description: Audit and improve AGENTS.md files
---

# AGENTS.md Improver

Audit, evaluate, and improve `AGENTS.md` files across a codebase so future
agent sessions have better project guidance.

This skill can update `AGENTS.md` files. After presenting a quality report and
getting user approval, it makes targeted improvements.

## Tool Compatibility

- Keep instructions tool-agnostic and avoid provider-specific wording.
- When behavior differs across tools, resolve conflicts in this order: OpenCode > Claude Code > Codex CLI > Gemini CLI.

## Workflow

### Phase 1: Discovery

Determine the target file before auditing anything:

1. If the user explicitly names a file, use that file as the primary target.
2. Otherwise, search for `AGENTS.md` files and default to the project root
   `AGENTS.md` when it exists.
3. Only inspect related instruction files such as `AGENTS_LONG.md` when the
   user asks for them or they are necessary to explain the target file.

Use the host environment's file search capability instead of assuming shell
commands like `find` are available.

**File Types & Locations:**

| Type             | Location                    | Purpose                                  |
| ---------------- | --------------------------- | ---------------------------------------- |
| Explicit target  | User-provided path          | Highest-priority file to audit           |
| Project root     | `./AGENTS.md`               | Primary shared project instructions      |
| Package-specific | `./packages/*/AGENTS.md`    | Module-level guidance in monorepos       |
| Subdirectory     | Any nested location         | Feature or domain-specific instructions  |
| Related guides   | `AGENTS_LONG.md` or similar | Supplemental context only when requested |

### Phase 2: Quality Assessment

For each target `AGENTS.md` file, evaluate against the quality criteria. See
[references/quality-criteria.md](references/quality-criteria.md) for detailed
rubrics.

**Quick Assessment Checklist:**

| Criterion                         | Weight | Check                                                           |
| --------------------------------- | ------ | --------------------------------------------------------------- |
| Commands and workflows documented | High   | Are build, test, lint, and common operations present?           |
| Architecture clarity              | High   | Can the agent understand the codebase structure and boundaries? |
| Non-obvious patterns              | Medium | Are gotchas, quirks, and exceptions documented?                 |
| Conciseness                       | Medium | Is the file dense and useful instead of verbose?                |
| Currency                          | High   | Does it reflect the current codebase state?                     |
| Actionability                     | High   | Are instructions concrete and executable?                       |

**Quality Scores:**

- **A (90-100)**: Comprehensive, current, actionable
- **B (70-89)**: Good coverage, minor gaps
- **C (50-69)**: Basic info, missing key sections
- **D (30-49)**: Sparse or outdated
- **F (0-29)**: Missing or severely outdated

### Phase 3: Quality Report Output

Always output the quality report before making any updates.

Format:

```text
## AGENTS.md Quality Report

### Summary
- Files found: X
- Average score: X/100
- Files needing update: X

### File-by-File Assessment

#### 1. ./AGENTS.md (Project Root)
**Score: XX/100 (Grade: X)**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Commands and workflows | X/20 | ... |
| Architecture clarity | X/20 | ... |
| Non-obvious patterns | X/15 | ... |
| Conciseness | X/15 | ... |
| Currency | X/15 | ... |
| Actionability | X/15 | ... |

**Issues:**
- [List specific problems]

**Recommended additions:**
- [List what should be added]

#### 2. ./packages/api/AGENTS.md (Package-specific)
...
```

### Phase 4: Targeted Updates

After outputting the quality report, ask the user for confirmation before
updating anything.

**Update Guidelines (Critical):**

1. Propose targeted additions only. Focus on genuinely useful information:
   - commands or workflows discovered during analysis
   - gotchas or non-obvious patterns found in code
   - package relationships that were not clear
   - testing approaches that work
   - configuration quirks

2. Keep it minimal. Avoid:
   - restating what is obvious from the code
   - generic best practices already covered elsewhere
   - one-off fixes unlikely to recur
   - verbose explanations when a one-liner will do

3. Show diffs. For each change, show:
   - which `AGENTS.md` file to update
   - the specific addition as a diff or quoted block
   - a brief explanation of why this helps future sessions

**Diff Format:**

`````markdown
### Update: ./AGENTS.md

**Why:** The build command was missing, which makes it harder for future
sessions to get started quickly.

````diff
+## Quick Start
+
+```bash
+npm install
+npm run dev  # Start development server
+```
````
`````

### Phase 5: Apply Updates

After user approval, apply changes using the host environment's editing
capability. Preserve the existing content structure unless restructuring is part
of the approved improvement.

## Templates

See [references/templates.md](references/templates.md) for `AGENTS.md`
templates by project type.

## Common Issues to Flag

1. Stale commands: documented commands no longer work
2. Missing dependencies: required tools or setup not mentioned
3. Outdated architecture: directory structure or key files have changed
4. Missing environment setup: required variables or configuration are absent
5. Broken test commands: test scripts or workflows have changed
6. Undocumented gotchas: non-obvious patterns are not captured
7. Generic filler: the file contains broad advice instead of project-specific guidance

## User Tips to Share

When presenting recommendations, remind users:

- Keep `AGENTS.md` concise and human-readable. Dense is better than verbose.
- Prefer commands that are copy-paste ready.
- Document project-specific patterns and gotchas, not generic engineering advice.
- Separate shared project instructions from personal preferences when the host workflow supports it.
- Revisit `AGENTS.md` after important workflow or architecture changes so it stays current.

## What Makes a Great AGENTS.md

**Key principles:**

- Concise and human-readable
- Actionable commands that can be copy-pasted
- Project-specific patterns, not generic advice
- Non-obvious gotchas and warnings
- Current guidance that matches the repository as it exists today

**Recommended sections** (use only what is relevant):

- Commands (build, test, dev, lint)
- Architecture (directory structure)
- Key Files (entry points, config)
- Code Style (project conventions)
- Environment (required vars, setup)
- Testing (commands, patterns)
- Gotchas (quirks, common mistakes)
- Workflow (when to do what)

## Failure Modes To Handle

- If no target file exists, say so clearly and ask whether to create one or use a
  different file.
- If several candidate files exist, explain the candidates and anchor the audit
  to the user-requested file or the root `AGENTS.md` by default.
- If a recommendation cannot be verified from the repository, label it as
  uncertain instead of stating it as fact.
- If the file is already high quality, say so explicitly and avoid editing for
  the sake of editing.
