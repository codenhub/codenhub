---
name: writing-specs
description: Use after brainstorming or other design work to write a validated feature spec or design document before implementation planning.
metadata:
  short-description: Write validated specs before planning
---

# Writing Specs

## Overview

Write the validated design as a complete spec, review it for planning readiness, and get user approval before moving on to implementation planning.

**Announce at start:** "I'm using the writing-specs skill to write the spec."

## Tool Compatibility

- Keep instructions tool-agnostic and avoid provider-specific wording.
- When behavior differs across tools, resolve conflicts in this order: OpenCode > Claude Code > Codex CLI > Gemini CLI.

## Save Specs To

- Prefer `.docs/specs/NNNN--short-kebab-title.md` (for example `.docs/specs/0001--design-auth-session-lifecycle.md`).
- Before choosing the path, inspect the project for an existing structure and respect it if one is already in use, for example `docs/superpowers/specs/`, `.docs/specs/`, or another documented path.
- User preferences for spec location override this default.

## Status

- Every spec must include `**Status:** Draft` near the top.
- Valid statuses for spec and plan docs are `Draft`, `Approved`, `In Progress`, and `Implemented`.

## What the Spec Must Do

- Capture the validated design, not a fresh brainstorming pass.
- Start in `Draft` status.
- Cover the design clearly enough that engineers can plan and implement it without guessing.
- Cover architecture, components, data flow, error handling, and testing.
- If the project is too large for a single implementation plan, split it into sub-project specs instead of forcing everything into one document.

## The Process

1. Write the validated design to the spec file and set its status to `Draft`.
2. Commit the design document to git if the workflow calls for committing planning artifacts.
3. Run the spec self-review loop.
4. Ask the user to review the written spec before proceeding.
5. Never mark the spec `Approved` on your own. The user must update it, or you may update it only if they explicitly ask you to.
6. Only after the spec is documented as `Approved`, proceed to implementation planning unless the user explicitly asks to proceed without documented approval.

## Spec Self-Review

After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review, just fix and move on.

## User Review Gate

After the spec review loop passes, ask the user to review the written spec before proceeding:

> "Spec written and saved to `[SPEC_FILE_PATH]` with status `Draft`. Please review it and let me know if you want any changes, or if you want me to update the status to `Approved`."

Wait for the user's response. If they request changes, make them and re-run the spec review loop. If they approve in chat but the document is still `Draft`, ask whether they want to update it themselves or want you to update it. Only proceed once the document says `Approved`, unless the user explicitly instructs you to continue without documented approval.

## Implementation Planning

- If the user asks for planning support, you may invoke `writing-plans` to create a detailed implementation plan.
- Follow repo conventions and user workflow for planning and implementation handoff.
- Do NOT invoke `writing-plans` or any implementation skill before the written spec is documented as `Approved`, unless the user explicitly instructs otherwise.
