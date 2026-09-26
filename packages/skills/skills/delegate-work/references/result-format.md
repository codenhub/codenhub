# Result format

`scripts/dispatch.mjs` prints exactly one JSON document to stdout per
invocation. This file documents it; the code is authoritative. If they
disagree, the code wins and this file gets fixed.

## Exit codes

| Code | Meaning                                                              |
|------|----------------------------------------------------------------------|
| 0    | A result was produced. Read `status` — the task may still have failed. |
| 1    | Bad invocation (arguments, missing brief). No result.                |
| 2    | `dispatch` itself broke. No result or a partial one; stderr explains. |

Never treat exit code 0 as "the task succeeded".

## Single result

```json
{
  "v": 1,
  "id": "a1b2c3",
  "role": "fixer",
  "status": "ok",
  "worker": {
    "modelId": "gemini-flash",
    "route": "agy-subscription",
    "harness": "agy",
    "model": "some-flash-model-id",
    "tier": "light",
    "kind": "code",
    "skipped": [
      { "modelId": "mini", "reason": "context: needs ~210k, has 128k" }
    ]
  },
  "isolation": "inplace",
  "lineage": { "rebriefOf": null, "reviewOf": null },
  "summary": "Guarded parseDate against empty strings; added test case.",
  "report": null,
  "reportTruncated": false,
  "reportPath": null,
  "files": {
    "changed": [
      { "path": "src/validation.ts", "added": 4, "removed": 1 },
      { "path": "src/validation.test.ts", "added": 9, "removed": 0 }
    ],
    "outOfScope": []
  },
  "checks": [
    { "name": "typecheck", "ok": true, "tail": "" },
    { "name": "test", "ok": true, "tail": "" }
  ],
  "denied": [],
  "notes": ["parseTime in the same file has the same empty-string issue."],
  "hint": null,
  "durationMs": 48210,
  "applied": false,
  "retryAvailable": true,
  "logPath": "C:\\Users\\me\\.local\\state\\delegate-work\\runs\\a1b2c3\\log-1.jsonl"
}
```

### Fields

| Field             | Notes |
|-------------------|-------|
| `v`               | Format version. Bumped only on breaking changes. |
| `id`              | Handle for `apply`, `discard`, `followup`. |
| `role`            | `scout`, `fixer`, `builder` or `reviewer`. |
| `status`          | See the status table. |
| `worker`          | What actually ran, and the tier/kind it was chosen for. `route` names which access path was used. `skipped` lists models or routes passed over and why (context too small, unavailable, cooling down, blocked by data policy, failed and fell back). |
| `isolation`       | `inplace` (changes are already in the working tree) or `worktree` (changes wait for `apply`). |
| `lineage`         | `rebriefOf`: the task this run retries. `reviewOf`: the result this review covers. |
| `summary`         | Worker's own summary, capped at 600 characters. Unverified claim. |
| `report`          | `scout` and `reviewer` only: findings, capped at 4000 characters. `null` for editing roles. A `reviewer` report starts with a verdict line: `approve`, `approve-with-nits` or `reject`. |
| `reportTruncated` | `true` when `report` was cut at the cap. |
| `reportPath`      | The whole report, outside the repository. Read it when `reportTruncated` is `true` and the rest matters. |
| `files.changed`   | From `git diff`, not from the worker's claims. |
| `files.outOfScope`| Changed files not matching `--allow`. Non-empty forces status `out_of_scope`. |
| `checks`          | Verification commands from user config, or inferred from the project (fast set for `fixer`, full set for `builder`). `tail` is the last ≤ 20 lines of output, only when `ok` is false. **Empty means nothing could be inferred:** `ok` then only means "in scope and finished", and you must verify the change yourself before applying. |
| `denied`          | Actions the harness refused, verbatim, one line each. |
| `notes`           | Out-of-scope observations from the worker. Never acted on automatically. |
| `hint`            | Set by `dispatch` when it can suggest a concrete next step (e.g. re-authenticate a harness). |
| `applied`         | Whether the change is already in the main working tree. |
| `retryAvailable`  | `false` once this task's single retry (follow-up or rebrief) is used. `dispatch` refuses further retries. |
| `logPath`         | Full worker log, outside the repository. Read only to diagnose. |

Size caps exist to protect the orchestrator's context. Don't work around them
by reading the log by default.

## Statuses and what to do

| Status           | Meaning | Orchestrator action |
|------------------|---------|---------------------|
| `ok`             | Changes in scope and every check that ran passed (or read-only role finished). With an empty `checks`, nothing verified the change. | Editing roles: review the diff; for a nontrivial `builder`, get a cross-model review; then `apply` or `discard`. Read-only roles: use `report`. |
| `no_changes`     | `fixer` finished without changing anything. | Read `summary`. Usually the brief was wrong or the issue doesn't exist. Rebrief or drop. |
| `failed_checks`  | In scope, but a check failed. | Read the failing `tail`. Small and local → `followup` (refused if files changed since the run); otherwise `--rebrief-of` (tier goes up); if `retryAvailable` is false, fix it yourself or `discard`. |
| `out_of_scope`   | Touched files outside `--allow`, or anything inside dependency folders (`node_modules`, virtual environments). Changes are quarantined; in place, those files are already restored. Entries in parentheses are not restored: an install, or a write git can't see (an ignored file), known only from the worker's own edit events. | `discard`. Tell the user about any `(invisible to git, not restored)` file: it is still as the worker left it. If the extra file was genuinely needed, rebrief with a wider allowlist. |
| `blocked`        | Worker stopped because a needed action was denied. | Check `denied`. Do that action yourself if appropriate, then rebrief. |
| `timeout`        | Killed by the time or step budget. | `discard`. Task was too large or too vague: split or sharpen it, then `--rebrief-of` if retry is available. |
| `conflict`       | `apply`, `discard` or `unapply` found the files changed by someone else since the snapshot, a file whose path goes through a symlink or junction, or another in-place run still working in the tree. Nothing was overwritten. | If a run is still working, retry when it finishes. Otherwise inspect with `dispatch diff <id>`; merge by hand, rebrief from the current state, or `discard`. |
| `harness_error`  | Worker process failed (auth, rate limit, crash) and every fallback failed too. | Follow `hint`. Otherwise use native subagents or do it inline. |
| `use_native`     | The chosen model shares the orchestrator's quota pool. Nothing ran. `worker.model` names the model. | Run the same brief as a native subagent with that model. No retry is consumed. |
| `not_available`  | No configured harness is usable for this role here. | Run `doctor`; fall back to native subagents or inline. |

Retry limit per task: one follow-up **or** one rebrief, enforced by
`dispatch`. After that, do it yourself, drop it, or ask the user.

## Batch result

`run --batch` returns:

```json
{
  "v": 1,
  "batch": [ /* single results, in input order */ ],
  "totals": { "ok": 5, "failed_checks": 1, "out_of_scope": 0, "other": 1 }
}
```

The workers run in parallel, limited by `maxParallel`. With two or more
editing tasks, every editing worker gets its own worktree; a batch with a
single editing task runs it in place, like a lone `run`, unless one of its
routes is a harness that only edits in a worktree (Codex). Read-only tasks run
in place. Worktree results are not applied automatically; in-place changes are
already in the working tree. Either way, `apply` or `discard` each result.
After applying several, run the full checks once in the working tree
(SKILL.md, step 7).

## Prune result

`prune` removes runs older than `limits.pruneAfterHours` (or `--older-than`,
or every run with `--all`) that are not running:

```json
{
  "v": 1,
  "dryRun": false,
  "removed": [
    { "id": "a1b2c3", "role": "builder", "status": "ok", "ageHours": 30.2, "dropped": "unapplied worktree result" }
  ],
  "kept": [
    { "id": "d4e5f6", "role": "fixer", "status": null, "ageHours": 0.1, "reason": "running" }
  ],
  "errors": []
}
```

`dropped` says what was pending when a run was removed:

| `dropped` | What happened |
|-----------|---------------|
| `unapplied worktree result` | The change was discarded with its worktree. |
| `undecided in-place change (already in the working tree)` | The change stays in the tree as it is; it can no longer be discarded or unapplied through `dispatch`. |
| `interrupted; partial edits may be in the working tree` | An in-place run whose process died. Check the allowed files with git. |
| `interrupted` / `unreadable run state` | Nothing left to decide. |

`kept` lists running runs and, for recent runs, anything still pending.
`doctor` reports the same pending list under `runs.pending`.

## Manager report

When a native subagent manages a batch, it returns this to the orchestrator
instead of the raw batch:

```json
{
  "v": 1,
  "applied": ["a1b2c3", "d4e5f6"],
  "discarded": [{ "id": "g7h8i9", "reason": "out of scope: touched package.json" }],
  "needsDecision": [{ "id": "j0k1l2", "question": "Test expects old date format; update test or keep behavior?" }],
  "notes": ["parseTime has the same empty-string issue."]
}
```

The manager may `apply` results that pass the review checklist. Anything
requiring judgment goes to `needsDecision`, not into the code.
