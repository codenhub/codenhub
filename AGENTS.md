# Agent instructions

## Working agreement

- Use the task's scope and your judgment to choose which documentation and code to inspect. Applicable contributor rules, coding standards, and specifications remain binding; reading less does not waive them.
- Ask when different interpretations would lead to different work. Do everything independent of the answer first, then ask at the point the answer is needed.
- Keep changes small and within the requested scope. Preserve unrelated work.
- Report failing checks, skipped steps, and unfinished work plainly. Never describe a partial result as complete.
- Close by listing material judgment calls and assumptions so they can be confirmed or reversed.

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
