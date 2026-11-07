---
status: DRAFT
last_updated: 2026-11-06
scope: Evidence for a coding skill: what agents got wrong when first writing code in this repository.
---

# Coding skill research

## Purpose

The skill-writing rules require every rule to come from an observed failure. This document records those failures so the coding skill can be written, reviewed, and evaluated against them. All code in this repository was written, reviewed, and fixed by agents.

## Sources and method

| Source                         | Scope                                                   | "Proven" means                                                                                           |
| ------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| PR review threads, PRs 1–240   | 508 threads, 431 accepted, 261 on code                  | Bot marked "Addressed in commit", the owner replied fixed/valid, or the thread went outdated by a change |
| PR review threads, PRs 241–485 | 1,029 threads, 572 on code, 406 accepted, 35 declined   | Same                                                                                                     |
| Git history                    | 1,256 `fix`/`refactor` commits triaged, ~90 diffs read  | Code corrected after it landed                                                                           |
| T3 Code threads                | 14 audit and review threads read in depth, ~20 searched | The user confirmed a finding and it shipped, or corrected agent code                                     |

Counts come from keyword clustering plus hand reading, so treat them as ±20%. Every pattern below appeared in at least two sources unless marked.

## Findings

The existing [coding guidelines](../../../../docs/guidelines/code.md) cover naming, function size, parameters, and style. Almost none of the accepted review comments are about those. The failures are blind spots about inputs, failure, state, and tests, and the guidelines barely mention them.

Patterns are stated without reference to a language. JS/TS specifics are under [JS/TS specifics](#jsts-specifics).

### 1. Tests that cannot fail

The largest category in recent PRs: ~19% of accepted code comments in PRs 241–485, ~10% in 1–240.

- The test name promises something the assertions do not check. Example: `shouldFallBackToOneLevelForACycle` only checks that both packages are present.
- The test passes for the wrong reason, such as validation failing early. A "throws TypeError" test only matches a substring of the message.
- The fixture cannot tell the cases apart. Example: a hover color that is already non-transparent at rest.
- The test asserts current output, so it locks a bug in instead of checking the documented contract.
- The test substring-matches source text, which a comment can satisfy.
- A new rule or branch has no test at all.
- Right: make each new test fail once against broken code before keeping it, and assert the exact claim in its name. The owner verified fixes this way (PR 77).
- Evidence: PR 14 r3767562647, PR 36 r3895049240, PR 188 r4167009019, PR 286 (65 threads), thread "Validation Package Audit".

### 2. Partial input validation

~25% of accepted code comments in PRs 1–240, ~9% in 241–485.

- Only the happy path is checked. Empty, whitespace-only, NaN, Infinity, unknown enum values, values out of order (`min > max` with a NaN bound), oversized input, and non-well-formed Unicode get through.
- The value is validated before conversion and not after. `1e308` seconds × 1000 becomes Infinity.
- An `else` branch catches unknown enum values and runs a real action. An unknown isolation mode edited the real tree.
- Character classes do not match the spec: `\s` matches NBSP where the spec means ASCII whitespace, and a lone surrogate gets through.
- Right: validate the final value. Reject degenerate and unknown values explicitly. Use an exhaustive branch with no catch-all action.
- Evidence: PR 14 r3767562579, PR 147 r4108670290, PR 159 r4127904157, PR 286 r4300152658, thread "Store Package Pre-Release Audit".
- Scope limit: reviewers rejected validation of developer-only configuration and of values a previous step already validated (PRs 296, 370). See [What not to add](#what-not-to-add).

### 3. Failure reported as an empty or successful result

- A catch-all returns the same value as a legitimate empty result:
  - `readdir` failing becomes `[]`.
  - `git tag` failing becomes "no tags".
  - An offline `npm view` becomes "unpublished, ready to release".
  - A `ps` failure becomes "no live descendants".
- A command or check reports PASS or exits 0 when nothing ran: an empty selection, a misspelled command, or a wrongly cased Windows path that matches nothing. The Tools audit had a whole section called "Green without doing the work".
- Code branches on the text of an error message instead of on a code or type.
- The error type or message names the wrong rule.
- Right: treat only the specific error that means absence, such as ENOENT or E404, as absence, and rethrow everything else. Fail closed. Treat "no work done" as a failure, or report it.
- Evidence: commits `474f9298`, `889a83ab`, `204472ac`, `3933f03a`; PR 296 r4305126452; PR 460 r4465115437; PR 135 r4058540707.
- The guidelines say "do not swallow errors", and agents did not recognize these as swallowing.

### 4. Text placed in another language without that language's escaping or parser

This covers HTML, XML, CSS, Markdown, YAML, JSON, shell and cmd, URLs, regex replacement strings, and inline `<script>`/`<style>`.

- Interpolating raw values: `innerHTML` with user input (XSS), a sitemap `<loc>` without XML escaping, `*/` in a CSS comment, `$&` expanded in a replacement string, `</script` or U+2028 inside an inline script.
- Parsing a structured format with ad-hoc regex or a line scan:
  - `</script >` or `</SCRIPT>` was missed.
  - `rel` matched `data-rel`.
  - An apostrophe in "Don't" broke a quote scanner across six review rounds (PR 327).
  - YAML trailing comments became part of a value.
  - Imports inside comments were counted.
  - `git diff` output was split by lines instead of using `-z`.
- Matching a prefix or substring without a boundary: `/callback` accepts `/callback.evil`, and `en-` matches `en`.
- Over-escaping: raw template strings received doubled backslashes (PRs 342, 361).
- Right: name the target language. Use its parser or serializer, or a machine-readable output mode. Otherwise escape for that exact context and test with its metacharacters.
- Evidence: PR 22 r3843543258, commits `1c9dd856`, `dc2d56e2`, `0ba72f36`, `f347cfec`, `5bb9d40b`; PR 288 r4302725464.

### 5. An option or fix applied to one path but not its siblings

- `--bail` was ignored for the primary units.
- A computed timeout was not used by the supporting commands.
- `update()` ignored an option that `create()` honored.
- `pick` was fixed, but `omit` and `required` were not.
- The promise variant ignored the defaults.
- svg mode lacked what css mode masked.
- Right: when adding an option or fixing a path, list every entry point and sibling (create and update, overloads, variants, render modes, every event source), and test each one.
- Evidence: PR 14 r3767562603, PR 137 r4066538790, PR 239 r4211438817, PR 294 r4304802805, thread "Error Package Pre-Publish Audit".

### 6. State changed before a step that can fail; caller input trusted too long

- Code assigns config, consumes a token, caches, or persists, and then runs a step that throws. The change is left half-applied, or a partial result is cached.
- Code keeps a reference to caller-owned input and reads it later or twice, such as options read when a queued job runs, or a getter read once to check and again to use.
- Code shares a mutable default or an internal list with callers.
- Code mutates the receiver in a builder, so `base.max(5)` and `base.min(10)` become one schema.
- Caller input is spread after fields the code controls and overrides them, such as headers or computed props.
- Right: validate and compute first, and commit state last. Never cache a failure. Copy untrusted input once at the call. Return new instances. Apply protected fields after caller input.
- Evidence: commits `998c6e9b`, `a7dd220a`, `9be7f4ff`, `f09b049c`, `9d2e71e7`, `ee9ace21`; PR 155 r4120964861; PR 367 r4355082996; PR 400 r4422624440; PR 286 r4300152511.
- Scope limit: snapshotting getters was rejected for trusted callers (PR 370) and accepted for untrusted input (PRs 307, 469).

### 7. An explicit "absent" value treated as a value

- A key that is present with the language's absent value (`undefined`, `None`, `nil`) overrides a default, wipes a stored value, or satisfies a required field. A falsy check (`!key`) rejects legitimate empty values.
- Right: decide per option whether "present but absent" means omitted, and test that call shape.
- Evidence: commits `16949cfe`, `c2ea50b7`, `04a241e8`, `e16a101c`; toaster, store, and theme audit threads (PRs 402, 454, 370).

### 8. Unbounded work and resources

- ReDoS from overlapping quantifiers (13 commits, plus CodeQL alerts).
- Quadratic rescans.
- Recursion or spread arguments that overflow the stack on large input.
- Buffering a whole response before checking its size.
- A child process killed without its process tree.
- Listeners and timers never torn down.
- Async work that finishes after its owner has moved on, leaving stale state.
- Waiting for an event that never fires on cancel.
- Right: bound size, depth, and time on input you do not control. Prefer linear scans. Pair every subscription with its teardown. Re-check ownership after every await.
- Evidence: commits `5734033c`, `a5bf7e1c`, `d06e01d6`, `a635e2ac`, `7d7a99a8`, `5e3987dc` and `2e621e7d` (the same bug fixed twice); PR 24 r3875960176; PR 297 r4305383640.

### 9. Paths and files

- Persisted or configured paths are used without a containment check (`"../../victim"`).
- The containment check is itself wrong: `rel.startsWith("..")` rejects `..cache/`.
- Symlinks are not resolved.
- Stale files remain in an output directory.
- A shared file is written non-atomically while another process reads it.
- Right: resolve the path and require it to stay inside the root, and clear the output before generating into it.
- Evidence: PR 24 r3875960231, PR 25 r3888570403, PR 293 r4304630356, commit `2c6ae2ef`.
- Scope limit: atomic temp-file-plus-rename was rejected for files a person reviews before committing (PR 296).

### 10. Contract text out of sync with behavior

- The second-largest category in recent PRs, at ~14%.
- A change adds a throw, limit, or branch, while the doc comment, `@throws`, README, CLI help, or inline comment still describes the old behavior. Doc examples do not compile.
- Right: in the same change, search for the symbol's name in docs, help text, and comments, and update them. Run doc examples.
- The guidelines cover this, and agents violated it anyway.

### 11. Types that lie about runtime behavior

- A conditional type always resolves to `unknown`.
- A predicate narrows to `never`.
- An async result matches the sync overload.
- `encode` is typed with the output type but receives the input type.
- `Partial` allows an absent value for a required field.
- Right: write type-level tests for exported generics, paired with a runtime assertion.
- Evidence: PR 156 r4123203861, PR 235 r4208645418, PR 241 r4211539295, commits `0da88845` and `92ef8226` (flipped twice).

### 12. Platform, engine, locale, and time assumptions

- Code relies on user-agent sniffing, engine-specific error messages, `instanceof` across realms, case-sensitive paths on Windows, or shell-specific quoting.
- Dates and sort order depend on the host's time zone or locale.
- Code uses APIs missing from supported engines.
- Right: feature-detect, pass an explicit locale or time zone, and use the platform's path and process APIs.
- Evidence: commits `720de81d`, `3069d999`, `bf829057`, `0a2fe258`, `616c23ae`; PR 398 r4416056102.

### Smaller groups

| Pattern                                                                                                 | Evidence                | Right                                                  |
| ------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------ |
| Wrong sort key or representation: ISO strings sorted as text, unit chosen before rounding (`1000.0 kB`) | PRs 296, 297, 303, 392  | Parse before comparing; round before choosing the unit |
| Flaky timing in tests: fixed sleeps, timing ratios with thin margin                                     | PRs 18, 120; `a5334766` | Poll for the condition                                 |
| An observer reacting to its own writes                                                                  | PRs 306, 311            | —                                                      |

### Process failures that lowered code quality

From the T3 threads:

- **Claimed behavior without checking.** Five cases, including a CSS cascade table and an audit claim that were both wrong.
- **Line endings.** Scripted edits rewrote line endings, 13 files in one package.
- **Tests not run first.** Test-first was skipped, or new tests were never run against the old code.
- **Partial checks.** Fixes were verified with unit tests only, and they broke size budgets, browser suites, or hand-written callers.

## What not to add

Reviewers rejected these. A rule that pushes toward them adds review work instead of removing it.

- Validation and limits for trusted, developer-only input, or for input a previous step already validated.
- Handling for inputs no current caller or document produces (YAGNI).
- Atomic writes or getter snapshots as unconditional rules. Both depend on who controls the input.
- Exotic type-level and engine corner cases (about 35 unanswered comments on PR 235).
- New public API, new throws, or new exports added as part of a "fix". Those are decisions.
- Removing duplication across package boundaries.
- Norms from linters the repository does not use.
- Micro-optimizations on rarely reached paths.

## JS/TS specifics

These are candidates for a language adapter. Each item has at least two occurrences.

- **Object keys.** Plain-object maps keyed by input break on `__proto__`, `constructor`, and `toString`. Store input-keyed entries in a `Map` or `Object.create(null)`, because `Object.hasOwn` only makes reads safe: writing an object under `__proto__` changes a plain object's prototype. Read with `Object.hasOwn`, and use `Reflect.ownKeys` when symbol keys matter. This pattern is rising in recent PRs.
- **`undefined` in spreads.** `{...defaults, ...options}` copies `undefined` over the default. `exactOptionalPropertyTypes` is enabled only in `packages/theme`.
- **`String.prototype.replace`.** A string replacement expands `$&`, so use the function form.
- **Inline scripts.** `JSON.stringify` inside an inline `<script>` must also escape `<`, U+2028, and U+2029.
- **Large spreads.** `arr.push(...big)` and deep recursion throw RangeError on large input.
- **Stateful regexes.** A regex with the `g` or `y` flag keeps state across `test()` calls when reused.
- **Date parsing.** `new Date(string)` is implementation-defined and rolls over invalid dates.
- **`localeCompare`.** Without an explicit locale, the result depends on the host.
- **Child processes.** `spawn` with `shell: true` followed by `kill()` leaves the process tree running. A stream without an `'error'` listener crashes on EPIPE. `toString` per chunk splits multibyte characters, so use `setEncoding`.
- **Realms.** `instanceof` fails across realms, so check brands instead.
- **Bundler side effects.** A bundler can delete a call to a built-in it assumes is pure when the result is unused. This is a trap in `packages/oidc/AGENTS.md`.
- **Node type stripping.** Node rejects parameter properties and `enum`, while tsc and Vitest accept them. This is a trap in `packages/tools/AGENTS.md`. `erasableSyntaxOnly` is off.
- **Accessibility in demo HTML.** Dialog focus, accessible names, `aria-current`, reduced motion, and focus indicators were missing.

## Baseline without the skill

Run on 2026-11-06 with the four scenarios in [coding-skill-eval.md](coding-skill-eval.md), on haiku, sonnet, and opus, with the other installed skills available. Graders checked each run by probing with hostile inputs and by breaking the code to see whether its tests failed. They did not rely on the agents' summaries.

| Item                                     | haiku   | sonnet  | opus    |
| ---------------------------------------- | ------- | ------- | ------- |
| S1.1 final value validated               | PARTIAL | PARTIAL | PARTIAL |
| S1.2 setup and target paths              | FAIL    | PASS    | PASS    |
| S1.3 process tree stopped                | PARTIAL | PARTIAL | PASS    |
| S1.5 tests catch broken code             | PARTIAL | PARTIAL | PARTIAL |
| S2.1 explicit undefined                  | PARTIAL | PARTIAL | PARTIAL |
| S2.2 prototype keys                      | PASS    | PASS    | PASS    |
| S2.3 validation of query and stored data | PASS    | PASS    | PASS    |
| S2.4 storage write failure               | PARTIAL | PARTIAL | PARTIAL |
| S2.5 no shared mutable state             | PARTIAL | PASS    | PASS    |
| S2.6 tests catch broken code             | PARTIAL | PARTIAL | PARTIAL |
| S3.1 XML escaping                        | PASS    | PASS    | PASS    |
| S3.2 frontmatter parsed or rejected      | PARTIAL | FAIL    | PARTIAL |
| S3.4 CI fails on bad or missing content  | PASS    | FAIL    | FAIL    |
| S3.5 base URL validated                  | PASS    | FAIL    | PASS    |
| S3.6 tests catch broken code             | PASS    | FAIL    | PARTIAL |
| S4 proportionate one-off script          | PASS    | PASS    | PASS    |

What still fails, with the evidence:

- **Validation stops before conversion.** All three models accepted `--timeout 1e308` and `--timeout 3000000`. Both exceed the timer's maximum, so the command was killed after 1 ms. They checked the seconds and not the milliseconds the timer receives.
- **Missing input becomes an empty success.** Sonnet and opus wrote an empty sitemap and exited 0 when `content/` was missing, in a script the prompt said gates a deploy.
- **Tests don't cover the decisions the code makes.** Every model handled `set({ theme: undefined })` correctly, and no model tested it. A mutant that wipes the field passed every suite. The tree kill (haiku, sonnet), the escaping (sonnet), and the degenerate validation values (all three) were untested too. Sonnet's timeout test uses a margin shorter than Node's startup time and failed 1 run in 4.
- **Write failures swallowed or half-applied.** Sonnet and opus silently drop storage write errors. Haiku applies the change in memory, then throws, and its doc comment does not say so.
- **Hand-written parsers mis-parse instead of rejecting.** All three accepted `slug: x # comment` as a slug containing the comment, and ignored `Draft: true`. Sonnet published pages marked `draft: true # wip`.
- **Sibling paths.** Haiku left setup commands without a timeout. Sonnet's setup path kills only the shell.
- **Unflagged side effects.** Sonnet and opus put targets in their own process group, so Ctrl+C no longer reaches them on POSIX. Opus changed an exported function from sync to async.

What current models already do without the skill: escaping for an obvious sink, prototype-key safety, enum and number validation of input labeled untrusted, `get()` copies, proportionate one-off scripts, and no unrequested dependencies. The skill should not spend lines on these. Their historical failures happened where the input was not obviously untrusted, so the skill's lever is noticing the boundary, not knowing the fix.

## Rounds with the skill

Through round 8, each round froze a copy of the skill, ran every scenario once per model in an isolated copy of its fixture, and had a separate grader (claude-opus-5-5 from round 4 on) probe the result and run its own mutants against the tests. Round 9 changed the grading, as described below. The skill was changed between rounds, never during one. Through round 8, a round passed when the two strong models passed every scenario graded that round; gemini-3.8-flash is graded and reported but cannot block a round (decided before round 6, applied to round 5 too).

| Round | Models                                                                     | Outcome       | Main findings                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | -------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | haiku, sonnet, opus (S1 to S3)                                             | Feedback      | Tests killed most but not all mutants in every run; haiku's S2 tests let 7 of 26 survive.                                                                                                                                                                                                                                                                                                                                                                       |
| 2     | haiku, sonnet, opus (S1 to S3)                                             | Feedback      | S1 tests killed every mutant for haiku and opus; S2 survivors remained.                                                                                                                                                                                                                                                                                                                                                                                         |
| 3     | haiku, sonnet, opus (S1 to S3, S5)                                         | Feedback      | Added design items and S5. haiku printed stack traces for its new errors, and asked about refactors less reliably than sonnet and opus. Runs used the native agent tool.                                                                                                                                                                                                                                                                                        |
| 4     | gpt-6.1-sol, gemini-4-argon, gemini-3.8-flash (S1 to S5)                   | Feedback only | Switched to non-Claude models. Found a contaminated flash run (rerun in isolation) and prompt clashes with the sandbox.                                                                                                                                                                                                                                                                                                                                         |
| 5     | gpt-6.1-sol, gemini-4-argon, gemini-3.8-flash                              | Pass          | gemini-4-argon hit its quota during S1, which was rerun on claude-sonnet-5-5. flash failed S1 (setup timeout left the grandchild running) and S2 (18 visible mutant survivors).                                                                                                                                                                                                                                                                                 |
| 6     | gpt-6.1-sol, claude-sonnet-5-5, gemini-3.8-flash                           | Fail          | S2, S4, S5 passed. sol's S3 tests asserted only that a rejection named the file, so 11 of 43 mutants survived, including a crash on a page without `updated`. S1 was not graded.                                                                                                                                                                                                                                                                                |
| 7     | gemini-4-argon, claude-sonnet-5-5, gpt-6-luna (S1 to S5, H1 to H3, N1, N2) | Fail          | argon passed 4 of 10, sonnet 5 of 10, luna 2 of 10. The most common failure was doc comments on a script's or app's internal functions (X1). Both strong models stopped H3's cleanup at the first failed delete; argon built a web server and HTTP API for N1, and its S1 setup timeout left the tree running; sonnet's H1 stopped every Node process by name. N2 kept every contact in both strong runs. All six N1 and N2 baselines without the skill failed. |
| 8     | gemini-4-argon, claude-sonnet-5-5, gpt-6-luna                              | Fail          | argon passed 5 of 8 (H1 and H2 lost to quota), sonnet 4 of 10, luna 0 of 1 graded. Every sonnet failure was X1 alone, with docstrings on classes, constants, and test helpers as well as functions. argon's N2 removed duplicate contacts while loading, so the next save deleted them without approval; its S1 tree-kill test passed on Windows without the kill. luna's S1 had no interrupt or tree test.                                                     |
| 9     | claude-sonnet-5-5 (deciding), gpt-6-luna (reported); S1, S3, H1, N2        | Pass          | sonnet passed 4 of 4, graded by `check.py` and a reading of each diff and reply instead of a grader session per run. luna failed 4 of 4 on rules the skill already states.                                                                                                                                                                                                                                                                                      |

In round 6 the second slot ran on claude-sonnet-5-5 through Claude Code, after gemini-4-argon and then claude-sonnet-5-5 on Antigravity ran out of quota at launch.

The loop first stopped after round 6 to save quota, short of the planned two consecutive passing rounds, and resumed with round 7 after the held-out scenarios were added. Rounds 5 and 6 found mostly single runs not following rules the skill already had, not missing rules. Two rules were added after round 6 and were in the skill from round 7 on:

- A rejection test asserts which rule rejected the input, not only that it failed.
- When reading stored data throws and the code falls back to defaults, it does not save over the stored data until a read succeeds.

What stayed weak across rounds: gemini-3.8-flash ignored the stop-and-ask instruction in S5, the `spawnSync` timeout trap in S1, and the scale rule in S4 (39, then 52, then 93 lines). Every strong-model run asked before refactoring in S5 and kept S4 short.

Graded runs, grade reports and mutant helpers stayed in the local temp directory and are not committed.

Round 8 notes. Runs went through T3 Code's providers, with the claude-opus-5-5 grader per run. When a model asked a question, the simulated user accepted its recommendation. Without one, the simulated user took the plainest reading. No baselines ran, and each model used its default effort. sonnet's doc comments were not caused by its Claude Code harness: no user instruction or skill on that machine asks for them. A grader failed sonnet's N2 for asking which country code to assume. That is disputed, because the fixture's numbers mix formats. luna's first S4 turn asked whether it could read the skill, because the run prompt said not to read files outside the project; later prompts allow it. Graders running four at a time leaked Claude processes, which were stopped by process ID.

Rounds 7 and 8 ran about 30 runs per round, each graded by its own Opus session, and every round failed on something new. With that many samples, one run's slip fails the round, so the loop could not converge and used too much quota. From round 9 on:

- Fix whole failure classes, not single runs. After a round, look for where else the same mistake can happen, fix the skill there too, and rerun only the scenarios that failed.
- One deciding model per round, with a second model reported for information only. gpt-6.1-sol, gpt-6.1-terra and gpt-6-astra were refused on the ChatGPT account Codex used, and Antigravity's quota was spent, so round 9 was decided by claude-sonnet-5-5 through Claude Code, with gpt-6-luna reported.
- A script (`check.py`, kept with the run helpers) does the mechanical checks: changed files, doc comments added, the tests' result, files the tests left behind, and N2's data file. The judgment items are graded by reading the diff and the reply, in the orchestrating session, without a grader session per run.
- A round passes, and the skill is ready, when one targeted round has no correctness or data-loss failure on the deciding model. This is weaker than the earlier bar of two consecutive passing rounds: it rests on one run per scenario, on scenarios the skill was revised against.

Round 9 ran S1, S3, H1 and N2, chosen to cover each round 8 failure class: doc comments (S3, H1, N2), data loss (N2), and process trees (S1). sonnet's H2, H3 and N1 failed round 8 only on doc comments and were not rerun. The round ran after a Verify step was added that searches the diff for doc comments off the public API. sonnet passed all four, graded by `check.py` and a reading of each diff and reply, with no grader mutation checks; the runs reported their own line-breaking checks. S3 passed with X1 partial for one test-helper docstring, as round 8's grader graded the same case. Its doc comments fell from 13 blocks in round 8's S3 to a module docstring and one test helper. N2 kept every contact and asked first. The S1 tree test checked the grandchild while the runner was still alive, and the POSIX-only Ctrl+C test was reported unverified on Windows. gpt-6-luna failed all four for rules the skill already states:

- N2 dropped duplicates while loading, so the next save deleted them without asking.
- S1 put the target in its own process group without forwarding Ctrl+C.
- H1 had no body limit, no 500 on a failed save, and no injected clock.
- S3's parser rejected the fixture's own `# TODO` frontmatter line, so the build fails on the real content.

luna's results suggest a weaker model skips stated rules more than it lacks them, which more skill text is unlikely to fix.

## Since round 6

Nothing below has run against a model; run the [held-out scenarios](coding-skill-eval.md#held-out-scenarios) before relying on it. To cut dilution, `SKILL.md` went from about 4,300 to 2,100 words, with test technique and the edge checklist moved to references, and it was then revised after two content reviews. These outcomes stand:

- Asking before a refactor is now required only for one beyond the change or one that changes behavior, so S5 runs may no longer stop to ask; S5.2 passes either way.
- Three TypeScript items have no recorded occurrence here: `sort()` without a comparator, `noUncheckedIndexedAccess`, and `Promise.all` failing fast. Remove them if an eval shows they cost more than they catch.
- Rejected review finding: ASCII whitespace does not include vertical tab. The WHATWG definition is tab, LF, FF, CR, and space.

## Adding a language reference

Each language gets one file, `skills/coding/references/languages/<language>.md`, named in the routing line in `SKILL.md`. Use the sections of `typescript.md`, dropping any with nothing to say:

1. A short intro naming the runtime and compiler versions the unmarked items hold for, and where to find the project's version.
2. **Conventions when the project has none:** compiler or linter settings, type and module conventions, naming, and the doc comment format.
3. One section per trap family the general rules point at: numbers and conversion, maps and absent values, text in other languages, dates and locale, processes and streams, errors, types, and packages.

Each item is a trap with the version it needs, not style advice the language's own tooling already enforces. Prefer items seen at least twice in reviews or eval runs, as the JS/TS list above was, and mark any item added without that evidence in this document.
