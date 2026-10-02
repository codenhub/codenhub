---
name: agents-md-improver
description: Audits, writes, and trims AGENTS.md files, both the root file and scoped ones in subdirectories, and the harness files that load them, such as CLAUDE.md. Use when asked to check, audit, create, update, clean up, or fix AGENTS.md or other agent instruction files, when agents keep repeating the same mistake in a repository, or when deciding what agents should be told about a project.
metadata:
  short-description: Audit and improve AGENTS.md files
---

# AGENTS.md Improver

An agent instruction file is loaded into every session in its scope, so every line costs context in every session. A line earns its place only when an agent without it would make a mistake it could not avoid by reading the repository. Judge every line by that test first, then by where it belongs.

## What Goes Where

Read the root `AGENTS.md` and the contributor documentation first. When they say what agent instructions hold, follow that layout and judge against it. Otherwise use this one:

- **Root `AGENTS.md`:** how to work in the repository: behavior agents get wrong here, judgment calls, and pointers to where the rules live. Not facts an agent finds on its own, such as commands already in the contributor guide, a directory map it can list, or conventions a linter enforces.
- **Scoped `AGENTS.md`**, in any directory: the known traps of that scope, and nothing else.
- **Documentation:** rules, decisions and their reasons, and the commands and workflows people need too. Instruction files point to it and never copy it.
- **Tests, linters, and checks:** anything that can be verified mechanically. A rule a check enforces needs no line.
- **Harness files**, for a harness that reads its own file instead of `AGENTS.md`: an import of `AGENTS.md` and only what that harness alone needs. When scoped files exist, make sure agents reach them: either the root tells agents to read every `AGENTS.md` on the path to their work, or each scope has the harness file as well.
- **Never agent memory.** Knowledge worth keeping goes into the repository, where it is versioned, reviewed, and seen by every agent on every machine. Local memory files are none of those, and they go stale unseen.

## Traps

A trap is information, not a rule. It answers "why isn't this done the obvious way?" and lets an agent check whether the answer still holds:

- What happens, and when: "X happens when trying Y."
- What to prefer instead.
- The conditions it held under, such as a tool or runtime version, and its evidence when there is one, such as a test, an issue, or a measurement.

```markdown
- Running this package's tests from the repository root fails on Windows: fixture paths resolve against the working directory. Prefer `pnpm --filter <package> test`. Seen with pnpm 10.4; no test guards it.
```

- Bad: "Always run the tests from the package directory." It is a rule with no reason, so nobody can tell when it stops applying.
- Bad: "This package uses Vitest." An agent finds that in `package.json`.

Add a trap in the change that discovers it, and only when its cause is not evident from the code or documentation. Remove it in the change that removes its cause.

## Audit

1. **Find the files.** Every `AGENTS.md`, the harness files that load them, and what the root says about them. Audit the file the user names; otherwise all of them.
2. **Give each line one verdict.** Verify by reading or running; mark what you could not verify.
   - `keep`: an agent would make a mistake without it, and cannot find it elsewhere.
   - `cut`: generic advice, behavior a capable agent shows anyway, or a rule a check already enforces.
   - `move`: it belongs elsewhere. Name where: a rule or decision to documentation, a command to the contributor guide, a trap to a scoped file, a checkable rule to tooling.
   - `point`: it copies content another file owns. Replace it with a pointer, or cut it when agents find that file anyway.
   - `fix`: stale or wrong, such as a command that fails, a path that no longer exists, a trap whose cause is gone, or a statement the code contradicts.
   - `reword`: right, but phrased so it fires wrongly, such as capitals or "CRITICAL" that make models over-apply it, a prohibition without its alternative, or a rule tied to a keyword instead of the situation where it applies.
3. **Find what is missing, from evidence only.** Evidence is a mistake agents actually made here: a correction the user keeps repeating in prompts, review comments that recur on agent work, a fix that undid an agent's earlier fix, or a session transcript where an agent went wrong. Name the evidence for every addition. "Repositories should document X" is not evidence.
4. **Find conflicts** between instruction files, or between an instruction and the documentation. For each, say which side should win and why.

When everything holds, say so and change nothing.

## Report

Report before changing anything. Number every item so the user can approve by number, show each proposed line as it will read, and end with the net change in lines.

```markdown
**Files:** `AGENTS.md`, `packages/api/AGENTS.md`, `CLAUDE.md` (imports `AGENTS.md`).
**Summary:** 2 cut, 1 point, 1 fix, 1 reword, 1 addition. Net: −12 lines.

### AGENTS.md

1. `cut` L12 "Write clean, readable code.": generic; no agent does anything differently because of it.
2. `point` L20–31, the command table: `CONTRIBUTING.md` already documents these commands. Replace with "Commands and workflow: `CONTRIBUTING.md`."
3. `fix` L40 "`npm run e2e`": no such script in `package.json`; the browser tests run with `pnpm test:browser`.
4. `add` "Ask before adding or changing a public export." Evidence: in three of the last ten pull requests, an agent added an export that review then removed.

### packages/api/AGENTS.md

5. `reword` L3 "NEVER touch the cache.": state the trap instead: what breaks, when, and what to prefer.

### Conflicts

6. `cut` `AGENTS.md` L8 allows committing typo fixes to `main`; `CONTRIBUTING.md` forbids any commit to `main`. The contributor guide owns the workflow.
```

## Apply

After the user approves, all items or some by number:

- Make only the approved changes, and keep each file's structure unless the user approved restructuring it.
- Land moved content in its new home in the same change, so nothing is lost.
- Write every added line as a plain directive, with its reason when the reason is not obvious, and tied to the situation where it applies.
- Follow the project's formatting and commit conventions.

When a repository has no `AGENTS.md`, write the smallest root that passes the test, often a few lines: where the contributor workflow lives, and the behaviors agents got wrong here. Do not fill sections from a template.
