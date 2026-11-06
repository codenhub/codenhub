---
status: APPROVED
last_updated: 2026-11-05
scope: What `@codenhub/validation` builds toward, what it takes to release 0.5.1, and what it takes to reach 1.0.
---

# Roadmap

## Purpose

This records what `@codenhub/validation` is building toward, what it takes to release 0.5.1, and what it takes to reach 1.0. The design it builds toward, and why, is in [architecture.md](architecture.md). Nothing in it names a consuming package: the package is for any package or app that has to check a value, and a list of expected adopters would go stale and imply they are the only ones.

## Direction

- **One place for validation.** Checking a value has more edge cases than it looks: other realms, prototypes, getters, hostile input, what an error may reveal. A package that checks its own input by hand takes all of them on, and its reviews with them. This package handles them once, so a fix here reaches every package that validates with it, and each of those is reviewed for what it is for.
- **For data nobody controls.** The edge cases this package handles are those of input from outside the program: a form, a request, a query string, stored data, a file. That is where one place for validation pays for itself. A package that only checks the handful of options a developer passes it is checking a mistake, not hostile input, and hand-written checks stay cheaper for it in bytes: measured, about a sixth of the cost for five options (see [Who gains from adopting](architecture.md#who-gains-from-adopting)). Such a package may adopt this one, and none is expected to.
- **Taken as an argument before it is taken as a dependency.** A package that hands data from outside to its caller, such as stored state or the parameters of a URL, serves its users best by accepting a validator from them: `Validator<T>` is a type, which costs nothing to import, and a Standard Schema is accepted by any library that follows the specification. Then only the applications that validate pay for it.
- **The best validation library we can build.** The package exists to answer "is this value what I need it to be?" well, for anyone, and to be the one a team picks for that on its merits, not only the one this workspace uses. The workspace packages that validate their configuration are consumers of it, not the reason for it.
- **Short, predictable and complete.** A single value is validated with one call. The common constraints are options, the rare ones are checks, every validator takes the same arguments in the same order, and a custom validator is built with the same helpers as a built-in one and behaves exactly as one.
- **Small by construction.** A consumer's bundle contains only the validators and checks it imports, and budgets in the test suite hold that line.
- **The contract is ours.** Plain-data results and issues, no dependencies, and no dependency on any other workspace package.

## Current Focus

**0.5.1 closes what the review after 0.5.0 found.** 0.5.0 was released on 2026-11-05, with the README and the guides in Brazilian Portuguese and Spanish. Since then, `spanishMessages` has been added, and `base64`, `jwt` and `creditCard` no longer overflow the stack on text of a few megabytes. An exclusive date bound that a custom validator reports is now worded without "on or". Each of these is a fix or an addition, so the next release is 0.5.1, as [Versioning until 1.0](#versioning-until-10) asks. The owner chose that number on 2026-11-05 over 0.6.0, since a minor version tells a reader to look for a breaking change.

0.5.1 also takes in the work below, each decided by the owner on 2026-11-05:

- **The keys an `object` does not list, validated.** `unknownKeys` accepts a validator as well as `"strip"`, `"strict"` and `"passthrough"`, and each key the shape does not list is validated with it, as zod's `catchall` and valibot's `objectWithRest` do. `intersection(object, record)` is no way to write it, since the `record` validates the listed keys too. Rejected: a separate `rest` option, which would need a rule for when it meets `unknownKeys: "strict"`, and a separate `objectWithRest`, which repeats `object`.
- **`transform` typed as it runs.** A `convert` that returns a value with a callable `then` makes the result asynchronous at run time, since `await` treats it as a promise, and the type says so too, even where the value is not typed as `PromiseLike`. A program it changes was already given a promise where its type promised a result.
- **Closing the gap to zod/mini without changing what any validator returns.** The package is about 1.2 kB gzipped larger than zod/mini on a typical form, the bar [The bar for size](architecture.md#the-bar-for-size) sets, measured on 2026-11-05. The bytes come out of the core and the fast path, and every result and message stays as it is. The brief English messages that each validator's own `~standard` reports are 1.15 kB of that form; they stay as they are for now. Rejected: shorter wording for them, which changes what a Standard Schema consumer shows, and dropping the built-in `~standard`, which breaks callers. Each step is measured as that section measures, and the budgets reset from it.
- **A fast test under `lazy`.** A `lazy` tree of 127 nodes runs at about 0.013 million validations a second, and what is left is the full work of each `object` and `array` in it, which a `lazy` asks no fast test of because it calls the consumer's function. A fast test that asks what that function returned, once it has, would need to count `maxDepth` and `maxCalls` as the full work does, and to give the same answer for an object found again.
- **An `object` with a `transform` property.** It does its full work, since a `transform` runs the consumer's code and has no fast test: 1.43 million validations a second against 3.13 for an `object` of three strings, measured on 2026-11-05. Asking the other properties' fast tests first and running the `transform` once on the full path would need the same proof of one run that [an `object` with checks](architecture.md#valid-input-without-the-full-work) has.

0.5.1 is released when:

- The work above has landed or been moved back to [Later / Possible](#later--possible) with the reason.
- `README.md`, every public page and the translations describe 0.5.1 as it ships, and `llms.txt` and `llms-full.txt` are current.
- `pnpm verify` passes, the changelog entry describes the release as it ships, with its date, and `hub release validation` reports it ready. `size.json` is measured again by that cut, since the `size` rule skips a released version.

### No comparison with other libraries

The package publishes no comparison with other validation libraries, and its release waits on none. Until 2026-10-08 it published `docs/comparison.md`, which measured it against valibot, zod and yup, and 0.4.0 was held until that page was measured again against their released versions and ArkType and TypeBox. The owner removed both on 2026-10-08. What that did not weigh:

- **No use has shown it.** The package has not been used in production, so a page saying where it does better than libraries used in thousands of live apps claims what nothing has tested.
- **It is a commitment to compete.** A published comparison sets the package against those libraries before its own future is settled.
- **It is upkeep paid on their schedule.** Keeping it true means following each library's releases and running their benchmarks again, for a package with no real-world use yet.

The measurements of 2026-10-07 stay in [0.4.0.md](0.4.0.md) as the evidence for the steps they led to, not as a claim about those libraries today. A comparison may come back once the package has been used for real, as [Versioning until 1.0](#versioning-until-10) asks of 1.0. Rejected: keeping the page with a note that it may be out of date, which keeps the upkeep and the claim.

## Versioning until 1.0

0.5.0 is the API, released on 2026-11-05, and everything after it is a 0.5.x release: fixes, new validators, new checks, new options, better messages. A change that would break a caller means the design missed something, as 0.4.0 was for 0.3.0, which had no type for what a validator accepts, and 0.5.0 for 0.4.x, whose audit found values passed or failed wrongly; it is the next minor and a signal to revisit [architecture.md](architecture.md), not a routine event. What counts as breaking for a format is set by [Compatibility of a format](architecture.md#compatibility-of-a-format).

1.0 is not a date and not a promise made on release day. It is declared when the API has been used for real, by more than one consumer, through enough releases to have shown where it was wrong:

- Every release since 0.5.0 has been additive or a fix, with no change to an existing signature, issue code or `params` shape.
- Validators in this package have been used by more than one package and by at least one app or site validating forms or an integration, and what they found is fixed.
- The public docs have not needed a correction to what an existing validator does.
- No document under `docs/internal/` is still a `DRAFT`.

## Later / Possible

Each is additive, so it fits a 0.5.x release.

- **A page on accepting a validator.** What a package that takes one from its caller declares, `Validator<T>` or a Standard Schema, how it reports a failure, and what it costs when the caller passes none.

- **National phone numbers.** `phone({ country })` accepting national formats, still returning E.164, with the per-country rules in a module of their own so `phone()` alone never bundles them.
- **File paths.** A `filepath({ platform })` that checks syntax only. Left out because what a valid path is depends on the operating system and the file system, and checking the text says nothing about whether it is safe to open.
- **The fragment of a URL.** A `hash` part for `url`, if a consumer needs one.

## Not Planned

- **Parity with other validation libraries.** Breadth for its own sake, such as every format or an adapter per framework, raises the cost of the package for everyone without serving the job it exists for. Standard Schema covers interop. What [0.4.0.md](0.4.0.md) takes from other libraries is each grounded in a case this package got wrong, not in their having it.
- **A throwing `parse` for input a program expects to be invalid.** A form or a request is read from the result, which lists every issue. `assert` throws for the other kind of input, a caller's mistake, and names one issue.
- **Lean validators that take no checks or messages, and checks moved out of the factories.** Both lower the cost of a lone validator, and both were measured and rejected in [architecture.md](architecture.md#what-adopting-costs).
- **`keyof`.** `Object.keys(describe(validator).shape)` gives it, and nobody has asked for a validator of keys. `required`, `pick` and `omit` were listed here too, as needing to look inside a validator, and were built in 0.4.0: [0.4.0.md](0.4.0.md#2-a-validator-can-be-described) says what that did not weigh. `extend` was listed beside `keyof`, as spreading a shape, and is part of 0.4.0: [0.4.0.md](0.4.0.md#8-schemas-that-say-what-they-are-for) says what that did not weigh.
- **Method chaining and class-based schemas.** They cannot be tree-shaken.
- **Checks as steps of `pipe`.** A check is attached to the validator whose value it checks, so it is typed by it and reports with its other issues. In `pipe` it would stop at the first failure and need `pipe` to thread types from step to step.
- **A message per option**, such as `min: [3, "Too short"]`. It makes every option a union and every validator heavier; a constraint that needs its own wording is written as a check.
- **`abortEarly`, `includeInput` and a per-call `context`.** A validator is a plain `(input) => result`, so there is no channel for per-call options. The first issue is `issues[0]`, the input is already in the caller's hand, and a callback that needs context closes over it.
- **Class names in `invalid_type`.** Naming a class takes reading the prototype in every validator, for a message that tells the reader little.
- **Generating source code from a schema**, such as TypeScript types or another language's validators. It would add weight for a use this package is not for. JSON Schema generation was listed with it, and was built in 0.4.0, as [0.4.0.md](0.4.0.md#2-a-validator-can-be-described) says. Generating a faster function at run time was planned for 0.4.0 as `compile` and dropped for a fast path that needs no generated code, as [0.4.0.md](0.4.0.md#11-valid-input-without-the-full-work) says.
