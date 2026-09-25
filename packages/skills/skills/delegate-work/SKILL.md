---
name: delegate-work
description: Split coding work across subagents and delegate focused tasks to worker agents, including cheaper or different models through external CLI harnesses. Use whenever a task can be broken into independent pieces, when several small fixes, lint/type errors, or mechanical edits need doing, when a well-specified, isolated feature or module can be implemented separately, when exploring or gathering information across a large codebase, when a second opinion or review from another model would help, or when the user mentions delegating, subagents, parallelizing, fanning out, workers, cheaper models, saving quota, or usage limits — even if they don't name this skill.
---

# Delegate work

Split work so each agent holds only the context its task needs. The orchestrator
(the agent reading this) plans, briefs, reviews and decides. Workers execute
narrow, well-specified tasks and report back in a fixed, compact format.

## Principles

1. **Native first.** Prefer the current harness's own subagent mechanism. External
   dispatch is a fallback with a specific reason, never the default.
2. **No footprint.** Nothing about this process may appear in the repository.
   See [Hard rules](#hard-rules).
3. **One shot.** A worker gets one complete brief and one run. Wrong result →
   better brief and a fresh run, not a conversation.
4. **Code enforces, the orchestrator judges.** Scope, timeouts, isolation,
   checks, model choice and fallback are handled by `scripts/dispatch.mjs`. The
   orchestrator decides what to delegate, writes briefs, and reviews results.

## Choose a path

Walk these in order and stop at the first that fits.

1. **Inline.** The task is small, tightly coupled, or needs judgment at every
   step → do it yourself. Delegation has overhead; don't pay it for nothing.
2. **Native subagents.** The harness provides subagents (or equivalent task
   tools) and they can run a suitable model → use them. Apply the same brief
   discipline described below; skip `dispatch`.
3. **External dispatch.** Use only when at least one is true:
   - the harness has no native subagents;
   - native subagents would spend scarce quota on work a cheaper model can do;
   - a different model family is wanted (diversity, second opinion, review);
   - the user asked for it.

If external dispatch fails for environmental reasons (`not_available`,
`harness_error` with no fallback left), fall back to path 2 or 1 and tell the
user once.

## What to delegate

Delegate work whose decisions are already made. Keep for yourself anything that
needs design choices, cross-cutting understanding, taste, or negotiation with
the user.

**Small, located work** (`fixer`): a specific bug or type error in named files,
a described mechanical change across a known set of files. You must be able to
state the done-criteria in one or two sentences. Do the locating yourself —
workers should start from "the problem is here", not "find the problem".

**Isolated implementation** (`builder`): a feature, module or endpoint that is
larger but fully specified. Delegate only when **all** hold:

- **Decisions are made.** You have fixed the interfaces, file layout, names, and
  error behavior. The builder fills them in; it does not design.
- **It is isolated.** New files or its own module; the allowlist can be written
  up front.
- **Acceptance is concrete.** You provide a list of cases the result must
  satisfy. The builder must implement them as tests.

If a task is isolated and verifiable but a few small decisions are still open,
close them and then delegate; don't implement it yourself just because the
brief wasn't ready yet. Decide what is technical and local yourself; ask the
user about anything that changes behavior they would care about. If closing
the open decisions takes real design work or reaches into other code, the task
isn't isolated after all: keep it.

**Information** (`scout`): find usages, map a module, summarize how something
works, answer a question about the codebase.

**Review** (`reviewer`): critique a diff or file against stated criteria.

When native subagents are cheap, `builder` work is where they pay off most:
the more judgment a task carries, the more model quality matters.

## Roles and tiers

| Role       | Edits | Default tier | Use for                                     |
|------------|-------|--------------|---------------------------------------------|
| `scout`    | no    | `light`      | reading, searching, summarizing             |
| `fixer`    | yes   | `light`      | small, located edits                        |
| `builder`  | yes   | `standard`   | isolated, fully specified implementation    |
| `reviewer` | no    | `standard`   | critique against given criteria             |

You never pick a model. You describe the task; configuration maps it to models.

- **Tier** (`--tier light|standard|strong`) — override the role default only
  with a reason: go up when the task has tricky logic or earlier attempts
  failed; go down for purely mechanical work.
- **Kind** (`--kind code|ui|text`, default `code`) — set it only when the task is
  plainly UI/styling or plainly prose (comments, docs, messages). Has no effect
  unless configuration defines models for that kind.
- **Context size** is estimated by `dispatch` from the brief and the files the
  worker may touch or read. Don't try to account for it.
- **`--model`** — only when the user explicitly names a model.

If the best choice for a task is a model you can already run as a native
subagent, `dispatch` returns `use_native` with the model to use instead of
running anything. Follow it. Pass `--external` only when the user explicitly
asks for an external run.

## Workflow (external dispatch)

1. **Plan.** List the tasks. Mark which are independent (parallel) and which
   depend on others (sequential). Tasks in the same batch must not touch the
   same files.
2. **Brief.** Fill in `references/brief-template.md` for each task. Every
   editing brief must name the files it may touch (`--allow`). Files the worker
   should read but not edit go in `--read`. Pass briefs through stdin or a
   temporary path outside the repository.
3. **Dispatch.**
   ```
   node scripts/dispatch.mjs run --role fixer --allow "src/validation.ts" --brief -
   node scripts/dispatch.mjs run --role builder --allow "src/rates/**" --read "src/types.ts" --brief -
   node scripts/dispatch.mjs run --batch <batch.json>
   ```
   Workers start from the current working tree, including uncommitted changes.
   Isolation defaults to `auto`: read-only roles and a single editing worker run
   in place; parallel editing workers each get an isolated copy. In place, the
   change is already in your tree: `apply` keeps it, `discard` restores the
   allowed files. Don't edit a running worker's allowed files.
4. **Read the result.** Each run returns one JSON result, specified in
   `references/result-format.md`. Read the result, not the log. Open `logPath`
   only to diagnose a failure you can't explain from the result.
5. **Review.** For `ok` results from editing roles, check the diff against
   `references/review-checklist.md`. Passing checks is necessary, not
   sufficient. For a nontrivial `builder` result, also get a cross-model review
   before applying:
   ```
   node scripts/dispatch.mjs run --role reviewer --review <id> --brief -
   ```
   `dispatch` picks a reviewer from a different model family than the builder.
6. **Decide.**
   - Accept: `node scripts/dispatch.mjs apply <id>`
   - Reject: `node scripts/dispatch.mjs discard <id>`
   - Otherwise follow the status table in `references/result-format.md`.
7. **Integrate.** After applying a batch of more than one editing result, run
   the project's full checks once in the real working tree. Each worker's
   checks only proved its change in isolation. If integration fails, undo
   applies one at a time (`node scripts/dispatch.mjs unapply <id>`) or fix it
   yourself.

Run `node scripts/dispatch.mjs doctor` once per session before the first
dispatch; it reports which harnesses, models and tiers are usable here, and
under `runs.pending` any results from earlier sessions still waiting for
`apply` or `discard`. Decide those first, or tell the user. When `runs.hint`
says so, run `node scripts/dispatch.mjs prune`: it removes old run state and
discards unapplied worktree results, and never touches the working tree.

## Retries

One retry per task, total: either a follow-up **or** a rebrief. `dispatch`
enforces the limit.

**Follow-up** — same worker session, only when all hold: the diff is nearly
right, the remaining issue is small and local, and the worker's existing context
makes it cheaper than a fresh run.
```
node scripts/dispatch.mjs followup <id> --brief -
```

**Rebrief** — fresh run with a better brief. The tier goes up one step
automatically.
```
node scripts/dispatch.mjs run --rebrief-of <id> --brief -
```

After the retry, fix it yourself, drop it, or ask the user.

## Context discipline

- Keep your own context for the plan and the results. Don't read worker logs,
  full transcripts, or files the worker changed unless reviewing them.
- Retain from each result only what the next decision needs.
- For large batches, or once your context is getting heavy, hand the batch to a
  single native subagent acting as manager: it receives the task list, runs
  steps 3–7, and returns one report in the manager format from
  `references/result-format.md`. You keep the plan and final decisions.
- Respect `maxParallel` from configuration; don't launch more workers than you
  can review.

## Hard rules

- **No traces in the repository.** No briefs, logs, configs, agent notes,
  memory files, or markers inside the repo. Workers must not add comments,
  TODOs, commit trailers, or anything that identifies automated or agent work.
  Changes must read as if a person made them.
- **Existing project docs are the source of truth.** Never create documentation
  aimed at agents, and never let a worker's claim override the project's own
  docs, tests, or conventions.
- **Workers never commit, push, install dependencies, or change configuration**
  outside their allowed files. Denied actions come back in the result; if one
  was needed, do it yourself under the user's normal approval.
- **No secrets in briefs.** Never paste keys, tokens, or `.env` contents.
- **Out-of-scope observations are reported, not acted on.** Workers put them in
  `notes`. You decide whether they become new tasks or get mentioned to the
  user; they are never written into the repo as reminders.

## Files

- `scripts/dispatch.mjs` — the only entry point. Run `--help` for all options.
- `references/brief-template.md` — fill in per task.
- `references/result-format.md` — result fields, statuses, what to do for each.
- `references/review-checklist.md` — reviewing an editing worker's diff.
- `references/worker-preamble.md` — read by workers, not by you; prepended
  automatically.
- `config/workers.json` — models, tiers, kinds, role defaults, limits.
  Maintained by the user; don't edit it unless asked.
- `adapters/` — per-harness code and notes. Read only when `dispatch` points
  you there.
