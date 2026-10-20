---
name: subagent-specialist
description: Coordinates work delegated to subagents, from deciding what to delegate through briefing, review, and integration. Use when a task splits into independent pieces, when several small fixes, type errors, or mechanical edits need doing, when a fully specified, isolated feature or module can be built separately, when exploring or gathering information across a large codebase, when a second review would help, or when the user mentions delegating, subagents, parallelizing, fanning out, or workers.
---

# Subagent Specialist

Split work so each agent holds only the context its task needs. The controller, the agent reading this, plans, briefs, reviews, and decides. Workers execute narrow, well-specified tasks and report back in a fixed format.

## Principles

- **The controller owns the whole.** Planning, sequencing, final decisions, and integration stay with you; preserve your context for them.
- **One complete brief, one run.** A worker gets everything it needs up front, plus at most one retry (see Retries). Never an open-ended conversation.
- **Review artifacts, not reports.** A worker's summary says what it believes it did; the diff says what it did.
- **Use what the environment offers.** Use only the delegation features actually available, such as background workers, messaging, or context forking. When delegation needs the user's permission, ask; never work around it.

## Choose a Path

Take the first that fits:

1. **Inline.** The task is small, tightly coupled, or needs judgment at every step: do it yourself. Delegation has overhead; don't pay it for nothing.
2. **Explore first.** The problem is still ambiguous, several failures probably share one root cause, or the work waits on a design decision nobody has made: investigate locally, or with one information worker, before splitting anything.
3. **Delegate.** The work matches one of the kinds below.

## What to Delegate

Delegate work whose decisions are already made. Keep anything that needs design choices, cross-cutting understanding, taste, or negotiation with the user.

- **Small, located work:** a specific bug or type error in named files, or a described mechanical change across a known set of files. You can state the done-criteria in one or two sentences. Do the locating yourself; the worker starts from "the problem is here", not "find the problem".
- **Isolated implementation:** a larger feature, module, or endpoint, delegated only when all of these hold:
  - **Decisions are made.** You have fixed the interfaces, file layout, names, and error behavior. The worker fills them in; it does not design.
  - **It is isolated.** New files or its own module, so you can list the files it may edit up front.
  - **Acceptance is concrete.** You give a list of cases the result must satisfy, and the worker implements them as tests.

  When a few small decisions are still open, close them and then delegate. Decide what is technical and local yourself; ask the user about anything that changes behavior they would care about. If closing them takes real design work or reaches into other code, the task is not isolated: keep it.

- **Information:** find usages, map a module, summarize how something works, or answer a question about the codebase. The worker edits nothing.
- **Review:** critique a diff or file against criteria you state. The worker edits nothing.

## Plan the Work

- List the tasks and mark which are independent and which depend on another's result.
- Tasks that run at the same time never touch the same files, resources, or unresolved decision. Name new files explicitly, so two workers do not create the same one.
- Run a task that depends on another's change after that change lands.
- Track the tasks yourself, so no worker has to rediscover the plan.

Good candidates for parallel work are failing test files with unrelated causes, separate subsystems, and implementation slices with disjoint files. If the domains turn out not to be independent, stop treating them as parallel and recombine the work.

## Write the Brief

A worker knows only what the brief says. Write it for a capable engineer who has never seen this codebase and cannot ask questions. Paste the task text and raw evidence, such as failing output or logs, instead of your diagnosis of them. Include only the sections that apply, and never leave a placeholder in:

- **Goal:** one or two sentences on what must be true when the worker is done.
- **Context:** what you already found: where the problem or feature lives, the cause if known, relevant functions and types by name. Mark any guess as one.
- **Decisions:** for implementation, everything the worker must follow: signatures, names, file layout, error handling, and allowed dependencies, normally none new.
- **Acceptance:** concrete, checkable cases. For implementation, each becomes a test.
- **Files:** the files it may edit, and the files it should read but not edit.
- **Question:** for information work, what to find out and the form of the answer.
- **Review criteria:** for review work, what to judge against: the original acceptance list, conventions, specific risks. Do not leak the answer you expect.
- **Out of scope:** nearby things the worker might be tempted to touch.
- **Report:** the format to return. Implementation workers report one of `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.

For full prompt templates, read [references/implementer-prompt.md](references/implementer-prompt.md) for implementation and [references/parallel-investigator-prompt.md](references/parallel-investigator-prompt.md) for one domain worked in parallel with others.

## Handle the Status

- `DONE`: review it.
- `DONE_WITH_CONCERNS`: read the concerns first, and resolve doubts about correctness or scope before review.
- `NEEDS_CONTEXT`: answer the questions and send the worker on. The first round of answers does not count as a retry; a second `NEEDS_CONTEXT` on the same task does, and usually means the task is not ready to delegate.
- `BLOCKED`: change something real before retrying: add context, split the task, use a stronger model, or escalate to the user. A worker that says it is stuck is never ignored.

## Review

Read the diff, not the summary. Passing checks is necessary, not sufficient. Reject or fix a result when any of these fail:

1. **It solves the stated goal**, not a neighbouring one. Compare it against the goal and acceptance, case by case.
2. **Nothing is gamed:** no weakened types, ignore directives, disabled rules, skipped or loosened tests, special-casing of test inputs, or swallowed errors.
3. **Tests test the behavior.** They would fail without the change and cover every acceptance case. A test that restates the implementation does not count.
4. **It stays within the brief's decisions:** signatures, names, layout, and error behavior exactly as specified.
5. **It reads like the codebase:** surrounding style and patterns, no leftover debugging, no dead code.
6. **No unrequested changes** are hidden in the files it touched: renames, reformatting, reordered imports, or cleanups.

Match the reviewers to the risk. Review a mechanical, fully specified change to one or two files that tests cover yourself, against the list above. For any other implementation, run a spec-compliance reviewer, then a code-quality reviewer once spec compliance is clear; each starts without context, so two reviewers on a trivial task cost more than the task did. When workers can run on other models, give the reviewers a model from a different family than the implementer's. Read [references/spec-reviewer-prompt.md](references/spec-reviewer-prompt.md) and [references/code-quality-reviewer-prompt.md](references/code-quality-reviewer-prompt.md) for their prompts.

Small issues of naming or style are not a reason to reject: accept the result and fix them yourself if they matter. A reason to reject is anything you would not accept from a person in code review.

## Retries

One retry per task, in total: a follow-up or a rebrief.

- **Follow-up:** send the findings to the same worker when the result is nearly right, the remaining issue is small and local, and its context makes that cheaper than a fresh run.
- **Rebrief:** start a fresh worker with a better brief, on a stronger model when one is available.

After the retry, finish the remaining work yourself, drop the task, or ask the user. Re-run the review after every fix, whoever made it.

## Integrate

- Close a task only after its review passes.
- After accepting more than one editing result, run the project's full checks once in the real working tree. Each worker's checks proved its change in isolation, not the combination.
- When integration fails, back out results one at a time to find the conflict, or fix it yourself.
- After all tasks are done, run one final review or verification pass across the whole change.

## Delegated Audits and Reviews

When the work is an audit or review the user asked for, split it by area, not by question:

- Give every worker its area and the same evidence standard and classification, verbatim.
- Before reporting, merge duplicates and resolve every contradiction between workers: re-check the case and report one answer, or one question when it cannot be settled.
- Report one verdict for the whole target, not one per worker.

## Model Selection

When workers can run on different models:

- Use a fast, inexpensive model for information work and for mechanical, located edits.
- Use a standard model for isolated implementation, debugging, integration work, and reviews.
- Use the strongest available model for architecture, task decomposition, critical reviews, and a rebrief after a failed attempt.

Move a task up when its requirements are ambiguous, it spans many interacting files, it has cross-cutting impact, or an earlier attempt failed. Move it down only for purely mechanical work. When the user names a model for some work, use it for that work; reviews of that work still come from another family when one is available.

## Context Discipline

- Keep your context for the plan and the results. Do not read worker transcripts or the files a worker changed unless you are reviewing them.
- Keep from each result only what the next decision needs.
- Wait for a worker only when the next step on the critical path needs its result; meanwhile, do controller work that does not overlap it. Stop workers that are no longer useful.
- Do not launch more workers than you can review.

## Hard Rules

- **No traces in the repository.** No briefs, logs, agent notes, memory files, or markers. Workers add nothing that identifies agent work, such as comments, TODOs, or trailers about it, beyond what the project's conventions require. Changes read as if a person made them.
- **The project's own docs, tests, and conventions are the source of truth.** A worker's claim never overrides them, and no worker creates documentation aimed at agents.
- **Workers never commit, push, install dependencies, or change configuration** outside the files they may edit. When one of those is needed, do it yourself under the user's normal approval.
- **No secrets in briefs.** Never paste keys, tokens, or environment files.
- **Out-of-scope observations are reported, not acted on.** You decide whether they become new tasks or get mentioned to the user; they are never written into the repository as reminders.

## Red Flags

Stop and correct course on any of these:

- Delegating a task whose design is still open, or telling a worker to "fix everything" instead of naming the scope.
- Running workers in parallel on the same files without an integration plan.
- Running code-quality review before spec compliance is clear.
- Accepting a worker's or reviewer's claim without checking the artifacts.
- A third attempt at the same task by a worker.
