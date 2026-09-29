---
status: APPROVED
last_updated: 2026-09-29
scope: What `@codenhub/validation` must contain to be released as 0.1.0, how the work is ordered, and what it takes to reach 1.0.
---

# Roadmap

## Purpose

This is the definition of done for the 0.1.0 release and the order the work happens in. The design it builds toward, and why, is in [architecture.md](architecture.md). Nothing in it names a consuming package: the package is for any package or app that has to check a value, and a list of expected adopters would go stale and imply they are the only ones.

## Direction

- **Value validation first.** A single URL, email, number or string is validated with one call and no schema. Objects and forms are compositions of the same validators.
- **Small by construction.** A consumer's bundle contains only the validators it imports, and budgets in the test suite hold that line.
- **The contract is ours.** Plain-data results and issues, no dependencies, and no dependency on any other workspace package.
- **A tool for this repository first.** It is published and documented like any package, and it is used across the workspace and in apps and sites for forms and integrations, but it does not compete on ecosystem breadth. Features that make every validator heavier for the sake of a few consumers stay out.

## Current Focus: 0.1.0

The release is ready when every condition below holds. There is no "ship and finish later": a condition that is not needed is removed from this list, and one that is needed is built before the release.

### API surface

Everything below exists, works in synchronous and asynchronous form where it composes, and follows the [architecture](architecture.md): a factory returning a `(input: unknown) => result` function, options for constraints, `pipe` and friends for meaning.

- **Leaves** (done). `string`, `number`, `bigint`, `boolean`, `date`, `literal`, `oneOf` (the values of a list), `nativeEnum`, `unknown`, `never`, `instanceOf`. `null` and `undefined` are `literal(null)` and `literal(undefined)`.
- **Formats** (done). `email`, `url`, `uuid`, `ip`, `datetime`, an ISO calendar date, `hostname`, `hex`, `base64`, `ulid`, `nanoid`, `cuid2`. Each is its own validator and its own module.
- **Collections** (done). `array`, `tuple` (with a rest element), `record`, `set`, `map`, each with the size constraints the type has.
- **Composition** (done). `object` with unknown-key handling, `optional`, `nullable`, `nullish`, `withDefault`, `fallback`, `transform`, `refine`, `pipe`, `union`, `discriminatedUnion` (a record of validators keyed by tag, since a function cannot be inspected for its tag), `intersection`, `lazy` for recursive data, and `json` for text holding JSON.
- **Shape reuse** (done). Shapes are plain objects, so extending, picking and omitting are spread and destructuring, and `partial(shape)` makes every property optional. There is no `required`: it would have to unwrap `optional`, and a function cannot be unwrapped, while the original required shape is still in hand.
- **Coercion** (done). Variants of `string`, `number`, `boolean`, `bigint` and `date` that convert text input such as `"42"` or `"yes"` first, for query strings, environment variables and form fields, taking the same options as their strict versions.
- **Results and guards.** `pass`, `fail` and the result types (done), `is` (done), `Infer` (done).
- **Messages** (done). `formatIssue`, `flatten`, `formatPath`, `englishMessages` as a separate import with wording for every issue a built-in validator can report, and message maps of your own for rewording and localization.
- **Interop** (done). `standard(validator, messages)`, the Standard Schema v1 adapter.
- **Nothing dropped by accident.** Every capability of the previous, unreleased design either exists in the new form or is listed under "Not Planned" with the reason. The changelog carries the mapping for anyone coming from 0.0.1.

### Quality

- **Tests.** Every exported function has tests for accepted values, rejected values, edge cases, the exact issue shape and the invariant that no issue contains the input. Coverage stays above the repository target of 80%; it is about 99.7%.
- **Consumer types.** The built declarations compile for a consumer under strict settings, and a fixture pins the types that must not compile.
- **Size budgets.** Each validator family has a bundle scenario with a gzip ceiling, and there is a scenario for the whole package. A single leaf validator stays near 1 kB gzipped, and the whole package stays a small multiple of that.
- **Determinism.** No validator depends on time, locale, randomness or state left by an earlier call, so the same input gives the same answer.
- **Failure behavior.** Bad input never throws, however large or deeply nested: `lazy` stops recursion at a depth limit and fails instead. A bad option throws when the validator is created. A consumer's own callback that throws propagates.

### Documentation

- `README.md` and every public page describe current behavior only and use examples that compile against the built declarations.
- A reference page per family of validators, a guide to writing custom and asynchronous validators, a page on issues and messages, a page on coercion, and a migration table from 0.0.1.
- The changelog entry for 0.1.0 is written from the finished package, and `llms.txt` and `llms-full.txt` are current.
- `docs/internal/` matches the code.

### Tooling (done)

`hub check` accepts a declared `codenhub.bundled` list of devDependencies that a package's build inlines, and fails when the built output still names one. `docs/specs/packages-lifecycle.md` and `docs/tooling.md` describe it. A package can take this one as a devDependency without an exception per package.

### Adoption proof (done)

One workspace package that validated its configuration with hand-written checks now inlines this package as a devDependency instead. Its published bundle contains only the validators it uses, `hub check` passes, and its tests pass. The cost was measured and is recorded in [architecture.md](architecture.md), where the result is more nuanced than the claim: the package tree-shakes correctly, and a consumer that validates little still pays about 2.7 kB gzipped.

### Release

`pnpm verify` passes, `hub release validation` reports the version, worktree and tarball as ready, and the release is tagged `@codenhub/validation@0.1.0` and published through the workflow described in `docs/specs/packages-lifecycle.md`. 0.0.1 is the only version on npm; the 0.1.0 in the manifest was never published or tagged, and is the release this roadmap describes.

## The path

Each step ends with the tree green (`pnpm verify validation`) and the docs describing exactly what exists.

1. **Foundation, leaves, formats, composition, coercion and interop** (landed). Result, issue and path model, sync-until-async plumbing, `is`, messages, and the first vertical slice: `string`, `number`, `boolean`, `email`, `object`, `optional`, `pipe`, `refine`. With the consumer-types and bundle-size tests, so the shape is proved before the rest is ported. Then the remaining leaves and every format, porting the edge cases the previous design had already found: public-host checks, calendar-date validity, ip and datetime patterns. Then the collections, wrappers, unions, `lazy`, `json` and `partial`, with asynchronous behavior tested for each composer, including that issue order never depends on which promise settles first. Then the five coercing validators and the Standard Schema adapter, and the `codenhub.bundled` support in `hub check`. Then one package adopting the validators, measured.
2. **Close-out.** Public docs and migration table completed, changelog written, generated files refreshed, release cut.

## Versioning until 1.0

The plan is that 0.1.0 is the API, and everything after it is a 0.1.x release: fixes, new validators, new options, better messages. A change that would break a caller means the 0.1.0 design missed something, and it is a 0.2.0 and a signal to revisit [architecture.md](architecture.md), not a routine event.

1.0 is not a date and not a promise made on release day. It is declared when the API has been used for real, by more than one consumer, through enough releases to have shown where it was wrong:

- Every release since 0.1.0 has been additive or a fix, with no change to an existing signature, issue code or `params` shape.
- Validators in this package have been used by more than one package and by at least one app or site validating forms or an integration, and what they found is fixed.
- The public docs have not needed a correction to what an existing validator does.
- No document under `docs/internal/` is still a `DRAFT`.

## Later / Possible

These came out of measuring an adopter and are not conditions for 0.1.0. Each is additive, so it fits a 0.1.x release.

- **A slimmer shared core.** The reporting of the received type and the issue building are about 0.6 kB gzipped in every consumer, and could be smaller.
- **A leaf for function-valued options.** A `func()` validator, since callbacks are common in configuration.
- **A fixed message on a validator.** A way to give one validator its own wording without a code-keyed map.

## Not Planned

- **Parity with other validation libraries.** Breadth for its own sake, such as every format or an adapter per framework, raises the cost of the package for everyone without serving the job it exists for. Standard Schema covers interop.
- **Throwing entry points (`parse`, `assert`).** Invalid input is a return value. The errors spec asks not to mix throwing and returning for the same failure, and a caller who wants to throw writes `if (!result.ok) throw …`.
- **`required` and the `extend`, `pick`, `omit` and `keyof` object methods.** They need to look inside a validator, which a plain function does not allow. Shapes are plain objects, so extending and omitting are spread and destructuring.
- **Method chaining and class-based schemas.** They cannot be tree-shaken. This is the reason for the redesign.
- **`abortEarly`, `includeInput` and a per-call `context`.** A validator is a plain `(input) => result`, so there is no channel for per-call options. The first issue is `issues[0]`, the input is already in the caller's hand, and a callback that needs context closes over it.
- **`InferInput`.** Every validator accepts `unknown`; there is no narrower input type to infer.
- **Building the message into each validator.** Text is on demand so it can be replaced and so it costs nothing to a consumer that never shows it.
- **JSON Schema generation and code generation.** Functions cannot be introspected, and it would add weight for a use this package is not for.
