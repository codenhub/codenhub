---
status: APPROVED
last_updated: 2026-10-07
scope: What `@codenhub/validation` builds toward, what it takes to release 0.4.0, and what it takes to reach 1.0.
---

# Roadmap

## Purpose

This records what `@codenhub/validation` is building toward, what it takes to release 0.4.0, and what it takes to reach 1.0. The design it builds toward, and why, is in [architecture.md](architecture.md). Nothing in it names a consuming package: the package is for any package or app that has to check a value, and a list of expected adopters would go stale and imply they are the only ones.

## Direction

- **One place for validation.** Checking a value has more edge cases than it looks: other realms, prototypes, getters, hostile input, what an error may reveal. A package that checks its own input by hand takes all of them on, and its reviews with them. This package handles them once, so a fix here reaches every package that validates with it, and each of those is reviewed for what it is for.
- **For data nobody controls.** The edge cases this package handles are those of input from outside the program: a form, a request, a query string, stored data, a file. That is where one place for validation pays for itself. A package that only checks the handful of options a developer passes it is checking a mistake, not hostile input, and hand-written checks stay cheaper for it in bytes: measured, about a sixth of the cost for five options (see [Who gains from adopting](architecture.md#who-gains-from-adopting)). Such a package may adopt this one, and none is expected to.
- **Taken as an argument before it is taken as a dependency.** A package that hands data from outside to its caller, such as stored state or the parameters of a URL, serves its users best by accepting a validator from them: `Validator<T>` is a type, which costs nothing to import, and a Standard Schema is accepted by any library that follows the specification. Then only the applications that validate pay for it.
- **The best validation library we can build.** The package exists to answer "is this value what I need it to be?" well, for anyone, and to be the one a team picks for that on its merits, not only the one this workspace uses. The workspace packages that validate their configuration are consumers of it, not the reason for it.
- **Short, predictable and complete.** A single value is validated with one call. The common constraints are options, the rare ones are checks, every validator takes the same arguments in the same order, and a custom validator is built with the same helpers as a built-in one and behaves exactly as one.
- **Small by construction.** A consumer's bundle contains only the validators and checks it imports, and budgets in the test suite hold that line.
- **The contract is ours.** Plain-data results and issues, no dependencies, and no dependency on any other workspace package.

## Current Focus

**0.4.0 is in a restructure phase, and it is released when we can say "this is the best package we can build".** It will not be the last word: there will be improvements after it. The bar is that, compared once more with the libraries a team would choose instead, nobody working on it can see anything left that would significantly improve the package. Until then, everything that bar finds goes into 0.4.0 rather than a later minor, signatures included, since nothing of 0.4.0 is published and no caller has to migrate twice.

[0.4.0.md](0.4.0.md) is the spec of that work, in the order it is built. Its first six steps came from measuring the package against valibot, zod and yup on 2026-10-07 and are built. Its second pass, steps 7 to 12, came from a second comparison the same day, which asked what they still had that a consumer would choose them for, and each step is its own pull request, in the order its dependencies need. The [0.4.0 changelog](../changelog/0.4.0.md) is kept current with what is built, and the package's version is 0.4.0. It is not published: the workspace catalog and the packages that depend on this one stay on 0.3.0 until it is.

0.4.0 is released when:

- Every step of [0.4.0.md](0.4.0.md) is built, or dropped with its reason and measurement recorded there.
- The [comparison](../comparison.md) is measured again against the released versions of valibot, zod, yup, ArkType and TypeBox, and reviewing it finds nothing left that would significantly improve the package. A finding that would is another step of 0.4.0.
- `pnpm verify` passes, the changelog entry describes the release as it ships, with its date, and `hub release validation` reports it ready.

## Versioning until 1.0

0.4.0 is the API, and everything after its release is a 0.4.x release: fixes, new validators, new checks, new options, better messages. A change that would break a caller means the design missed something, as 0.4.0 was for 0.3.0, which had no type for what a validator accepts, and it is the next minor and a signal to revisit [architecture.md](architecture.md), not a routine event. What counts as breaking for a format is set by [Compatibility of a format](architecture.md#compatibility-of-a-format).

1.0 is not a date and not a promise made on release day. It is declared when the API has been used for real, by more than one consumer, through enough releases to have shown where it was wrong:

- Every release since 0.4.0 has been additive or a fix, with no change to an existing signature, issue code or `params` shape.
- Validators in this package have been used by more than one package and by at least one app or site validating forms or an integration, and what they found is fixed.
- The public docs have not needed a correction to what an existing validator does.
- No document under `docs/internal/` is still a `DRAFT`.

## Later / Possible

Each is additive, so it fits a 0.4.x release. Anything here that the release bar of [Current Focus](#current-focus) finds would significantly improve the package moves into 0.4.0 instead.

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
- **Generating source code from a schema**, such as TypeScript types or another language's validators. It would add weight for a use this package is not for. JSON Schema generation was listed with it, and was built in 0.4.0, as [0.4.0.md](0.4.0.md#2-a-validator-can-be-described) says, and compiling a validator to a faster function at run time is part of 0.4.0, as [0.4.0.md](0.4.0.md#11-a-validator-compiled-for-speed) says.
