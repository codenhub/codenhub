---
status: APPROVED
last_updated: 2026-09-30
scope: What `@codenhub/validation` must contain to be released as 0.2.0, how the work is ordered, and what it takes to reach 1.0.
---

# Roadmap

## Purpose

This is the definition of done for the 0.2.0 release and the order the work happens in. The design it builds toward, and why, is in [architecture.md](architecture.md). Nothing in it names a consuming package: the package is for any package or app that has to check a value, and a list of expected adopters would go stale and imply they are the only ones.

## Direction

- **A good validation library.** The package exists to answer "is this value what I need it to be?" well, for anyone. The workspace packages that validate their configuration are consumers of it, not the reason for it.
- **Short, predictable and complete.** A single value is validated with one call. The common constraints are options, the rare ones are checks, every validator takes the same arguments in the same order, and a custom validator is built with the same helpers as a built-in one and behaves exactly as one.
- **Small by construction.** A consumer's bundle contains only the validators and checks it imports, and budgets in the test suite hold that line.
- **The contract is ours.** Plain-data results and issues, no dependencies, and no dependency on any other workspace package.

## Current Focus: 0.2.0

0.1.0 was released on 2026-09-30. Its API was reviewed the same day against the goals above, and the review found it heavier and longer to write than it should be, and missing a custom builder, per-validator wording and common formats. 0.2.0 is that review's design, and it breaks the 0.1.0 API on purpose: it is the last planned break before the API is frozen. The release is ready when every condition below holds.

### API surface

Everything follows the [architecture](architecture.md): a factory with the signature `validator(options?, ...checks)` returning a `(input: unknown) => result` function, options for common constraints, checks for rare ones, composition for meaning.

- **Checks and builders.** The `Check` and `AsyncCheck` types, and `check`, `format` and `guard`, built on the same internals as every built-in validator and check. `refine` is removed.
- **Leaves.** `string`, `number`, `bigint`, `boolean`, `date`, `symbol`, `literal`, `oneOf` (a list of values or an enum object, replacing `nativeEnum`), `unknown`, `never`, `instanceOf`, `func`.
- **Options and checks.** `string({ min, max, length, trim, case })`, with `case: "lower" | "upper"` replacing `lowercase` and `uppercase`. `number({ min, max, gt, lt, int, safeInt, clamp })`. Collections keep `min`, `max` and `length`. The checks `pattern`, `startsWith`, `endsWith`, `includes`, `lowercase`, `uppercase`, `multipleOf`, `nonZero` and `unique` replace the options they were.
- **Messages per validator.** A `message` option on every validator, and a message argument on every built-in check.
- **Composition.** `object`, `array`, `tuple`, `record`, `set`, `map`, `optional(validator, value?)` replacing `withDefault`, `nullable`, `nullish`, `fallback`, `transform`, `pipe`, `union`, `tagged` replacing `discriminatedUnion`, `intersection`, `lazy`, `json`, `partial`. Every composer that reports an issue of its own takes a message and checks; the wrappers take neither.
- **Parts.** `hostname`, `domain` (a public domain name), `ip` and `port` (numbers) as validators on their own. `url({ protocols, host, path, port, query, repeated })`, with `host` replacing `allowLocal`. `email({ domain, local, allowPlus })`. `searchParams(validator, { repeated })`.
- **Formats.** The 0.1.0 formats, with `ip` returning the canonical form, plus `phone` (E.164, returned canonical), `slug`, `semver`, `jwt` (its structure, not its signature), `creditCard` (the Luhn check), `cidr`, `mac`, `time`, `duration`, `base64({ url })` and `uuid({ version })`.
- **`is` returns a `boolean`.** It no longer narrows, since its narrowing was false for any validator that changes the value.
- **Unchanged.** Coercion, `pass` and `fail`, the result shape, `formatIssue`, `flatten`, `formatPath`, `englishMessages` with wording for every new code, and `standard`.
- **Types.** Every type a public signature names is exported, as `hub check` requires. The docs present `Validator`, `AsyncValidator`, `Check`, `AsyncCheck`, `Message`, `Infer`, `ValidationResult`, `ValidationIssue`, `Messages` and the options interfaces as the ones a consumer writes, and the rest as the machinery of signatures.

### Quality

- **Tests.** Every exported function has tests for accepted values, rejected values, edge cases, the exact issue shape, the `message` option and the invariant that no issue contains the input. Coverage stays above the repository target of 80%.
- **Consumer types.** The built declarations compile for a consumer under strict settings, and a fixture pins the types that must not compile, including a check of the wrong type and the synchronous and asynchronous overloads.
- **Size.** The shared core is slimmed before anything is built on it, and measured. Every budget is reset from measurement. The adopter measured for 0.1.0 is measured again.
- **Determinism and failure behavior.** As for 0.1.0: no validator depends on time, locale, randomness or earlier calls; bad input of a bounded size never throws; a bad option throws when the validator is created.

### Documentation

- `README.md` and every public page describe 0.2.0 only, with examples that compile against the built declarations.
- A page on checks and custom validators built with `check`, `format` and `guard`, and a page on URL and email parts and `searchParams`.
- A migration table from 0.1.0 to 0.2.0, the changelog entry, and current `llms.txt` and `llms-full.txt`.
- `docs/internal/` matches the code (done).

### Adoption

Every workspace package that uses the package is moved to 0.2.0 in the same change, and its tests pass.

### Release

`pnpm verify` passes, `hub release validation` reports the version, worktree and tarball as ready, and the release is tagged `@codenhub/validation@0.2.0` and published through the workflow in `docs/specs/packages-lifecycle.md`.

## The path

Each step ends with the tree green (`pnpm verify validation`) and lands as its own commits. All nine have landed; what remains is the release.

1. **The design in these docs**, reviewed before any code.
2. **The core.** The slimmer received-type naming and issue constructor, the `Check` type and the helper that runs checks, the `message` option, and the builders. Measured before the next step builds on it.
3. **Leaves and checks**, with the new signatures, `case`, `oneOf` over an enum and `symbol`.
4. **Composition.** Checks on every composer, `optional` with a default, `tagged`, the removals and the reduced exported types.
5. **Formats.** `domain`, `port`, the parts of `url` and `email`, `query` and `searchParams`, the canonical `ip`, and the new formats.
6. **Coercion, interop and English wording** for the new codes.
7. **Budgets.**
8. **Public docs**, migration table and changelog, generated files.
9. **The workspace consumers.**

## Versioning until 1.0

0.2.0 is the API, and everything after it is a 0.2.x release: fixes, new validators, new checks, new options, better messages. A change that would break a caller means the 0.2.0 design missed something, and it is a 0.3.0 and a signal to revisit [architecture.md](architecture.md), not a routine event. What counts as breaking for a format is set by [Compatibility of a format](architecture.md#compatibility-of-a-format).

1.0 is not a date and not a promise made on release day. It is declared when the API has been used for real, by more than one consumer, through enough releases to have shown where it was wrong:

- Every release since 0.2.0 has been additive or a fix, with no change to an existing signature, issue code or `params` shape.
- Validators in this package have been used by more than one package and by at least one app or site validating forms or an integration, and what they found is fixed.
- The public docs have not needed a correction to what an existing validator does.
- No document under `docs/internal/` is still a `DRAFT`.

## Later / Possible

Each is additive, so it fits a 0.2.x release.

- **National phone numbers.** `phone({ country })` accepting national formats, still returning E.164, with the per-country rules in a module of their own so `phone()` alone never bundles them.
- **File paths.** A `filepath({ platform })` that checks syntax only. Left out because what a valid path is depends on the operating system and the file system, and checking the text says nothing about whether it is safe to open.
- **The fragment of a URL.** A `hash` part for `url`, if a consumer needs one.

## Not Planned

- **Parity with other validation libraries.** Breadth for its own sake, such as every format or an adapter per framework, raises the cost of the package for everyone without serving the job it exists for. Standard Schema covers interop.
- **Throwing entry points (`parse`, `assert`).** Invalid input is a return value. The errors spec asks not to mix throwing and returning for the same failure, and a caller who wants to throw writes `if (!result.ok) throw …`.
- **`required` and the `extend`, `pick`, `omit` and `keyof` object methods.** They need to look inside a validator, which a plain function does not allow. Shapes are plain objects, so extending and omitting are spread and destructuring.
- **Method chaining and class-based schemas.** They cannot be tree-shaken.
- **Checks as steps of `pipe`.** A check is attached to the validator whose value it checks, so it is typed by it and reports with its other issues. In `pipe` it would stop at the first failure and need `pipe` to thread types from step to step.
- **A message per option**, such as `min: [3, "Too short"]`. It makes every option a union and every validator heavier; a constraint that needs its own wording is written as a check.
- **`abortEarly`, `includeInput` and a per-call `context`.** A validator is a plain `(input) => result`, so there is no channel for per-call options. The first issue is `issues[0]`, the input is already in the caller's hand, and a callback that needs context closes over it.
- **`InferInput`.** Every validator accepts `unknown`; there is no narrower input type to infer.
- **Class names in `invalid_type`.** Naming a class takes reading the prototype in every validator, for a message that tells the reader little.
- **JSON Schema generation and code generation.** Functions cannot be introspected, and it would add weight for a use this package is not for.
