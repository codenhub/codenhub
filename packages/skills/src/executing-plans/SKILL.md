---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints.
metadata:
  short-description: Execute implementation plans step by step
---

# Executing Plans

## Overview

Load the plan, confirm documented approval, review it critically, execute all tasks, and report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

Prefer delegated execution via subagents when practical. Use inline execution when subagents are unavailable, the work is too tightly coupled to split cleanly, or the user explicitly prefers inline.

Default git workflow: work on a new branch, make atomic commits as clean milestones land, and open a PR at the end. These are soft defaults; follow repo conventions or explicit user instructions when they differ.

## Tool Compatibility

- Keep instructions tool-agnostic and avoid provider-specific wording.
- When behavior differs across tools, resolve conflicts in this order: OpenCode > Claude Code > Codex CLI > Gemini CLI.

## The Process

### Step 1: Load and Review Plan

1. Read the plan file and any referenced spec.
2. Confirm the plan is documented as `Approved`, and confirm the referenced spec is also documented as `Approved`.
3. If either document is not documented as approved, stop and ask. Only continue without documented approval if the user explicitly tells you to.
4. Review the plan critically and identify any questions or concerns about it.
5. If there are concerns, raise them with the human partner before starting.
6. If there are no concerns, create or update the session plan tracker and proceed.
7. If you are not already on an appropriate working branch, create a new one before implementation unless the repo or user calls for another approach.

### Step 2: Execute Tasks

For each task:

1. Prefer dispatching a fresh subagent with task-local context when practical.
2. Mark it as `in_progress`.
3. Follow each step exactly, whether delegated or inline. The plan should already contain bite-sized steps.
4. Review the resulting artifacts and run verifications as specified.
5. Make an atomic commit when the task or another clean milestone is complete, if the workflow allows it.
6. Mark it as completed.

### Step 3: Complete Development

After all tasks are complete and verified:

- Run the final verification the plan requires.
- Summarize what changed, what was verified, and any open issues.
- Suggest updating the relevant spec and plan docs to reflect the completed work.
- If the user wants you to make those doc updates, do them explicitly. Never assume approval or completion status on your own.
- If the usual git workflow applies, make sure the work stays on its branch and open a PR before closing out.

## When to Stop and Ask for Help

**STOP executing immediately when:**

- You hit a blocker: missing dependency, test fails, instruction unclear.
- The plan has critical gaps preventing a safe start.
- You do not understand an instruction.
- Verification fails repeatedly.

Ask for clarification rather than guessing.

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**

- The partner updates the plan based on your feedback.
- The fundamental approach needs rethinking.

Do not force through blockers. Stop and ask.

## Remember

- Review the plan critically first.
- Check documented approval before starting implementation.
- Follow plan steps exactly.
- Do not skip verifications.
- Stop when blocked, do not guess.
- Never start implementation on `main` or `master` without explicit user consent.

## Integration

Related workflow skills:

- `writing-plans` - creates the plan this skill executes
- `subagent-specialist` - preferred when subagent-based or parallel execution fits the plan
