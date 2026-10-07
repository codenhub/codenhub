---
status: APPROVED
last_updated: 2026-10-07
scope: What `@codenhub/validation` contained to be released as 0.3.0, what it builds next, and what it takes to reach 1.0.
---

# Roadmap

## Purpose

This records the definition of done of the 0.3.0 release, which is out, and points to what is built next. The design it builds toward, and why, is in [architecture.md](architecture.md). Nothing in it names a consuming package: the package is for any package or app that has to check a value, and a list of expected adopters would go stale and imply they are the only ones.

## Direction

- **One place for validation.** Checking a value has more edge cases than it looks: other realms, prototypes, getters, hostile input, what an error may reveal. A package that checks its own input by hand takes all of them on, and its reviews with them. This package handles them once, so a fix here reaches every package that validates with it, and each of those is reviewed for what it is for.
- **For data nobody controls.** The edge cases this package handles are those of input from outside the program: a form, a request, a query string, stored data, a file. That is where one place for validation pays for itself. A package that only checks the handful of options a developer passes it is checking a mistake, not hostile input, and hand-written checks stay cheaper for it in bytes: measured, about a sixth of the cost for five options (see [Who gains from adopting](architecture.md#who-gains-from-adopting)). Such a package may adopt this one, and none is expected to.
- **Taken as an argument before it is taken as a dependency.** A package that hands data from outside to its caller, such as stored state or the parameters of a URL, serves its users best by accepting a validator from them: `Validator<T>` is a type, which costs nothing to import, and a Standard Schema is accepted by any library that follows the specification. Then only the applications that validate pay for it.
- **A good validation library.** The package exists to answer "is this value what I need it to be?" well, for anyone. The workspace packages that validate their configuration are consumers of it, not the reason for it.
- **Short, predictable and complete.** A single value is validated with one call. The common constraints are options, the rare ones are checks, every validator takes the same arguments in the same order, and a custom validator is built with the same helpers as a built-in one and behaves exactly as one.
- **Small by construction.** A consumer's bundle contains only the validators and checks it imports, and budgets in the test suite hold that line.
- **The contract is ours.** Plain-data results and issues, no dependencies, and no dependency on any other workspace package.

## Current Focus

[0.4.0.md](0.4.0.md) is the spec of the work after 0.3.0, in the order it is built: composers as fast as their leaves allow, validators that can be described, an input type, a rule across fields that does not wait for the others, what the package says it is for, and `brand`, `readonly` and message maps in other languages. It came from measuring the package against valibot, zod and yup on 2026-10-07, and it reverses three entries this roadmap had under Not Planned, naming for each what the entry did not weigh. The first step is a 0.3.x release, and the first that changes a signature is 0.4.0. Steps 1 to 5 are built and not released.

## Released: 0.3.0

0.2.0 was released on 2026-10-04. Its first adopter was then measured against the hand-written checks it had replaced, in [issue 209](https://github.com/codenhub/codenhub/issues/209), and the measurement showed two things 0.2.0 had wrong: inlining made every adopter pay for the shared core alone and kept a fix here from reaching anyone until each adopter was released again, and the adopter had written around the package, a throwing helper and three wordings of its own, what every adopter would write again. 0.3.0 corrects both, and breaks 0.2.0 where that takes it. [What adopting costs](architecture.md#what-adopting-costs) has the measurements and the designs that were rejected. The release is ready when every condition below holds.

### API surface

- **A regular dependency.** An adopter declares the package under `dependencies`, and nothing inlines it. See [Dependency model](architecture.md#dependency-model).
- **`assert(validator, input, { subject, messages })`.** Returns the value or throws a `TypeError` naming the first issue, with the failure as its `cause`, for input whose being invalid is a programmer error.
- **The wording of each code as an export of its own**, `invalidTypeMessage` and the rest, with `englishMessages` the map of them.
- **`objectLike(shape, options?, ...checks)`.** Any object that is not an array, its listed properties read as `input[key]`, and a property that throws while it is read reported as an issue.
- **`nonBlank()`**, a check of strings that requires a character that is not white space and, unlike `trim` with `min: 1`, leaves the string as it is.
- **A limit of 1,000 issues for each collection.** See [The limit of issues](architecture.md#the-limit-of-issues).
- **No 0.1.0 migration errors.** An option 0.1.0 had is an unknown option, as any other name the factory does not read.
- **Unchanged.** Everything else, the signature `validator(options?, ...checks)` included.

### Quality

- **Tests.** Each addition has tests for accepted values, rejected values, edge cases, the exact issue shape and the `message` option.
- **Size.** The budgets of the scenarios the removal shrank are reset from measurement, and each addition has a scenario.
- **Consumer types and doc examples** compile against the built declarations.

### Documentation

`README.md` and every public page describe 0.3.0 only, the changelog entry is written when the release is cut, and `llms.txt` and `llms-full.txt` are current. No migration guide is written: the package has one adopter, which moves with the release.

### Adoption

The adopter can move only once 0.3.0 is on npm, since public packages install each other from releases. It then declares the package under `dependencies`, drops it from `codenhub.bundled`, and replaces its throwing helper and its own wording with `assert` and the exports of the codes it reports.

### Release

`pnpm verify` passes, `hub release validation` reports the version, worktree and tarball as ready, and the release is tagged `@codenhub/validation@0.3.0` and published through the workflow in `docs/specs/packages-lifecycle.md`.

## Versioning until 1.0

0.3.0 is the API, and everything after it is a 0.3.x release: fixes, new validators, new checks, new options, better messages. A change that would break a caller means the design missed something, as 0.3.0 itself was for 0.2.0, and it is the next minor and a signal to revisit [architecture.md](architecture.md), not a routine event. What counts as breaking for a format is set by [Compatibility of a format](architecture.md#compatibility-of-a-format).

1.0 is not a date and not a promise made on release day. It is declared when the API has been used for real, by more than one consumer, through enough releases to have shown where it was wrong:

- Every release since 0.3.0 has been additive or a fix, with no change to an existing signature, issue code or `params` shape.
- Validators in this package have been used by more than one package and by at least one app or site validating forms or an integration, and what they found is fixed.
- The public docs have not needed a correction to what an existing validator does.
- No document under `docs/internal/` is still a `DRAFT`.

## Later / Possible

Each is additive, so it fits a 0.3.x release.

- **A page on accepting a validator.** What a package that takes one from its caller declares, `Validator<T>` or a Standard Schema, how it reports a failure, and what it costs when the caller passes none.

- **National phone numbers.** `phone({ country })` accepting national formats, still returning E.164, with the per-country rules in a module of their own so `phone()` alone never bundles them.
- **File paths.** A `filepath({ platform })` that checks syntax only. Left out because what a valid path is depends on the operating system and the file system, and checking the text says nothing about whether it is safe to open.
- **The fragment of a URL.** A `hash` part for `url`, if a consumer needs one.

## Not Planned

- **Parity with other validation libraries.** Breadth for its own sake, such as every format or an adapter per framework, raises the cost of the package for everyone without serving the job it exists for. Standard Schema covers interop. What [0.4.0.md](0.4.0.md) takes from other libraries is each grounded in a case this package got wrong, not in their having it.
- **A throwing `parse` for input a program expects to be invalid.** A form or a request is read from the result, which lists every issue. `assert` throws for the other kind of input, a caller's mistake, and names one issue.
- **Lean validators that take no checks or messages, and checks moved out of the factories.** Both lower the cost of a lone validator, and both were measured and rejected in [architecture.md](architecture.md#what-adopting-costs).
- **`extend` and `keyof` object methods.** Shapes are plain objects, so extending is spread. `required`, `pick` and `omit` were listed here too, as needing to look inside a validator, and are planned by [0.4.0.md](0.4.0.md#2-a-validator-can-be-described), which says what that did not weigh.
- **Method chaining and class-based schemas.** They cannot be tree-shaken.
- **Checks as steps of `pipe`.** A check is attached to the validator whose value it checks, so it is typed by it and reports with its other issues. In `pipe` it would stop at the first failure and need `pipe` to thread types from step to step.
- **A message per option**, such as `min: [3, "Too short"]`. It makes every option a union and every validator heavier; a constraint that needs its own wording is written as a check.
- **`abortEarly`, `includeInput` and a per-call `context`.** A validator is a plain `(input) => result`, so there is no channel for per-call options. The first issue is `issues[0]`, the input is already in the caller's hand, and a callback that needs context closes over it.
- **Class names in `invalid_type`.** Naming a class takes reading the prototype in every validator, for a message that tells the reader little.
- **Code generation.** It would add weight for a use this package is not for. JSON Schema generation was listed with it, and is planned by [0.4.0.md](0.4.0.md#2-a-validator-can-be-described).
