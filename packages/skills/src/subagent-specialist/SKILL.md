---
name: subagent-specialist
description: Specialist workflow for planning, dispatching, reviewing, and integrating delegated workers. Use when work should be split across fresh workers with isolated context, when an implementation plan contains mostly independent tasks, when 2 or more unrelated bugs or failure clusters can be investigated in parallel, or when you want stronger quality through an implementer plus spec-review plus code-quality-review loop.
---

# Subagent Specialist

## Overview

Use fresh subagents as isolated workers while the main agent stays responsible for decomposition, context curation, coordination, and integration. This skill merges two patterns into one operating guide: structured per-task execution with review gates, and parallel dispatch for independent domains.

## Core Principles

- Default to isolated context. Give each subagent only the task-local context it needs.
- Keep the controller responsible for planning, sequencing, tool strategy, and final integration.
- Use one subagent per task or per independent problem domain.
- Prefer explicit scope, constraints, and deliverables over open-ended prompts.
- Review actual artifacts, not just the subagent's report.
- Preserve the controller's context window for orchestration work.

## Tool Compatibility

- Keep instructions tool-agnostic and avoid provider-specific wording.
- When behavior differs across tools, resolve conflicts in this order: OpenCode > Claude Code > Codex CLI > Gemini CLI.

## Delegation Lifecycle

- Use the host environment's delegation mechanism to start a fresh worker when isolated execution is helpful.
- Prefer isolated, task-local context over copying the full session unless the task genuinely depends on broader context.
- Reuse the same worker for follow-up work only when it already holds the right local context and reuse reduces setup cost.
- Wait for worker results only when the next critical-path step depends on them.
- End or discard workers that are no longer useful, according to the host environment's workflow.
- Respect the host environment's delegation policy. If the environment only allows delegated workers after explicit user permission, do not bypass that rule.
- Adapt to the host's actual capabilities. Do not assume support for background workers, message passing, context forking, or explicit worker shutdown unless the environment provides them.

## Choose the Pattern

Use the structured per-task workflow when:

- you already have a plan or a clearly bounded task list
- tasks can be executed one at a time in the current session
- you want strong quality gates after each implementation step

Use parallel dispatch when:

- 2 or more tasks, failures, or investigations are truly independent
- each workstream can be understood without hidden context from the others
- the agents will not collide on the same files, resources, or unresolved design decisions

Do local exploration first instead of dispatching immediately when:

- the problem is still ambiguous
- failures are probably symptoms of the same root cause
- the work depends on one shared architectural decision that has not been made yet
- multiple agents would compete for the same write scope

## Workflow A: Structured Task Execution

### 1. Prepare Once

- Read the plan once.
- Extract each task's full text, acceptance criteria, dependencies, and scene-setting context.
- Track the tasks in the session plan tracker so the controller, not the subagents, owns the global picture.
- Do not make each subagent rediscover the plan from scratch.

### 2. Dispatch One Implementer

- Give the full task text directly.
- Include architectural context, constraints, working directory, and expected report format.
- Tell the implementer to ask questions before coding if anything is unclear.
- Prefer reusing the same implementer for follow-up fixes if the review loop stays on the same task.

For the prompt structure, read [references/implementer-prompt.md](references/implementer-prompt.md).

### 3. Handle Implementer Status Correctly

Implementers should report one of four statuses:

- `DONE`: Proceed to spec compliance review.
- `DONE_WITH_CONCERNS`: Read the concerns before review. Resolve correctness or scope doubts before moving on.
- `NEEDS_CONTEXT`: Provide the missing information and re-dispatch.
- `BLOCKED`: Change something real before retrying. Add context, break up the task, choose a stronger execution profile, or escalate to the user.

Never ignore a subagent that says it is stuck. If it reported `BLOCKED`, the setup, context, or task shape needs to change.

### 4. Run Spec Compliance Review First

- Verify what was requested against the actual code.
- Check for missing requirements.
- Check for over-building and extra features.
- Check for misunderstandings of the requested behavior.

Do not start code quality review until spec compliance is clear.

For the reviewer template, read [references/spec-reviewer-prompt.md](references/spec-reviewer-prompt.md).

### 5. Run Code Quality Review Second

- Review maintainability, decomposition, test quality, and fit with the codebase.
- Check whether the change created unnecessarily large or tangled files.
- Check whether the implementation followed the intended structure.

For the reviewer template, read [references/code-quality-reviewer-prompt.md](references/code-quality-reviewer-prompt.md).

### 6. Fix and Re-Review in Loops

- If a reviewer finds issues, send the findings back to the implementer.
- Re-run the same review after the fixes land.
- Do not move to the next task while review issues are still open.
- Do not let implementer self-review replace an actual reviewer pass.

### 7. Close the Task Only When Both Gates Pass

- Mark the task complete only after spec compliance and code quality are both clear.
- After all tasks are done, run one final holistic review or verification pass across the full change.

## Workflow B: Parallel Dispatch for Independent Domains

### 1. Group Work by Independent Domain

Good candidates:

- different failing test files with unrelated root causes
- separate subsystems
- bounded implementation slices with disjoint write scopes

Bad candidates:

- failures likely caused by one shared bug
- tasks touching the same core files or the same unresolved design decision
- work that depends on shared mutable state or one ordered sequence of changes

### 2. Give Each Agent One Domain Only

Each parallel prompt should include:

- exact scope
- raw failure evidence or task text
- constraints on what not to change
- expected output

For a reusable template, read [references/parallel-investigator-prompt.md](references/parallel-investigator-prompt.md).

### 3. Dispatch Concurrently

- Run one subagent per independent domain.
- Keep the scopes narrow.
- While the subagents run, continue with non-overlapping controller work instead of waiting by reflex.

### 4. Review and Integrate Carefully

When results come back:

- read each summary
- inspect file overlap or conceptual conflicts
- integrate the changes carefully
- run the combined verification

If the domains turn out not to be independent, stop treating them as parallel work and recombine the investigation.

## Hybrid Pattern

Use parallel dispatch at the top level and the structured review loop inside each workstream when the work is large enough to justify it. A typical example is three unrelated bug clusters investigated in parallel, where each accepted fix still goes through spec review and code quality review before final integration.

## Execution Profile Selection

- Use a lightweight execution profile for mechanical, well-specified tasks touching 1 or 2 files.
- Use a standard execution profile for debugging, integration work, or multi-file implementation.
- Use the strongest available execution profile for architecture, task decomposition, and critical reviews.

Signals that you should increase execution depth:

- ambiguous requirements
- many interacting files
- cross-cutting architectural impact
- repeated failures after a reasonable attempt

## Prompt Construction Rules

- Be specific about scope.
- Paste the relevant task text or failure evidence.
- Provide enough context to avoid blind guessing.
- State constraints explicitly.
- Tell the subagent what to return.
- Prefer raw artifacts over your diagnosis when asking for validation or review.
- Do not leak the intended answer into reviewer prompts.

## Advantages and Costs

Advantages:

- fresh context per task keeps subagents focused
- the controller keeps the big picture instead of drowning in implementation detail
- questions surface early, before the subagent builds the wrong thing
- review gates catch under-building, over-building, and maintainability problems sooner
- parallel investigations can collapse multi-hour debugging into one coordination pass

Costs:

- more setup work from the controller
- more subagent invocations
- more review iterations
- more integration discipline required when multiple workstreams return together

The cost is usually worth paying when the alternative is broad context pollution, slow sequential debugging, or late discovery of quality problems.

## Red Flags

- Do not start implementation on `main` or `master` without explicit user consent.
- Do not skip spec compliance review.
- Do not run code quality review before spec compliance passes.
- Do not move to the next task while review issues are still open.
- Do not tell a subagent to "fix everything."
- Do not dispatch multiple coding subagents against the same write scope unless the integration plan is explicit.
- Do not ignore a subagent that reports `BLOCKED`.
- Do not replace actual review with implementer self-review.
- Do not trust an implementer or reviewer claim without checking the artifacts they produced.

## Reference Templates

Read these only when needed:

- [references/implementer-prompt.md](references/implementer-prompt.md): implementation-worker prompt
- [references/spec-reviewer-prompt.md](references/spec-reviewer-prompt.md): spec-compliance review prompt
- [references/code-quality-reviewer-prompt.md](references/code-quality-reviewer-prompt.md): maintainability and quality review prompt
- [references/parallel-investigator-prompt.md](references/parallel-investigator-prompt.md): focused prompt for independent parallel investigations
