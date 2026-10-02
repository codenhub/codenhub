# Agent instructions

## Working agreement

- Use the task's scope and your judgment to choose which documentation and code to inspect. Applicable contributor rules, coding standards, and specifications remain binding; reading less does not waive them.
- Ask when different interpretations would lead to different work. Do not settle an unstated choice about behavior, public API, or a recorded decision by assuming it. Do everything independent of the answer first, then ask at the point the answer is needed.
- Keep changes small and within the requested scope. Preserve unrelated work.
- Report failing checks, skipped steps, and unfinished work plainly. Never describe a partial result as complete.
- Close by listing material judgment calls and assumptions so they can be confirmed or reversed.

## Judgment

- Documentation records decisions; it does not prove them right. Follow a decision while it stands, and judge it too: when reviewing or auditing, ask both whether the work matches the decision and whether the decision is right, and report each finding as the one it is. `docs/guidelines/documentation.md` owns this distinction and the rules for recording and reversing decisions.
- Recorded decisions carry across sessions; a session's preferences do not. Do not reverse a recorded decision, or recommend reversing it, without naming what it did not weigh.
- Ground each finding in a realistic case: the input or calling code, what goes wrong, and for whom. A concern you cannot ground is a question; state it as one.
- A fix that adds or changes public surface, such as an export, an option, a default, or a limit, is a decision, not a fix. Present it as the problem, the options, your recommendation, and why, and wait for approval before making it.

## Knowledge

- Do not keep agent memory files. Knowledge worth keeping belongs in the repository, where it is versioned, reviewed, and available in every checkout: a recorded decision in documentation, a test, or a trap in a scoped `AGENTS.md`.
- Any directory MAY have its own `AGENTS.md`. Before working in a directory, read each `AGENTS.md` on the path from the repository root to it. This file says how to work; a scoped file records the known traps of its scope.
- A trap is information, not a rule: what happens, when trying what, and what to prefer instead, as in "X happens when trying Y; prefer Z". It answers "why isn't this done another way?" without settling it. When a trap may no longer hold, check it, then update or remove it. Rules and decisions belong in documentation, and a scoped file does not restate documentation or this file.
- Make each trap checkable: state the conditions it held under, such as a tool or runtime version, and its evidence when one exists, such as a test, an issue, or a measurement.
- Add a trap in the change that discovers it, when its cause is not evident from the code or documentation. Remove it in the change that removes its cause.

## Context discipline

- Start with filenames, headings, and focused searches; read the sections needed to understand the change and its dependencies. Expand inspection when evidence leaves a question unresolved.
- Reuse information already inspected in the session. Re-read material when it changed or when a specific uncertainty requires it.
- Prefer canonical sources. Generated compilations and references are alternate views, not additional contracts to read alongside their inputs.
- Bound searches and tool output by scope and size. Large files and logs are easier to inspect in relevant sections than in whole-file dumps; line counts alone do not bound long paragraphs.
- Batch independent inspections, keeping each result focused. Fewer tool calls help only when they avoid unnecessary output and repeated work.
- Narrow commands during development and reserve broad verification for the completed change. Retain the checks the contributor workflow requires.
- Use summaries first and inspect complete diagnostic logs as needed. Keep machine-readable and interactive output usable.

## Collaboration

- State material findings and remaining uncertainties as work progresses.
- Resolve conflicts between instructions and authoritative documentation explicitly rather than silently choosing a reading.
- Request approval for outward-facing actions where the contributor workflow requires it.
