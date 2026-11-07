---
name: coding
description: Writes and changes code that is well structured, consistent, and correct on real inputs, failures, and state, with tests that prove each behavior. Use on every task that writes, adds, fixes, or refactors code in any language, including features, bug fixes, new options or flags, parsers, CLIs, build and CI scripts, libraries, and their tests. Not for reviewing or auditing existing code, or for non-coding requests.
metadata:
  short-description: Write well-built code that handles inputs, failures, and state
---

# Coding

This skill sets how code is built where the project is silent, and closes the edges where code fails: values that pass a check and break what uses them, missing input, failed writes, paths nobody updated, and tests that pass against broken code. Its rules are part of the smallest correct change, not extras.

The project's own conventions, checks, and instructions come first. Before writing code, read the reference for its language: [TypeScript and JavaScript](references/languages/typescript.md). A language without one follows its standard conventions. Before writing tests, read [references/testing.md](references/testing.md). When the task starts a project, adds a module, service, data model, storage, public API, or dependency, or asks how to structure something, read [references/design.md](references/design.md).

## Before Changing Code

Read the code the change touches and its neighbors: module layout, similar features, names, and patterns. Decide where the change belongs before how to write it.

When the existing structure would make the change worse, notice it: a function that would gain another job, duplicated logic the change must also update, a file mixing unrelated features, state shared through globals, or I/O wired into logic so it cannot be tested. When the change can be made correctly and locally, make it as asked, update every copy it touches, do not copy the bad pattern, and name the problem and the refactor that would fix it in the final report; never make a refactor beyond the change, or one that changes behavior, without asking. Only when the change cannot be made correctly without such a refactor, propose it first with the problem, the refactor, and its size, and ask whether to refactor or make the change as asked anyway; when nobody can answer, end with the question instead of the change. Pin behavior with a test before a refactor moves it.

Assume the person asking may not be able to judge code. Ask only about what they will notice: behavior, data changed or deleted, cost, security, and anything hard to undo, with plain-word options, what each costs, and your recommendation. Decide technical internals yourself with the defaults below, and name in the final report each one a later reader might question, such as the storage, the module layout, or a rejected alternative.

## Design Defaults

Where the project sets no convention, use these the same way across the whole change:

- **Names:** the language's conventions, one style throughout. Name by domain meaning (`unpaidInvoices`, not `data`); functions are verb phrases, booleans read as questions (`isExpired`), and collections are plural.
- **Functions:** one cohesive job each; an atomic operation such as `compareAndSwap` is one job. At most two parameters; past that, one options object, except for framework callbacks and APIs where an object would hide meaning. Return early instead of nesting. Replace a boolean parameter that switches between two behaviors sharing little code with two functions.
- **Values:** a literal with domain meaning or more than one use gets a named constant (`MAX_RETRIES`). Protocol strings, one-off messages, and test fixtures stay inline.
- **Dependencies:** pass I/O, clocks, randomness, locale, and configuration in as parameters instead of reading globals or creating a concrete client inside logic. Add no interface or container for a single implementation.
- **Modules:** code that changes together lives together. A module that needs a second file gets a folder with one entry point exposing its public surface. Dependencies point one way: shared code never imports feature code, and imports never form a cycle.
- **State:** immutable values and bindings over shared mutable state; composition over inheritance.
- **Duplication:** reuse what the codebase has. Extract shared logic once a second real copy exists and both change for the same reason.
- **Async:** await or handle every promise, future, or task. Run independent work concurrently, bound it over input-sized collections, and pass cancellation to every call that accepts it; where a call cannot be cancelled, check for cancellation between operations.
- **Errors:** handle an error where the code can act on it, otherwise propagate it with context. Catch only expected errors, branch on codes or types, never message text, and use the language's usual mechanism consistently.
- **Types:** type public functions explicitly, avoid `any` and unchecked casts, and model state so invalid combinations cannot be built.
- **Public surface:** export only what callers need. Add no compatibility layer, alias, or deprecated path unless a real caller, stored data, or shipped behavior needs it.
- **Determinism:** the same input and state give the same output. Keep input order and any order a contract defines. Sort output whose order is unspecified, such as a directory listing, a hash map, an unordered query, or results gathered as they complete, by a defined key with a tie-breaker.
- **Messages to people:** one line saying what happened, why when known, and what to do next, in plain words; raw error text, stack traces, and internal names go to logs. Advise retrying only when it is safe.
- **Logging:** log what an operator would act on, with context to find the cause, and never secrets or personal data. Logging an error is not handling it.
- **Documentation:** every public function or type gets a doc comment in the language's standard format saying what the signature does not: units and ranges, what empty results mean, side effects, and each error and when. Update the README, help text, and docs the change affects.
- **Comments:** explain why, never what. Delete commented-out code and comments the change made stale.
- **Portability:** use only APIs that exist in every environment the code runs in, and the platform's path and process APIs.

## Hard Rules

1. **Validate converted input against what consumes it.** When outside input is parsed, scaled, unit-converted, merged, or decoded, check the value the timer, array, or protocol receives against that consumer's limits: `--timeout 1e308` passes "positive number" and becomes Infinity milliseconds. Reject degenerate raw values too: empty, whitespace-only, NaN, Infinity, partial numbers such as `10s`, unknown enum values, and `min > max`. Messages and docs state each limit from the check's constant.
2. **Fail with a message naming required input that is missing or matches nothing**, unless the task says empty is valid: a missing directory, a glob that selects nothing, a command not found, an absent required field. Treat only the error that means absence (`ENOENT`, 404) as absence, and rethrow the rest. A cleanup with nothing to do succeeds and says so. A run whose output replaces earlier output or gates a deploy fails on zero items: a sitemap build never writes an empty sitemap and exits 0 because its content directory is missing.
3. **Prove every behavior decision with a test that fails when the decision is reversed.** A decision is each edge case handled and each behavior the task did not spell out: what an explicit `undefined` means, which values are rejected, what happens when a write fails, that cleanup runs. Write the test first and watch it fail for the expected reason. A test written after its code, such as one pinning behavior before a refactor, is proven by breaking the line it covers. A decision whose test was never seen failing is reported as unverified.
4. **A hand-written parser rejects syntax it does not support**, with an error naming the file and line, after supporting every construct the real input already uses. A `key: value` scanner rejects `slug: x # comment` and `Draft: true` instead of storing the comment or ignoring the flag. Use the format's real parser, or a machine-readable output mode such as `--json` or `-z`, when one is available without a new dependency.
5. **Cover every sibling path.** When you add an option or fix a path, list every place the same input or behavior flows: each source of the value (arguments, query string, stored data, files), setup and main commands, sync and async variants, create and update, each mode, and every caller of a patched function. Change and test each, or name it in the report with the reason.
6. **Commit state only after a write succeeds, and never swallow a write error.** A write is any step that persists or sends. Validate and compute, write, then update in-memory state; when state must change first, surface the error and document that the change stays applied. Never cache a failure. A call that changes nothing makes no write.
7. **Ask before a change to public API or shared process behavior the task did not ask for, and report every such change:** an exported signature (including sync to async), a default, an error type, a CLI flag, an exit code, a file format, signal handling, process groups, environment variables. Prefer a design that avoids the change, or limit it to when the new feature is in use: a child put in its own process group no longer gets Ctrl+C, so do it only when the timeout is set, and forward the signal.
8. **Never make a check pass by weakening it, and never present unfinished work as done.** Fix the code, not the test, type check, or lint rule: no skips, loosened assertions, or casts, and no ignore comment on a correct finding. When a check is wrong, change it, or record a scoped exception where the project allows one, as a separate step, and say why. Never deliver a stub, placeholder, or hard-coded result as working code; name what is not done.

## Judgment

### Who controls the input

The hard rules apply where input comes from outside the code's control: users, CLI arguments, URLs and shared links, files, network responses, environment variables, other processes, and stored data an earlier version wrote. Data that looks internal often crossed one: a preference read from storage came from a shared link last week. Find that boundary before writing, and check each edge in [references/edges.md](references/edges.md) that the change touches. Trust developer-only configuration, values already validated, and your own code's return values, and add no checks there.

The caller or the person running the command gets a clear error for a bad value. Bad optional input from a third party, such as a shared-link parameter, is dropped while the rest keeps working, unless dropping it widens access or changes money: a malformed expiry, permission, or price is rejected.

### Scale to the code's life

When the request itself calls a script one-off or throwaway and it runs locally, that is approval to skip tests; say in the report that it has none. Keep it to one file read top to bottom, with no helpers used once, no argument parsing or validation layer, and no README section. Rule 2 still holds in one line. A script that deletes, moves, or overwrites files or data gets the full rules and tests however short its life, and asks before a run that cannot be undone. Everything else gets the full rules, except tests the user approves skipping for that exact change, such as a bug fix that cannot be reproduced; the report names the change as untested.

### What not to add

Unless the task or the code's real use calls for them: handling for inputs no caller or file produces; atomic writes or snapshots where no other process can race and no failed write destroys the only copy; exotic type-level corner cases; dependencies for what a few lines do; lint norms the project does not use; micro-optimizations off the hot path.

## Verify

- Run every check the project requires for the changed packages, and every gate the repository makes mandatory: tests in each environment they run in, type checking, linting, formatting, builds, and size limits. Name any check that could not run.
- Run each error path the change adds through the real entry point, with a bad value for each call that parses, decodes, or converts input, and read what the person sees.
- Search for each changed symbol in doc comments, README, and help text, and update what describes the old behavior.
- Run the code on the project's real input. When valid existing input fails the new checks, the checks are wrong: loosen them, or ask before changing the data.
- Confirm behavior claims by running the code, and each library API exists in the installed version, from its types, source, or docs.
- Keep the diff to the task and each file's line endings. Check `git status` after the tests: an unexpected file means a test writes into the project.

## Final Report

Report in this order. A change with no behavior decision and no public change reports only Checks and any item that is not empty.

- **Structure:** problems found in the existing code and the refactor proposed or the answer given, or "none found".
- **Decisions:** each behavior decision, with the test that proves it or "unverified", and each technical default a later reader might question.
- **Siblings:** paths covered, and any left out with the reason.
- **Public API and shared behavior changes**, one per line, quoting the words that asked for it or marked "not asked".
- **Checks:** each command run and its result. Name failures and skipped checks plainly.
