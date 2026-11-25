---
status: APPROVED
last_updated: 2026-11-22
scope: What `@codenhub/validation` builds toward, what its next releases are for, and the decisions it keeps.
---

# Roadmap

## Purpose

This records what `@codenhub/validation` is building toward, what its next releases are for, and the decisions it keeps. The design it builds toward, and why, is in [architecture.md](architecture.md). Nothing in it names a consuming package: the package is for any package or app that has to check a value, and a list of expected adopters would go stale and imply they are the only ones.

## Direction

- **One place for validation.** Checking a value has more edge cases than it looks: other realms, prototypes, getters, hostile input, what an error may reveal. A package that checks its own input by hand takes all of them on, and its reviews with them. This package handles them once, so a fix here reaches every package that validates with it, and each of those is reviewed for what it is for.
- **For data nobody controls.** The edge cases this package handles are those of input from outside the program: a form, a request, a query string, stored data, a file. That is where one place for validation pays for itself. A package that only checks the handful of options a developer passes it is checking a mistake, not hostile input, and hand-written checks stay cheaper for it in bytes: measured, about a sixth of the cost for five options (see [Who gains from adopting](architecture.md#who-gains-from-adopting)). Such a package may adopt this one, and none is expected to.
- **Taken as an argument before it is taken as a dependency.** A package that hands data from outside to its caller, such as stored state or the parameters of a URL, serves its users best by accepting a validator from them: `Validator<T>` is a type, which costs nothing to import, and a Standard Schema is accepted by any library that follows the specification. Then only the applications that validate pay for it.
- **The best validation library we can build.** The package exists to answer "is this value what I need it to be?" well, for anyone, and to be the one a team picks for that on its merits, not only the one this workspace uses. The workspace packages that validate their configuration are consumers of it, not the reason for it.
- **Short, predictable and complete.** A single value is validated with one call. The common constraints are options, the rare ones are checks, every validator takes the same arguments in the same order, and a custom validator is built with the same helpers as a built-in one and behaves exactly as one.
- **Small by construction.** A consumer's bundle contains only the validators and checks it imports, and budgets in the test suite hold that line.
- **The contract is ours.** Plain-data results and issues, no dependencies, and no dependency on any other workspace package.

## Current Focus

**0.6.0 is the API.** It rewrote the core as one pass over the input, for size, and what a caller of 0.5.1 changes is in the [0.6.0 changelog](../changelog/0.6.0.md). What follows it is 0.6.x: fixes, new validators, new checks, new options, better messages. A change that would break a caller means the design missed something, such as no type for what a validator accepts, values passed or failed wrongly, or a core that makes every schema carry what it does not use; it is the next minor and a signal to revisit [architecture.md](architecture.md), not a routine event. What counts as breaking for a format is set by [Compatibility of a format](architecture.md#compatibility-of-a-format).

## Decisions

- **The keys an `object` does not list, validated.** `objectWithRest(shape, rest)` validates each key the shape does not list with `rest`, as zod's `catchall` and valibot's `objectWithRest` do. `intersection(object, record)` is no way to write it, since the `record` validates the listed keys too. Rejected: an `unknownKeys` option that accepts a validator, since every `object` would carry the ways it is not asked for, as [One pass](architecture.md#one-pass) says.
- **`transform` typed as it runs.** A `convert` that returns a value with a callable `then` makes the result asynchronous at run time, since `await` treats it as a promise, and the type says so too, even where the value is not typed as `PromiseLike`. A program it changes was already given a promise where its type promised a result.
- **Size saved without changing what any validator returns.** `string` checks its length with the helpers of the collections' size.

### No comparison with other libraries

The package publishes no comparison with other validation libraries, and its release waits on none. Rejected: publishing a page that measures it against other libraries, such as valibot, zod, yup, ArkType and TypeBox, and holding a release until that page is measured again against their released versions. It loses for three reasons:

- **No use has shown it.** The package has not been used in production, so a page saying where it does better than libraries used in thousands of live apps claims what nothing has tested.
- **It is a commitment to compete.** A published comparison sets the package against those libraries before its own future is settled.
- **It is upkeep paid on their schedule.** Keeping it true means following each library's releases and running their benchmarks again, for a package with no real-world use yet.

The measurements in [the 0.4.0 design](https://github.com/codenhub/codenhub/blob/143373b0bc5bb928766e5bd0f8033435ae53c077/packages/validation/docs/internal/0.4.0.md) are the evidence for the steps they led to, not a claim about those libraries today. A comparison may come back once the package has been used for real. Rejected: keeping the page with a note that it may be out of date, which keeps the upkeep and the claim.

## Later / Possible

Each is additive, so it fits a 0.6.x release.

- **The speed of a `union` past its first option, and of a `record`.** In 0.6.0 a `union` that accepts its second option runs at half its speed in 0.5.1, since each option that fails reports its issue before the next is tried, and a `record` of ten numbers at two thirds, since it runs through the code it shares with `map` ([One pass](architecture.md#one-pass)). Both are accepted for the size. Each is worth work once a schema someone uses is shown to be held by it, and only for bytes that the schemas without a `union` or a `record` do not pay.

- **The typical form with English messages.** It is about 1.5 kB gzipped over zod/mini's, and the difference is the English map ([The bar for size](architecture.md#the-bar-for-size)). The form itself is under the bar, since `email` reads ASCII domains.

- **A page on accepting a validator.** What a package that takes one from its caller declares, `Validator<T>` or a Standard Schema, how it reports a failure, and what it costs when the caller passes none.

- **National phone numbers.** `phone({ country })` accepting national formats, still returning E.164, with the per-country rules in a module of their own so `phone()` alone never bundles them.
- **File paths.** A `filepath({ platform })` that checks syntax only. Left out because what a valid path is depends on the operating system and the file system, and checking the text says nothing about whether it is safe to open.
- **The fragment of a URL.** A `hash` part for `url`, if a consumer needs one.

## Not Planned

- **Parity with other validation libraries.** Breadth for its own sake, such as every format or an adapter per framework, raises the cost of the package for everyone without serving the job it exists for. Standard Schema covers interop. What [the 0.4.0 design](https://github.com/codenhub/codenhub/blob/143373b0bc5bb928766e5bd0f8033435ae53c077/packages/validation/docs/internal/0.4.0.md) takes from other libraries is each grounded in a case this package got wrong, not in their having it.
- **A throwing `parse` for input a program expects to be invalid.** A form or a request is read from the result, which lists every issue. `assert` throws for the other kind of input, a caller's mistake, and names one issue.
- **Lean validators that take no checks or messages, and checks moved out of the factories.** Both lower the cost of a lone validator, and both are measured and rejected in [architecture.md](architecture.md#what-adopting-costs). The package gets the saving of the second without its cost, a longer call for every check: a check carries what runs it ([Checks](architecture.md#checks)).
- **`keyof`.** `Object.keys(describe(validator).shape)` gives it, and nobody has asked for a validator of keys. `required`, `pick` and `omit` look inside a validator and are built, as [the 0.4.0 design](https://github.com/codenhub/codenhub/blob/143373b0bc5bb928766e5bd0f8033435ae53c077/packages/validation/docs/internal/0.4.0.md#2-a-validator-can-be-described) explains, and `extend`, which spreads a shape, is built too, as [the 0.4.0 design](https://github.com/codenhub/codenhub/blob/143373b0bc5bb928766e5bd0f8033435ae53c077/packages/validation/docs/internal/0.4.0.md#8-schemas-that-say-what-they-are-for) explains.
- **Method chaining and class-based schemas.** They cannot be tree-shaken.
- **Checks as steps of `pipe`.** A check is attached to the validator whose value it checks, so it is typed by it and reports with its other issues. In `pipe` it would stop at the first failure and need `pipe` to thread types from step to step.
- **A message per option**, such as `min: [3, "Too short"]`. It makes every option a union and every validator heavier; a constraint that needs its own wording is written as a check.
- **`abortEarly`, `includeInput` and a per-call `context`.** A validator is a plain `(input) => result`, so there is no channel for per-call options. The first issue is `issues[0]`, the input is already in the caller's hand, and a callback that needs context closes over it.
- **Fast tests.** A second, quicker answer for input that passes costs bytes in every validator and leaves cases in which its answer and the full work's have to be kept the same, one of which rules out a fast test under `lazy`. [One pass](architecture.md#one-pass) has the reasoning and what leaving it out costs in speed.
- **Class names in `invalid_type`.** Naming a class takes reading the prototype in every validator, for a message that tells the reader little.
- **Generating source code from a schema**, such as TypeScript types or another language's validators. It would add weight for a use this package is not for. JSON Schema generation is built, as [the 0.4.0 design](https://github.com/codenhub/codenhub/blob/143373b0bc5bb928766e5bd0f8033435ae53c077/packages/validation/docs/internal/0.4.0.md#2-a-validator-can-be-described) says. Generating a faster function at run time, `compile`, is not planned either, as [the 0.4.0 design](https://github.com/codenhub/codenhub/blob/143373b0bc5bb928766e5bd0f8033435ae53c077/packages/validation/docs/internal/0.4.0.md#11-valid-input-without-the-full-work) says.
