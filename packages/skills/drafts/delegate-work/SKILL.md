---
name: delegate-work
description: Split coding work across subagents and delegate focused tasks to worker agents, including cheaper or different models through external CLI harnesses. Use whenever a task can be broken into independent pieces, when several small fixes, lint/type errors, or mechanical edits need doing, when a well-specified, isolated feature or module can be implemented separately, when exploring or gathering information across a large codebase, when a second opinion or review from another model would help, or when the user mentions delegating, subagents, parallelizing, fanning out, workers, cheaper models, saving quota, or usage limits — even if they don't name this skill.
---

# Delegate work

Split work so each agent holds only the context its task needs. The orchestrator (the agent reading this) plans, briefs, reviews and decides. Workers execute narrow, well-specified tasks and report back in a fixed, compact format.

## Principles

1. **Dispatch routes, native wins ties.** `scripts/dispatch.mjs` decides per task whether your own subagents or an external worker runs it, from the configured models, tiers and quota pools. When the best model is one you run natively, it says so (`use_native`) and runs nothing.
2. **No footprint.** Nothing about this process may appear in the repository. See [Hard rules](#hard-rules).
3. **One shot.** A worker gets one complete brief and one run, plus at most one retry: a short follow-up when the result is nearly right, or a better brief and a fresh run (see [Retries](#retries)). Never an open-ended conversation.
4. **Code enforces, the orchestrator judges.** Scope, timeouts, isolation, checks, model choice and fallback are handled by `dispatch`. The orchestrator decides what to delegate, writes briefs, and reviews results.

## Choose a path

Walk these in order and stop at the first that fits.

1. **Inline.** The task is small, tightly coupled, or needs judgment at every step → do it yourself. Delegation has overhead; don't pay it for nothing.
2. **Through `dispatch`.** Anything you delegate → route it with `dispatch` (see [Workflow](#workflow)). Don't start a native subagent on your own judgment: you can't see which quota is scarce or which cheaper model can do the work, and the configuration says both. `use_native` sends the task back to your own subagents with the model to use.
3. **Native subagents without `dispatch`.** Only when `dispatch` can't route here: `doctor` reports config errors or no usable route for any tier, or a task comes back `not_available` or `harness_error` with no fallback left. Use native subagents (or do it inline) with the same brief discipline, and tell the user once.

## What to delegate

Delegate work whose decisions are already made. Keep for yourself anything that needs design choices, cross-cutting understanding, taste, or negotiation with the user.

**Small, located work** (`fixer`): a specific bug or type error in named files, a described mechanical change across a known set of files. You must be able to state the done-criteria in one or two sentences. Do the locating yourself — workers should start from "the problem is here", not "find the problem".

**Isolated implementation** (`builder`): a feature, module or endpoint that is larger but fully specified. Delegate only when **all** hold:

- **Decisions are made.** You have fixed the interfaces, file layout, names, and error behavior. The builder fills them in; it does not design.
- **It is isolated.** New files or its own module; the allowlist can be written up front.
- **Acceptance is concrete.** You provide a list of cases the result must satisfy. The builder must implement them as tests.

If a task is isolated and verifiable but a few small decisions are still open, close them and then delegate; don't implement it yourself just because the brief wasn't ready yet. Decide what is technical and local yourself; ask the user about anything that changes behavior they would care about. If closing the open decisions takes real design work or reaches into other code, the task isn't isolated after all: keep it.

**Information** (`scout`): find usages, map a module, summarize how something works, answer a question about the codebase.

**Review** (`reviewer`): critique a diff or file against stated criteria.

When native subagents are cheap, `builder` work is where they pay off most: the more judgment a task carries, the more model quality matters.

## Roles and tiers

| Role       | Edits | Default tier | Use for                                  |
| ---------- | ----- | ------------ | ---------------------------------------- |
| `scout`    | no    | `light`      | reading, searching, summarizing          |
| `fixer`    | yes   | `light`      | small, located edits                     |
| `builder`  | yes   | `standard`   | isolated, fully specified implementation |
| `reviewer` | no    | `standard`   | critique against given criteria          |

Don't pick a model yourself. Describe the task; configuration maps it to models.

- **Tier** (`--tier light|standard|strong`) — override the role default only with a reason: go up when the task has tricky logic or earlier attempts failed; go down for purely mechanical work.
- **Kind** (`--kind code|ui|text`, default `code`) — set it only when the task is plainly UI/styling or plainly prose (comments, docs, messages). The kind's models are tried before the tier's own; no effect unless configuration defines models for that kind.
- **Context size** is estimated by `dispatch` from the brief and the files the worker may touch or read. Don't try to account for it.

### When the user names a model, harness or effort

Pass what they named, and only that. "Use agy with gemini 3.8 on medium" is `--harness agy --model gemini-3.8-flash-medium`.

- **`--model <id>`** — a model id from the configuration (`doctor` lists them under `routes`), or the harness's own id. A configuration id may run on any of its routes; a harness id only on the routes that run that id.
- **`--harness opencode|codex|agy|claude`** — only routes on that harness. With `--model`, a model the configuration doesn't list runs as the harness names it (route `adhoc`), on the quota pool and data policy of a configured route on that harness. With no configured route for its provider, it counts as training on data: blocked unless training is allowed.
- **`--effort <level>`** — the harness's effort level (`low`, `medium`, `high`; some harnesses take more). On agy, where most model ids end in their level, it picks the id with that level instead.

Translate the user's words into the exact id the harness lists (`agy models`, `opencode models`); don't guess one. An id the harness doesn't list comes back `not_available` with the reason. A harness or effort level always means an external run: a native subagent takes neither. A rebrief keeps the overrides of the run it retries, and a model picked by hand isn't moved up a tier; pass `--tier` to route by tier again. A new `--model` on a rebrief drops the old `--effort`: on agy the id names its own. The user's choice is for the work they named it for: reviews of that work still come from another family, picked by `dispatch`.

If the best choice for a task is a model you can already run as a native subagent, `dispatch` returns `use_native` with the model to use instead of running anything. Follow it: start a native subagent with that model and give it the text at the result's `promptPath`, your brief with the worker rules in front. Pass `--external` only when the user explicitly asks for an external run; that request covers the reviews and retries of the same work, and `dispatch` carries it over to them (`--rebrief-of`, `--review`).

## Workflow

1. **Plan.** List the tasks. Mark which are independent (parallel) and which depend on others (sequential). Tasks in the same batch must not touch the same files. `dispatch` refuses a batch whose allowlists reach a common existing file or a path one of them names; it can't foresee two wildcards creating the same new file, so name new files explicitly. Checks run the project's own commands, often the whole test suite, not just the worker's files: a failure the worker didn't cause still makes its result `failed_checks`. Fix known failures first, or run a task that depends on another's change after it.
2. **Brief.** Fill in `references/brief-template.md` for each task. Every editing brief must name the files it may touch (`--allow`). Files the worker should read but not edit go in `--read`. Pass briefs through stdin or a temporary path outside the repository.
3. **Dispatch.** Run `dispatch` from the repository the work is in: it works on the repository of the current directory. `scripts/` is under this skill's directory, so give its full path: every `node scripts/dispatch.mjs` in this file stands for `node <this skill's directory>/scripts/dispatch.mjs`.
   ```
   node scripts/dispatch.mjs run --role fixer --allow "src/validation.ts" --allow "src/validation.test.ts" --brief -
   node scripts/dispatch.mjs run --role builder --allow "src/rates/**" --read "src/types.ts" --brief -
   node scripts/dispatch.mjs run --batch <batch.json>
   ```
   - A run lasts up to its role's time budget (30 minutes for a builder) plus its checks, and a batch prints nothing until every worker in it finishes. Run `dispatch` in the background, or wherever a command timeout won't cut it off, and wait for its result. A dispatch stopped halfway leaves an interrupted run for `discard`.
   - Before a batch, run it with `--plan`: it routes every task and runs nothing. Dispatch the `planned` ones with `--isolation worktree`, then start the `use_native` ones as native subagents: an editing worker in place would take their edits for its own.
   - Workers start from the current working tree, including uncommitted changes. Don't edit the tree while an editing worker runs in place: its result can't tell your edits from its own. `dispatch` refuses another editing run until it finishes, for the same reason. The result's `isolation` says where the change is; `references/isolation.md` explains each case.
4. **Read the result.** Each run returns one JSON result, specified in `references/result-format.md`. Read the result, not the log. When `reportTruncated` is true and the rest matters, read `reportPath`. Open `logPath` only to diagnose a failure you can't explain from the result.
5. **Review.** For `ok` results from editing roles, check the diff against `references/review-checklist.md`. Passing checks is necessary, not sufficient. Also get a cross-model review before applying a `builder` result that adds logic or changes more than one file; skip it only for purely mechanical changes:

   ```
   node scripts/dispatch.mjs run --role reviewer --review <id> --brief -
   ```

   `dispatch` picks a reviewer from a different model family than the builder, gives it the original brief and the diff, and lets it read the changed files. The brief needs only the review criteria. A diff over 60,000 characters is cut, and the result's `hint` says so: check that the report covers every changed file. When it returns `use_native`, give the native reviewer the text at the result's `promptPath`, which holds the worker rules, your criteria, the original brief and the diff, and tell it where to read the changed files: the reviewed run's `worktree` from `dispatch show <id>`, or your working tree for an in-place result.

   When the builder was a native subagent, there is no run to review: write its change to a diff outside the repository (`git diff -- <files>`, plus `git diff --no-index -- /dev/null <file>` for each new file) and review that. The reviewer comes from a family other than your own models', and reads the changed files in your working tree. `dispatch` knows your models only when it recognizes you as the orchestrator; when the `hint` says none was recognized, pass `--orchestrator <name>`. Its brief needs the criteria and the original task, which `dispatch` doesn't have:

   ```
   node scripts/dispatch.mjs run --role reviewer --review-diff <diff file> --brief -
   ```

   When either returns `not_available` (no other family can run here), review it yourself against the checklist. Don't lower the reviewer's tier to reach another family: a light reviewer tends to approve without looking.

6. **Decide.**
   - Accept: `node scripts/dispatch.mjs apply <id>`
   - Reject: `node scripts/dispatch.mjs discard <id>`
   - Otherwise follow the status table in `references/result-format.md`. Read-only results (`scout`, `reviewer`) need neither.
   - A `use_native` task ran as your own subagent, so `dispatch` holds no change to `apply` or `discard`: keep its edits, or revert them with git. Revert them before a rebrief, which otherwise starts from that attempt's edits.
7. **Integrate.** After applying a batch of more than one editing result, run the project's full checks once in the real working tree. Each worker's checks only proved its change in isolation. If integration fails, undo applies one at a time (`node scripts/dispatch.mjs unapply <id>`) or fix it yourself.

Run `node scripts/dispatch.mjs doctor` once per session before the first dispatch; it reports which harnesses, models and tiers are usable here, and under `runs.pending` any results from earlier sessions still waiting for `apply` or `discard`; `node scripts/dispatch.mjs show <id>` prints one's result. Decide those first, or tell the user. When `runs.hint` says so, run `node scripts/dispatch.mjs prune`: it removes old run state and discards unapplied worktree results, and never touches the working tree. Don't prune while `runs.pending` lists a result the user hasn't decided on, unless they agree.

## Retries

One retry per task, total: either a follow-up **or** a rebrief. `dispatch` enforces the limit.

**Follow-up** — same worker session, only when all hold: the diff is nearly right, the remaining issue is small and local, and the worker's existing context makes it cheaper than a fresh run.

```
node scripts/dispatch.mjs followup <id> --brief -
```

**Rebrief** — fresh run with a better brief. It keeps the run's role, allowlist, read list and overrides (`--model`, `--harness`, `--effort`, `--external`) unless given (a new `--model` drops the old `--effort`); the tier goes up one step automatically, unless the user picked the model.

```
node scripts/dispatch.mjs run --rebrief-of <id> --brief -
```

After the retry, finish it yourself, drop it, or ask the user. To finish a result yourself, `apply` it first (`failed_checks` and `blocked` results apply too), then edit your working tree. Never edit a result's `worktree`: `apply` copies the worker's version and drops the worktree with your edits.

## Context discipline

- Keep your own context for the plan and the results. Don't read worker logs, full transcripts, or files the worker changed unless reviewing them.
- Retain from each result only what the next decision needs.
- For large batches, or once your context is getting heavy, hand the batch to a single native subagent acting as manager. Route the batch with `--plan` first and keep the `use_native` tasks yourself: a subagent usually can't start its own. Give the manager this skill's path, the `planned` tasks with their briefs, allowlists and read lists, and whether it may `apply`. It runs steps 3–7 and returns one report in the manager format from `references/result-format.md`. You keep the plan and final decisions.
- Respect `maxParallel` from configuration; don't launch more workers than you can review.

## Hard rules

- **No traces in the repository.** No briefs, logs, configs, agent notes, memory files, or markers inside the repo. Workers must not add comments, TODOs, commit trailers, or anything that identifies automated or agent work. Changes must read as if a person made them.
- **Existing project docs are the source of truth.** Never create documentation aimed at agents, and never let a worker's claim override the project's own docs, tests, or conventions.
- **Workers never commit, push, install dependencies, or change configuration** outside their allowed files. Denied actions come back in the result; if one was needed, do it yourself under the user's normal approval.
- **No secrets in briefs.** Never paste keys, tokens, or `.env` contents.
- **Out-of-scope observations are reported, not acted on.** Workers put them in `notes`. You decide whether they become new tasks or get mentioned to the user; they are never written into the repo as reminders.

## Files

- `scripts/dispatch.mjs` — the only entry point. Run `--help` for all options.
- `references/brief-template.md` — fill in per task.
- `references/result-format.md` — result fields, statuses, what to do for each.
- `references/review-checklist.md` — reviewing an editing worker's diff.
- `references/isolation.md` — in place or in a worktree, and what each means for your tree.
- `references/worker-preamble.txt` — read by workers, not by you; prepended automatically.
- `config/workers.json` — models, tiers, kinds, role defaults, limits. Maintained by the user; don't edit it unless asked.
- `adapters/` — per-harness code and notes. Read only when `dispatch` points you there.
