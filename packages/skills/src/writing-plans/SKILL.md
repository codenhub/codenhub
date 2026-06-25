---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code.
metadata:
  short-description: Build complete implementation plans
---

# Writing Plans

## Overview

Write implementation-ready plans for a low-context engineer. Document the file map, task sequence, relevant docs, constraints, and verification needed to execute safely without guessing. Keep the plan concrete, but do not pre-write the full implementation unless the shape is fragile or non-obvious. Prefer plans that assume delegated execution via subagents when practical. DRY. YAGNI. TDD. Use frequent, atomic commits when the workflow calls for them.

Assume they are a skilled developer, but know almost nothing about the toolset or problem domain.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** In planning context, include implementation workflow guidance when useful (often: new branch or isolated worktree, atomic commits, and a PR at the end). If repo conventions or explicit user instructions call for another approach, follow that instead.

## Tool Compatibility

- Keep instructions tool-agnostic and avoid provider-specific wording.
- When behavior differs across tools, resolve conflicts in this order: OpenCode > Claude Code > Codex CLI > Gemini CLI.

## Save Plans To

- Prefer `docs/plans/NNNN--kebab-case-plan-name.md` (for example, `docs/plans/0001--add-bulk-export-plan.md`).
- Before choosing the path, inspect the project for an existing structure and respect it if one is already in use, for example `docs/superpowers/plans/`, `docs/plans/`, or another documented path.
- User preferences for plan location override this default.

## Status

- Every plan must include `**Status:** Draft` near the top.
- Valid statuses for spec and plan docs are `Draft`, `Approved`, `In Progress`, and `Implemented`.

## Approval Gate

- Prefer writing plans from a spec documented as `Approved`.
- If no approved spec is available, write from explicit user-provided requirements when the user asks you to proceed.
- Never mark a spec or plan `Approved` on your own. The user must update it, or you may update it only if they explicitly ask you to.

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it was not, suggest breaking this into separate plans, one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, do not unilaterally restructure, but if a file you are modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Bite-Sized Task Granularity

**Each task should be a coherent, verifiable unit of work:**

- Split into smaller steps only when sequencing, validation, or rollback boundaries are fragile.
- Keep tightly coupled work together instead of exploding it into artificial micro-steps.
- Include commit guidance only when the workflow or user explicitly calls for it, or when a milestone boundary matters.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

**Status:** Draft

> **For agentic workers:** Optional sub-skill: use `executing-plans` to implement this plan task-by-task when delegated execution is preferred.
> Delegated and inline execution are both valid. When useful, default git flow is a new branch, atomic commits, and a PR at the end unless repo conventions or explicit user instructions say otherwise.

**Goal:** [One sentence describing what this builds]
**Architecture:** [2-3 sentences about approach]
**Tech Stack:** [Key technologies/libraries]

---
```

Steps use checkbox (`- [ ]`) syntax for tracking.

## Task Structure

```markdown
### Task N: [Component Name]

**Goal:** [What this task completes]

**Files:**

- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py`
- Test: `tests/exact/path/to/test.py`

- [ ] **Implement the task**

Implementation notes:

- [Key behavior, interfaces, constraints, and patterns to follow]
- [Reference an earlier helper or task when relevant, and restate what changes]

- [ ] **Verify the task**

Run: `pytest tests/path/test.py -v`
Expected: PASS
```

## No Placeholders

Every step must contain the actual content an engineer needs.

These are **plan failures** and must never appear:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" without stating what behavior to verify and how to run it
- "Similar to Task N" or "same as above" without pointing to the earlier task or helper and stating what changes
- Steps that describe what to do without giving enough detail to execute safely
- References to types, functions, or methods not defined anywhere in the plan or spec

## Remember

- Prefer exact file paths when known. If they are not yet certain, identify the owning area and the discovery needed before editing.
- Make the plan concrete enough to execute without guesswork. Include exact code only when interface shape, migrations, commands, or test structure are non-obvious.
- Exact commands with expected output when verification matters
- DRY, YAGNI, TDD, and milestone-based commit guidance when the workflow calls for it

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it.

This is a checklist you run yourself, not a subagent dispatch.

1. **Spec coverage:** Skim each section and requirement in the spec. Can you point to a task that implements it? List any gaps.
2. **Placeholder scan:** Search your plan for red flags, any of the patterns from the "No Placeholders" section above. Fix them.
3. **Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review, just fix and move on. If you find a spec requirement with no task, add the task.

## User Review Gate

After saving the plan and completing self-review, ask the user to review it before execution.

If they approve in chat but the document is still `Draft`, ask whether they want to update it themselves or want you to update it.

Only hand off to `executing-plans` once the plan document says `Approved`, unless the user explicitly instructs you to execute without documented approval.

## Execution Handoff

After the plan is documented as `Approved`, offer execution choice:

\*\*"Plan complete and saved to `[PLAN_FILE_PATH]` with status `Approved`.

Two execution options:

1. Delegated execution
   - Default when subagents are available and the tasks can be split cleanly
   - Use `executing-plans` with fresh workers per task or independent workstream
2. Inline execution
   - Use when the work is tightly coupled, subagents are unavailable, or you explicitly prefer inline
   - Follow the same plan and verification steps in this session

Default implementation workflow is a new branch, atomic commits, and a PR at the end unless repo conventions or your instructions say otherwise.

Which approach?"\*\*
