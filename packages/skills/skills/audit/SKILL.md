---
name: audit
description: Audits and reviews code, packages, pull requests, and diffs for defects, vulnerabilities, API and contract problems, wrong design decisions, and readiness to merge, publish, or release, and classifies every finding the same way. Use when asked to audit or review something, to check whether it is ready, safe, or good enough to ship, to find bugs, issues, gaps, or vulnerabilities, or to write pull request review comments. Not for auditing agent skills or AGENTS.md files.
metadata:
  short-description: Audit code and classify findings consistently
---

# Audit

An audit judges whether the target is right: whether it works, whether it should work this way, and whether it serves the people who use it. Documentation records decisions; it is evidence to weigh, not the measure. Code can match its documentation and still be wrong, and a finding can be that a documented decision is wrong.

Two audits of the same target may find different things, but they must not contradict each other. That is what the evidence standard and the classification tables below are for: apply them as written, not by feel.

An audit reports. Change nothing until the user decides which findings to fix.

## Scope

- **Audit:** a package, directory, or codebase as it stands. Cover every public entry point in scope.
- **Review:** a diff, branch, or pull request. Judge the change and what it affects. Report a problem the change did not cause only when it is a blocker or the change makes it worse, and mark it `pre-existing`.

## Prepare

Before judging anything, establish:

- **Purpose and users.** Who calls this, how, and what they expect. For a library, write the calling code a consumer would write for the common case and for the hardest case.
- **Stage.** Unreleased, experimental, or stable. The stage decides what a breaking change costs and which surface is about to freeze; it never turns a defect into a non-defect.
- **Recorded decisions** in the area, with their reasons and the alternatives they rejected.
- **Recent history.** Commits, pull requests, and earlier audit results that touched the area, and why. An audit that undoes last week's fix, or reopens a decision on arguments already heard, is the failure this skill exists to prevent.

## Questions

Ask every question of every entry point in scope, so two audits cover the same ground:

1. **Does it work?** Valid, boundary, invalid, hostile, very large, deeply nested, concurrent and asynchronous input; other runtimes and realms the target claims to support.
2. **Should it work this way?** Would a consumer who read only the name, signature, and documentation expect this behavior? Is there a simpler, more predictable behavior that serves the same purpose?
3. **Should it be exposed like this?** Every name, option, default, return type, and error shape: is it needed, is it what a consumer would guess, and what does changing it cost once people depend on it?
4. **Is it safe?** With attacker-controlled input: crashes or hangs that take down a process, unbounded time or memory, checks that can be bypassed, injection, prototype pollution, leaked data.
5. **Does it hold at scale?** Cost as input grows in size and depth; work repeated per item or per level.
6. **Do the docs tell the truth?** Claims match behavior, and examples run as shown.
7. **Is what consumers rely on tested?** A relied-upon behavior with no test is a gap.

Over-engineering and code that could be deleted are out of scope; use the `ponytail-review` skill when it is available.

## Evidence

Every finding states a case:

- **Input or calling code:** concrete and minimal.
- **Result:** what happens, and what should happen.
- **Reach:** who hits it (see the severity table).

Run the case when you can; a failing test or a script settles what reasoning cannot. Mark a finding `verified` only when you executed its case in this session and saw the result, and `traced` otherwise; without a way to run code, every finding is `traced`. A concern you cannot turn into a case is a question, and so is a `traced` case that depends on what a compiler, runtime, or third-party library does: you did not observe that step, so you cannot claim its result.

Do not report:

- A preference with no consequence you can show.
- A future risk with no present case ("if someone later...").
- Style that a formatter or linter owns.
- A difference between code and documentation without saying which side is right.

## Classify

Every finding gets one kind and one severity.

### Kind

| Kind            | Use when                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerability` | Someone who controls input can cause harm: crash or hang a process, exhaust memory, bypass a check, read or change what they should not.             |
| `defect`        | Behavior is wrong for a case a consumer can reach, whatever the documentation says.                                                                  |
| `contract`      | The public surface itself is wrong or costly: a name, option, default, type, or error shape that misleads consumers or will force a breaking change. |
| `decision`      | A recorded decision is wrong on merit. Requires naming what the decision did not weigh (see "Decisions").                                            |
| `drift`         | Documentation and code disagree and the decision itself is right. Say which side changes.                                                            |
| `gap`           | Something the target's stated purpose needs is missing, including a test for relied-upon behavior.                                                   |
| `question`      | A concern you could not ground. Say what would settle it. Questions have no severity.                                                                |

When more than one kind fits, take the first in the table. Behavior that is wrong is a `defect` even when it is public surface, such as a validator that accepts a schema mistake it should reject; `contract` is for surface that behaves as designed when the design is the problem.

### Severity

Read severity from reach and impact. Use only the values below; when a case fits two, take the later one in its list.

**Reach:**

- `default`: common usage with default options, or any input an end user or attacker supplies.
- `opt-in`: needs a documented option, or less common but realistic usage.
- `contrived`: needs code nobody would write, or misuse the documentation warns against.

**Impact:**

- `critical`: security harm, data loss or corruption, a process that aborts or hangs, unbounded time or memory, or invalid input accepted as valid.
- `wrong`: a wrong result that callers notice, an exception the API does not promise to throw, or a broken documented promise.
- `degraded`: works, but slow, confusing, misleadingly worded, or awkward to use.
- `cosmetic`: no effect on behavior or use.

| Impact \ Reach | `default` | `opt-in`  | `contrived` |
| -------------- | --------- | --------- | ----------- |
| `critical`     | `blocker` | `blocker` | `major`     |
| `wrong`        | `major`   | `major`   | `minor`     |
| `degraded`     | `minor`   | `minor`   | `note`      |
| `cosmetic`     | `note`    | `note`    | `note`      |

Then apply, in order:

1. A `vulnerability` is at least `major`.
2. A `contract` finding on surface that freezes with the next release goes one step up (`note` to `minor`, `minor` to `major`, `major` to `blocker`): it is the last cheap moment to change it.

**Verdict:** any `blocker` means not ready. Otherwise any `major` means ready with caveats. Otherwise ready. The verdict follows from these counts alone; put any reservation that does not change them in a finding or a question.

## Decisions

- Report a recorded decision as a `decision` finding only when you can name what it did not weigh: a case it gets wrong, a measurement, or a constraint that has changed. Without that, the decision stands; do not list it. When the alternative you prefer was already rejected, your evidence must answer the reason it was rejected.
- Before reporting, check each finding against the recent history of its area. When a finding would undo a recent fix or reverse a recent decision, name that change and say why it was wrong.
- A fix that adds or changes public surface (an export, an option, a default, a limit, an error shape) is a decision, not a fix. Present it in the decision format below, include "change nothing" when it is viable, and prefer a fix that removes the problem without new surface.

## Several Auditors

When the audit is split across workers, or results from another audit are in hand:

- Give every worker its scope, the evidence standard, and the classification tables from this skill, verbatim.
- Merge duplicates. When findings contradict each other, whether one calls a behavior wrong and another relies on it or the same case gets two classifications, re-check the case, apply the tables, and report one answer. When it cannot be resolved, report it as one `question`. Never pass a contradiction on unresolved.

## Report

Open with the verdict and the counts, then the scope. List findings by severity, `blocker` first. Number them so the user can answer by number.

```markdown
**Verdict: not ready.** 1 blocker, 1 major, 2 minor, 1 question.
**Scope:** `packages/http` at `a1b2c3d`: source, tests, and public docs. Not covered: the browser build, since no browser was available.

### Findings

1. **`parseCsv()` hangs on an unterminated quote.** `vulnerability` · `blocker` · `default` · `verified` · `src/csv.ts:88`
   - Case: a 40 KB upload whose first field opens a quote and never closes it takes 90 seconds in `parseCsv(text)`, blocking the event loop.
   - Why: one upload stalls every other request on the server.
   - Fix: stop at the end of input and report the unterminated quote.

2. **Retrying every request method.** `decision` · `major` · `default` · `traced` · `src/retry.ts:41`
   - Problem: `fetchJson` retries a timed-out request whatever its method, so a `POST` that reached the server is sent twice and creates a duplicate order.
   - Not weighed: the recorded decision chose retries on by default for resilience, and considered only idempotent reads.
   - Options: (a) retry only idempotent methods by default; (b) keep retrying all methods and document it; (c) make all retries opt-in.
   - Recommendation: (a). Why: it removes the duplicates for the common case and needs no new option.

### Ruled out

- `parseCsv()` accepting a trailing newline after the last row: RFC 4180 allows it, and the docs say so.

### Questions

- Whether `formatMoney` should round half to even: it depends on whether consumers use it for accounting totals. Asking them would settle it.
```

- **Title:** what is wrong, in plain words.
- **Tag line:** kind, severity, reach, `verified` or `traced`, and location, in that order. Add `pre-existing` when it applies.
- **`decision` findings** always give the problem, what was not weighed, the options, the recommendation, and why.
- **Ruled out** lists what you checked and found sound that a reader might expect to see flagged, with the reason. It keeps the next audit from raising it again. Write "None" when empty.
- Leave out praise, summaries of what the code does, and hedging. When unsure, write a question.

### Pull Request Comments

When asked for comments to post on a pull request, write one line per finding, ready to paste:

`<file>:L<line>: <severity> <kind>: <problem>. <fix>.`

```text
csv.ts:L88: blocker vulnerability: an unterminated quote makes parseCsv scan forever. Stop at end of input and report it.
retry.ts:L57: minor defect: the delay ignores a Retry-After header. Use it when present.
```

Write `vulnerability` and `decision` findings as a short paragraph instead, since their reasoning is the point.

## After the Report

- Fix only the findings the user approves.
- Give each fix a test that fails before it and passes after.
- When a fix turns out to need new public surface, stop and bring it back as a decision.
- Record each decision the user takes where the project records decisions, with its reason and the alternatives rejected.
