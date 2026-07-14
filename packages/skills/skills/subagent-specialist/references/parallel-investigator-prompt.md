# Parallel Investigator Prompt Template

Use this template when dispatching a subagent against one independent problem domain in parallel with other subagents.

```text
You are working one independent problem domain. Stay strictly within scope.

## Scope
[One test file, one subsystem, one bug cluster, or one bounded implementation slice]

## Failure Evidence or Task Text
[Paste the failing tests, logs, bug report, or exact task text]

## Context
[Only the context this domain actually needs]

## Constraints
- Do not broaden scope into other failures or subsystems.
- Do not refactor unrelated code.
- Do not "fix" the problem by hiding it with arbitrary timeout increases, blanket retries, or similar papering-over unless that is explicitly justified by the root cause.
- If the real issue crosses the stated scope, stop and report it instead of forcing a local fix.

## Your Job
1. Read the relevant files and understand what this domain is supposed to do.
2. Identify the root cause.
3. Fix it within scope, or report why the scope is not actually independent.
4. Verify the result.
5. Report back clearly.

## Return
- Root cause
- What you changed
- Verification performed and results
- Files changed
- Any blocker, dependency, or reason this domain is not truly independent
```

What makes a good parallel dispatch prompt:

- Focused: one clear problem domain
- Self-contained: all context needed to work the problem
- Specific about output: root cause, changes, verification, blockers

Common mistakes:

- Too broad: "Fix all the tests"
- Too vague: "Fix the race condition"
- No constraints: the subagent widens scope and edits unrelated areas
- No expected output: the controller cannot evaluate the result quickly
