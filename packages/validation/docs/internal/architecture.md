---
status: APPROVED
last_updated: 2026-09-29
scope: How the validation package is built and why, for whoever changes it next.
---

# Validation architecture

This records the invariants of `@codenhub/validation` and the reasoning behind decisions that are not obvious from the code. Public behavior lives in the package docs; this is for changing the package without breaking what it relies on. The release conditions and the path to 0.1.0 live in [roadmap.md](roadmap.md).

## What the package is for

The package answers one question, "is this value what I need it to be?", for any package or app that has to ask it and does not want validation to become its business. The unit is a **value**: a URL, an email, a number, a port. A schema for an object or a form is a composition of value validators, never a different kind of thing.

Two consequences shape every decision below:

- **A consumer pays only for what it imports.** The package is meant to be inlined into other packages at build time, so its weight lands in their bundles. Anything that makes every validator heavier is a regression, and the size budgets in `tests/integration/bundle-size.test.ts` enforce that.
- **The contract is ours.** Results, issues and paths are plain data defined here. Nothing depends on another validator's shape or on another workspace package, which is what lets any workspace package depend on this one.

## A validator is a function

```ts
type Validator<T> = (input: unknown) => ValidationResult<T>;
type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: { issues: ValidationIssue[] } };
```

There are no classes, no base type, no registry and no method chains. Anything with that shape is a validator, so a custom one needs no helper and no import. Composers take validators and return validators.

The reasons, in order of weight:

- **Tree-shaking.** Each validator is a function in its own module. A bundler keeps exactly the ones a consumer references. A class hierarchy, or a `val` namespace object, drags the shared base and every method along, which is what the previous design did: 4 kB gzipped for one string rule, 19.8 kB for the package.
- **No hidden state.** A function of `unknown` has nothing to configure after construction, so there is nothing to share, mutate or clone. Immutability is free.
- **It is the contract.** `(input: unknown) => result` is small enough to state in one line and to implement in a hand-written check.

### Factories, always

Every pre-made validator is created by calling a function, options optional: `email()`, `string({ min: 2 })`, `url({ allowLocal: true })`. There is no validator that is used bare, because a bare validator cannot grow an option without a breaking change, and because one rule with no exceptions is easier to remember than two. A single value therefore reads `email()(input)`.

### Constraints are options, formats are validators, meaning is composition

- **Options** carry the constraints of one type: `string({ min, max, pattern, trim })`, `number({ int, min })`. They cost nothing to write and one small function to support.
- **Formats** are separate validators: `email()`, `url()`, `uuid()`. Each is its own module, so a consumer that wants `email` does not pay for `uuid`.
- **Composition** carries everything else, by function: `object`, `optional`, `pipe`, `refine`. Cleaning a string before checking a format is `pipe(string({ trim: true }), email())`, not an option on `email`.

Options are applied in a fixed order that the docs state: clean-up (`trim`, `lowercase`, `clamp`) first, then every constraint on the cleaned value. Every failing constraint reports its own issue.

## Results, not exceptions

Invalid input is a normal outcome, so it is a return value: `{ ok: true, value }` or `{ ok: false, error: { issues } }`. The shape matches the `Result<T>` used elsewhere in the repository on purpose, and is defined locally so the package depends on nothing. `docs/specs/errors.md` asks packages without an error dependency to return a package-local result, and asks that throwing and returning not be mixed for the same failure, which is why there is no `parse` or `assert`.

Two things do throw, and both are programmer errors: an invalid option when a validator is created (`string({ min: -1 })` is a `RangeError`, `string({ lowercase: true, uppercase: true })` is a `TypeError`), and a callback the consumer wrote that throws, which propagates as the bug it is. Code inside the input is treated as a callback too: reading a property runs a getter, and a `Proxy` runs a trap, and an exception from either propagates rather than being reported, which would take a `try` around every read in `object`, `record` and `discriminatedUnion`. Data parsed from JSON carries no code, so validation never throws for it. The one place it could is recursion, since each level of nesting is a level of the JavaScript stack: `lazy` is the only way a schema refers to itself, so `lazy` alone counts. It keeps one module-level counter of the `lazy` calls open on the stack, incremented on entry and decremented in a `finally`, and fails with `too_big` and `{ type: "depth" }` past `maxDepth`. A counter of calls still on the stack is the right measure of what can overflow, because a promise's continuation runs from a shallow stack. It is not a bound on recursion itself: an asynchronous recursive schema resets it at every await, so it follows input of any depth, and a cyclic object until memory runs out. Bounding that would take a depth carried from one level to the next, which a validator cannot receive without a second parameter in the `(input) => result` contract; the docs say so, and leave the bound to the consumer. No composer takes a depth parameter or holds state. Size is a separate matter that the docs leave to the consumer: nothing here caps how much flat input is checked.

`is(validator, input)` is the boolean projection, for hooks that need a type guard. Its narrowing is exact only for a validator that does not change the value, and the docs say so.

## Issues

An issue is `{ code, path, params?, message? }` and nothing else.

- `code` is an open set of strings. The built-in codes are `invalid_type`, `invalid_value`, `invalid_format`, `too_small`, `too_big`, `unrecognized_key`, `invalid_key`, `invalid_union` and `invalid_intersection`; a custom validator adds its own, such as `username_taken`, and callers branch on them.
- `path` is absolute: from the root of what was validated down to the offending value. A validator reports an issue at its own location (an empty path, or a path relative to its value), and each composer prefixes the segment it descended through with `collectNested`. Nothing else edits paths, which is what keeps them predictable.
- `params` holds the facts behind the failure (`{ minimum: 3, type: "string" }`, `{ expected: "string", received: "number" }`), enough to build a message and to branch on.
- `message` is optional and never set by a built-in validator. A custom validator can set it when it wants fixed text.

**Issues never contain an input value.** No `input` field exists, and `params` carries type names and constraint values, never the value under test. Keys are the exception by necessity: a path is made of the input's keys, and `unrecognized_key` names the key in `params.key` as well. This is a privacy invariant, not a default: inputs are passwords and tokens, and an issue is something callers log. Any new rule must keep it, and the unit tests check it per validator.

### Messages are on demand, and the English is separate

Text is not built when an issue is created. `formatIssue(issue, messages?)` builds it from a message map, taking the first of: the issue's own `message`, an entry for its `code` in the map, then the generic "Invalid value". `flatten` groups formatted messages by path for forms.

The built-in English wording is not inside `formatIssue`. It is `englishMessages`, a map in its own module that a consumer imports and passes in. That is what keeps a program that words its own issues from bundling about 1 kB gzipped of English it never shows, and it makes rewording and localization the same operation: spread `englishMessages` and override some codes, or write a whole map. It also means a bare `formatIssue(issue)` is deliberately unhelpful, so `standard`, which the specification obliges to produce text, takes the map as a required argument instead of falling back silently.

That split is what keeps validators small (no string per rule) and makes localization a data problem: a map keyed by code. A consumer that never asks for text never bundles any. `message` on the issue exists so a custom rule can carry its own wording without a map.

## Sync until proven async

There is one implementation of every composer, not a sync one and an async one. A validator is synchronous exactly when everything it runs is.

`chain` applies a function to a value that may still be pending, and `collect` gathers several such values, and both stay synchronous while nothing is a promise. A composer is written once in terms of them: it calls its children, and if any returned a promise the whole result becomes a promise, otherwise it is returned directly. `src/core/async.ts` exports a function named `chain`, never `then`: a module namespace with an export called `then` is a thenable, and importing it can hang in some loaders.

### The types say which

`Validator<T>` returns a result directly. `AsyncValidator<T>` returns a result or a promise of one. A composer's return type is computed from its children by `Composed`: `Validator` when every child is a `Validator`, `AsyncValidator` as soon as one is not. So `object({ name: string(), taken: asyncRule })` is an `AsyncValidator`, and the compiler makes the caller `await` it, while `object({ name: string() })` stays directly readable.

`AsyncValidator` is honestly a result or a promise, not always a promise, because a composer holding an async child can still answer at once for input it can reject without running it: `optional(asyncRule)` given `undefined`, or `object(...)` given a non-object. Promising a `Promise` there would be a lie, and code that chains `.then` on it would break. `await` handles both, so that is the documented contract.

Results keep the order of the children, never the order in which promises settled, so issue order is deterministic. Any callback that returns a thenable counts as async; nothing inspects the function itself, because guessing from `fn.constructor.name` fails silently when a function is wrapped.

`is` accepts only `Validator<T>`, and throws a `TypeError` naming the fix if a validator turns out to return a promise anyway (the type system prevents this unless the type was cast away). It abandons that promise so a later rejection is not reported as unhandled.

## What a function cannot do

A validator is opaque: a combinator can call it and read its result, and nothing else. Three things the previous, class-based design did follow from that, and are done differently here:

- **Tagged unions take a record.** `discriminatedUnion(key, { click: object(...), key: object(...) })` reads the tag from the input and routes by it, because a variant cannot be asked which tag it accepts. The tag is added back to the output so the type is a proper tagged union, and the variants do not repeat it.
- **Shapes are plain objects.** Extending is spread and omitting is destructuring. `partial(shape)` wraps each property in `optional` and returns a new shape. There is no `required`, since it would have to unwrap `optional`.
- **Recursion names its own type.** `lazy` looks a validator up on first use, and the variable that holds a recursive validator carries an explicit type annotation, because TypeScript cannot infer a type that refers to itself.

Structure is checked before content. A collection whose size is wrong fails at once without validating its items, and a tagged union with a missing tag fails without running any variant, so hostile input is rejected before it is worked through. Every other check still reports every problem it can find.

## Tree-shaking is a contract

The package is `sideEffects: false`, every module is side-effect free at load, and nothing registers itself anywhere. To keep it that way:

- One validator per module; a module imports only `core/` helpers and other validators it truly composes.
- No shared mutable state, no module-level registries, no `Object.assign`-style attachment of properties to functions at load. The one piece of module-level state is the depth counter of `lazy`, described under [Results, not exceptions](#results-not-exceptions): it is created at load without a side effect and is back at zero whenever no validator is running.
- Options are read once when a validator is created, not per call, and defaults are resolved there.
- The English wording lives in `messages/english-messages.ts` and is reachable only through the `englishMessages` export, so `formatIssue` itself carries none of it.

`tests/integration/bundle-size.test.ts` bundles small consumer-shaped modules against the built `dist/` and asserts a gzip ceiling for each: one leaf validator, an object of a few fields, messages alone, and everything. A budget that fails means something made every validator heavier. Budgets sit about 20% above what each scenario measures; raising one is a deliberate change explained in the commit that does it.

## Types

There is no input-type parameter. Every validator accepts `unknown`, and that is the honest input type of a function that exists to check unknown data. `Infer<typeof validator>` reads the output type from either flavor.

An `object` output type is built with `Simplify`, so hover text shows one object, and a property whose validator can produce `undefined` becomes optional in it.

`tests/integration/consumer-types.test.ts` compiles `tests/integration/fixtures/consumer.ts` against `dist/index.d.ts` with `skipLibCheck: false`. The fixture uses `@ts-expect-error` for lines that must fail, so a declaration that becomes too permissive breaks the test as surely as one that becomes too strict. Unit tests import from source and cannot see what a consumer sees; this is the test that can. It needs `dist/`, which `hub test` builds first.

## Dependency model

The package has no dependencies, and it must never depend on another workspace package: workspace packages depend on it, and a cycle has no build order.

Packages inside this repository that validate are meant to take it as a `devDependency` and have their build inline the validators they use, so a published package ships only that code and its own consumers never see this package or its version. `docs/specs/packages-lifecycle.md` requires anything reachable from a published entry point to be a `dependency` or a `peerDependency`, so `hub check` accepts a declared exception: a `codenhub.bundled` list in `package.json` naming devDependencies that the build inlines, described in that spec. Listing a name is a promise about the build, and `hub check` fails when the built JavaScript or declarations still name it. The rule is owned by the tooling, not by this package.

## What adopting costs

The claim that a consumer pays only for what it uses was measured on a real workspace package that validates its own configuration. It took the package as a bundled devDependency and replaced about 80 lines of hand-written checks with eight validators (`array`, `boolean`, `object`, `optional`, `pipe`, `refine`, `string`, `unknown`) and `formatIssue` and `formatPath`. Minified and gzipped, across every entry point and chunk, it went from 5.6 kB to 8.3 kB: +2.7 kB, about +48%. The hand-written checks were about 0.5 kB.

The claim held in the sense that matters for correctness: the built output contained none of the validators the package did not use, no coercion code and no Standard Schema adapter, and `hub check` found no leak. It did not hold in the sense of being small for a package that only checks a few options. Where the bytes went:

- **The validators, about 1.9 kB**, of which about 0.6 kB is the core every validator shares: reporting the received type, building issues, and the sync-until-async plumbing. `string` alone is close to 1 kB because its options are all in one function, so a consumer that uses `min` still carries `pattern`, `startsWith` and the rest.
- **The built-in English wording, about 1.0 kB.** In the first measurement `formatIssue` carried the wording for every issue a built-in can report, and it could not be shaken per code, so a consumer that worded its own issues still bundled it. It is now a separate import, and the same package supplying its own three lines of wording dropped to +1.9 kB (7.6 kB in total, +35%) with none of the English in its build. After the fixes of the pre-release review, which added a few hundred bytes to the shared checks, the same package measures 7.8 kB, +2.2 kB or +39%.
- **The consumer's own glue, about 0.3 kB.**

Two consequences follow. First, hand-written checks are still cheaper in bytes for a handful of options, and the package earns its place through consistency and shared behavior rather than size, so "lightweight" holds per validator and not for a package that validates little. Second, inlining copies the shared core into every package that inlines it: an application that installs several such packages carries one copy per package, where a regular dependency would be deduplicated by the application's bundler. Inlining buys isolation from this package's version, and that is worth revisiting once the API is 1.0.

Gaps the migration exposed that remain, none of them needed by the 0.1.0 release conditions: there is no leaf for function-valued options, which are common in configuration, so the consumer wrote one with `refine`; a validator cannot carry a fixed message of its own, so per-field wording goes through `refine`'s issue or a message map keyed by code; and a message that needs the offending value or a sibling name cannot be built by a validator.

## Coercion

A coercing validator is a strict validator behind a converter: `coerceNumber(options)` builds `number(options)` once, converts the input, and hands the converted value to it. So the strict validator owns every constraint and every option check, and the coercing one adds only the conversion. Each is its own module and its own export, so a consumer that never coerces does not bundle the conversion code, which is why coercion is not an option on the strict validators.

The conversions are narrow on purpose, because a conversion that guesses turns a bug into a plausible value: no booleans as numbers, no empty string as zero, no free-form dates, no typo read as `false`. What cannot be converted fails with `invalid_type` and `coerced: true` in `params`, and never the value.

## Standard Schema

A validator is a function and not a schema object, so Standard Schema v1 support is an adapter: `standard(validator, messages)` returns a new function that calls the validator and carries a `~standard` property, and leaves the validator you gave untouched. The standard requires a `message` on every issue, and the adapter supplies it with `formatIssue` and a message map it requires as an argument, so the cost of messages is paid only by whoever asks for interop. Input type and output type are `unknown` and the validator's `Infer`, since validators take `unknown`.

`~standard.validate` is synchronous for a synchronous validator and returns a promise for an asynchronous one, through `chain`. The interface types are vendored in `src/interop/standard-schema.ts` so the package needs no dependency for them.

## Adding a validator

1. One module, one exported factory, options in one interface, all with TSDoc per `docs/guidelines/code.md`. Throw `RangeError` or `TypeError` from the factory for options that make no sense.
2. Non-matching type: `invalidType(expected, input)`. Failed constraint: `invalid_format`, `invalid_value`, `too_small` or `too_big` with `params` that name the facts and never the value.
3. Report every failing constraint, not the first.
4. Tests beside it: accepted values, rejected values, edge cases, the exact issue shape, and that no issue contains the input.
5. Add it to the size budgets if it adds a scenario a consumer would plausibly bundle alone.
6. Document it in `docs/validators.md`, and the wording for its issue shape in `messages/english-messages.ts`.
