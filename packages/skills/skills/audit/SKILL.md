---
name: audit
description: Audits and reviews code, packages, pull requests, and diffs for defects, vulnerabilities, API and contract problems, wrong design decisions, and readiness to merge, publish, or release, and classifies every finding the same way. Use when asked to audit or review something, to check whether it is ready, safe, or good enough to ship, to find bugs, issues, gaps, or vulnerabilities, or to write pull request review comments. Not for over-engineering or bloat reviews, or for auditing agent skills or AGENTS.md files.
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
- **Earlier fixes, first.** When the target was audited before, check each fix merged since then before auditing the rest: whether it covers every member of its finding's class (see "Evidence"), whether the same pattern survives elsewhere, and whether each claim its docs and changelog added holds beyond the case its test used. A fix covers the example it was given far more often than the class, so this is where a re-audit finds the most.

## Questions

Ask every question of every entry point in scope, so two audits cover the same ground:

1. **Does it work?** Valid, boundary, invalid, hostile, very large, deeply nested, concurrent and asynchronous input; other runtimes and realms the target claims to support.
2. **Should it work this way?** Would a consumer who read only the name, signature, and documentation expect this behavior? Is there a simpler, more predictable behavior that serves the same purpose?
3. **Should it be exposed like this?** Every name, option, default, return type, and error shape: is it needed, is it what a consumer would guess, and what does changing it cost once people depend on it?
4. **Is it safe?** With attacker-controlled input: crashes or hangs that take down a process, unbounded time or memory, checks that can be bypassed, injection, prototype pollution, leaked data.
5. **Does it hold at scale?** Cost as input grows in size and depth; work repeated per item or per level.
6. **Do the docs tell the truth?** Claims match behavior, and examples run as shown.
7. **Is what consumers rely on tested?** A relied-upon behavior with no test is a gap.

Over-engineering and code that could be deleted are out of scope; leave them to a review for complexity.

## Evidence

Every finding states a case:

- **Input or calling code:** concrete and minimal.
- **Result:** what happens, and what should happen.
- **Reach:** who hits it (see the severity table).
- **Class:** every input, call site, and code location that shares the case's cause, so the fix removes the cause rather than the example. Find it from the rule of the code that reads the value, not from the example's spelling: a URL parser reads `//`, `/\`, and `/` plus any run of tabs plus `/` alike as the start of a host; a serializer re-reads the content of raw-text elements and of `textarea` and `title` alike. Search the codebase for the same pattern, such as another process-wide record keyed by unbounded text, and list each place. A member outside the scope audited, such as another package or a dependency, is listed as work for its own change, never folded into this finding's fix. Run each member you can.

Run the case when you can; a failing test or a script settles what reasoning cannot. Mark a finding `verified` only when you executed its case in this session and saw the result, and `traced` otherwise; without a way to run code, every finding is `traced`. A `traced` finding stands when the code you read and the language or a documented API contract settle its result, such as a call to a function that does not exist. A concern you cannot turn into a case is a question, and so is a `traced` case whose result rests on tool behavior you assumed rather than read or ran, such as whether a compiler reports an error or how a third-party library handles an input.

Do not report:

- A preference with no consequence you can show. That includes a name, option, or design you would have chosen differently: "a clearer name exists" is a preference until you show the code a consumer writes that goes wrong because of the current one.
- A missing feature that no consumer is shown to need. That the target could do more is true of every target.
- A future risk with no present case ("if someone later...").
- Style that a formatter or linter owns.
- A difference between code and documentation without saying which side is right.

## Classify

Every finding gets one kind and, except a `question`, one severity.

### Kind

| Kind            | Use when                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vulnerability` | Someone who controls input can cause harm: crash or hang a process, exhaust memory, bypass a check, read or change what they should not.                                                        |
| `defect`        | Behavior is wrong for a case a consumer can reach, whatever the documentation says.                                                                                                             |
| `contract`      | The public surface itself is wrong or costly: a name, option, default, type, or error shape that misleads consumers or will force a breaking change. The case is the consumer code it misleads. |
| `decision`      | A recorded decision is wrong on merit. Requires naming what the decision did not weigh (see "Decisions").                                                                                       |
| `drift`         | Documentation and code disagree and the decision itself is right. Say which side changes.                                                                                                       |
| `gap`           | Something the target's stated purpose needs is missing, shown by a consumer who needs it, including a test for relied-upon behavior.                                                            |
| `question`      | A concern you could not ground. Say what would settle it. Questions have no severity.                                                                                                           |

When more than one kind fits, take the first in the table. Behavior that is wrong is a `defect` even when it is public surface, such as a validator that accepts a schema mistake it should reject; `contract` is for surface that behaves as designed when the design is the problem.

### Severity

Read severity from reach and impact. Use only the values below; when a case fits two, take the later one in its list.

**Reach:**

- `default`: common usage with default options, or any input an end user or attacker supplies.
- `opt-in`: needs a documented option, or less common but realistic usage.
- `contrived`: needs code nobody would write, or misuse the documentation warns against.

**Impact:**

- `critical`: security harm, data loss or corruption, a process that aborts or hangs, unbounded time or memory, or input the target exists to reject accepted as valid and passed on. Accepting anything else, such as an option that has no effect, is graded by what it causes.
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
2. A `contract` finding on surface that freezes with the next release goes one step up (`note` to `minor`, `minor` to `major`, `major` to `blocker`): it is the last cheap moment to change it. The step applies only to a finding whose case shows consumer code going wrong; the cost of a change is never a reason by itself.

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

Open with the verdict and the counts, then the scope. When the target was audited before, say next how many findings trace to a fix merged since then, naming the commits: a high share means the fixes, not the code, are where the next audit's findings come from. List findings by severity, `blocker` first. Write each title and case in plain words for someone who did not run the audit: what a consumer does and what goes wrong. A specification or framework name is evidence after the case, never the case. Number findings and questions in one sequence, so the user answers every item the same way, by number. End with how to reply: which findings you recommend fixing, as in "Reply 'go' to fix 1, 2, and 4 as recommended, or name the numbers to change."

```markdown
**Verdict: not ready.** 1 blocker, 1 major, 1 question.
**Scope:** `packages/http` at `a1b2c3d`: source, tests, and public docs. Not covered: the browser build, since no browser was available.

### Findings

1. **`parseCsv()` hangs on an unterminated quote.** `vulnerability` · `blocker` · `default` · `verified` · `src/csv.ts:88`
   - Case: a 40 KB upload whose first field opens a quote and never closes it takes 90 seconds in `parseCsv(text)`, blocking the event loop.
   - Class: every scan that looks for a closing character: the quote scan in `parseCsv` and the same loop copied into `parseTsv` (`src/tsv.ts:52`).
   - Why: one upload stalls every other request on the server.
   - Fix: stop each scan at the end of input and report the unterminated quote.

2. **Retrying every request method.** `decision` · `major` · `default` · `traced` · `src/retry.ts:41`
   - Problem: `fetchJson` retries a timed-out request whatever its method, so a `POST` that reached the server is sent twice and creates a duplicate order.
   - Not weighed: the recorded decision chose retries on by default for resilience, and considered only idempotent reads.
   - Options: (a) retry only idempotent methods by default: a timed-out `POST` fails once instead of ordering twice, and the caller decides whether to send it again; (b) keep retrying all methods and document it: no code changes, and the duplicates stay; (c) make all retries opt-in: no duplicates by default, though a caller who opts a `POST` in can still get one, and every caller relying on retried reads must add the option.
   - Recommendation: (a). Why: it removes the duplicates for the common case, keeps retried reads working, and needs no new option.

### Ruled out

- `parseCsv()` accepting a trailing newline after the last row: RFC 4180 allows it, and the docs say so.

### Questions

3. **Rounding half-cent prices.** `formatMoney(2.345)` shows `$2.35`; accounting software that rounds half to even shows `$2.34`, so a total built from our prices can be a cent off an invoice. (a) Change nothing: it matches `Intl.NumberFormat`. (b) Round half to even by default: breaking, about half of the half-cent prices change in every app, such as `$2.35` to `$2.34`. Recommendation: (a) until a consumer reports a mismatch.

Reply "go" to fix 1 and 2 and keep the rounding in 3 as recommended, or name the numbers to change.
```

- **Title:** what is wrong, in plain words.
- **Tag line:** kind, severity, reach, `verified` or `traced`, and location, in that order. Add `pre-existing` when it applies, and `from <commit>` when an earlier fix introduced the finding or left it incomplete.
- **Class** is required for every finding except a question. Write "only this case" when the search found no other member, so the reader knows the search ran.
- **Fix** may be "change nothing", with its reason. Recommend it when the fix costs consumers more than the problem does, such as a breaking rename for a `contrived` case, and say so rather than proposing a change.
- **`decision` findings** always give the problem, what was not weighed, the options, the recommendation, and why.
- **Ruled out** lists what you checked and found sound that a reader might expect to see flagged, with the reason. It keeps the next audit from raising it again. Write "None" when empty.
- Leave out praise, summaries of what the code does, and hedging. When unsure, write a question.

### Pull Request Comments

When asked for comments to post on a pull request, write one line per finding, ready to paste:

`<file>:L<line>: <severity> <kind>: <problem>. <fix>. Class: <class>.`

Append `From <commit>.` when an earlier fix introduced the finding or left it incomplete.

```text
csv.ts:L120: major defect: a trailing empty field is dropped. Keep it as an empty string. Class: only this case.
retry.ts:L57: minor defect: the delay ignores a Retry-After header. Use it when present. Class: the delay in poll.ts:L30 too.
```

Write `vulnerability` and `decision` findings as a short paragraph instead, since their reasoning is the point.

## After the Report

- Fix only the findings the user approves.
- Fix the finding's cause for its whole class, not the case that illustrated it. Test every member of the class, as a table where they share one assertion; where the class has no end, test each distinct form and its boundaries, and name the members left out. Search again for the pattern before calling the fix complete. Fix the members within the scope audited; report each member outside it, with its location, for its own change.
- Give each fix that changes behavior a test that fails before it and passes after. When no test can be written, ask the user before shipping the fix without one, and say so in the report.
- When a fix turns out to need new public surface, stop and bring it back as a decision.
- Record each decision the user takes where the project records decisions, with its reason and the alternatives rejected.
