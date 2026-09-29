---
status: IMPLEMENTED
last_updated: 2026-09-28
scope: How the validation package is built and why, for whoever changes it next.
---

# Validation architecture

This records the invariants of `@codenhub/validation` and the reasoning behind decisions that are not obvious from the code. Public behavior lives in the package docs; this is for changing the package without breaking what it relies on.

## One node type, one run function

Every validator extends `Validator` in `src/core.ts`. A subclass implements one method, `evaluate(input, ctx)`, which checks structure and produces the output value. `Validator.run` calls it, then applies the validator's `steps` to the result. Parents call children through the `execute` function, never through `validate`, so path, options and async behavior pass through unchanged.

`evaluate` and `run` return `MaybePromise<Outcome<T>>`. An `Outcome` is `{ ok: true, value }` or `{ ok: false, issues }`: plain data, no `Error` is built until the outermost `validate` wraps the issues in a `ValidationError`, so nested validation does not capture stack traces per node.

## Sync until proven async

There is no `isAsync()` flag and no separate async code path. `src/async.ts` provides `chain` (apply a function to a value that may be a promise, staying synchronous when it is not) and `collect` (run N children and gather their outcomes, with the same guarantee). A composite validator is written once in terms of them, and it is synchronous exactly when its children are.

Consequences to keep:

- `validate`, `parse` and `is` call `run` and throw if they get a promise back. They abandon that promise (`abandon`) so a later rejection is not reported as unhandled. Throwing is deliberate: the earlier design guessed from `fn.constructor.name` and from a marker symbol that did not survive wrapping, and failed silently.
- `collect` without a stop function starts every child immediately and awaits them together. With a stop function (`abortEarly`) it runs one child after another and starts nothing after the first failure. Results are always in index order, so issue order never depends on which promise settled first.
- `async.ts` exports a function named `chain`, not `then`. A module namespace with an export called `then` is a thenable, and `import("./async")` then hangs or throws in some loaders.
- Any callback returning a thenable counts as async. Nothing inspects the function itself.

## Steps: rules live on the base class

`refine`, `check` and every built-in constraint (`min`, `email`, ...) append a step to `steps`. A step is `(value, ctx) => replacement | void` and may be async. Steps run in order on the output of `evaluate`, only when `evaluate` succeeded, and all of them report even after an earlier one failed, unless `abortEarly` says stop. A step that returns a value replaces the current one; that is how `trim()` and `clamp()` work, and it is the only way a rule changes a value.

Because steps are on the base class, `addStep` returns `this`: rules chain in any order and never widen the type to a bare `Validator`. `derive(changes)` copies a validator with `Object.create` plus `Object.assign`, which is why subclass state must be plain own fields (no `#private`) and immutable, and why no subclass needs its own `clone()`.

Wrappers that change the output type (`optional`, `default`, `catch`, `transform`, `pipe`, `and`, `or`) are separate node classes in `core.ts`. They live beside `Validator` because `Validator` constructs them: putting them in other files creates an import cycle that fails at module evaluation. Union and intersection are there for the same reason, since `or` and `and` construct them.

Object methods that change the shape (`extend`, `pick`, `omit`, `partial`, `required`) and `TupleValidator.rest` build a new validator and drop earlier steps, because those steps are typed for the old output. `strict`, `passthrough` and `strip` change no types and use `derive`, so they keep steps.

## Issues, paths and messages

Issues have absolute paths. Parents give each child a context with the path extended by one segment (`childContext`); `ctx.addIssue` inside a step takes a path relative to the value being checked and prefixes it. Nothing else adjusts paths, which is what makes them predictable.

`createIssue` is the only place an issue is built. It attaches `input` only when `includeInput` is set, and resolves a message function with the same details it stores. Built-in messages are written from constraint parameters and type names, never from the input value: this is a privacy invariant, tested in `core.test.ts`, that any new rule must keep.

`ValidationIssueCode` is an open set on purpose. Custom checks report their own codes and consumers branch on them; a closed union would erase them.

## Types

There is no input-type parameter. Every validator accepts `unknown`, and Standard Schema's `types.input` is `unknown`. An earlier design threaded a `TInput` through, but it was `unknown` for every built-in composite, so `InferInput` never carried information. If real input inference is wanted, it has to be threaded through objects, arrays, tuples and unions together, which is a larger change than adding a parameter.

`Infer` is Standard Schema's `InferOutput`. Object output types are built with `Simplify`, so hover text shows one object rather than an intersection of mapped types.

Composite validators accept `Validator<unknown>` children. That is assignable from every `Validator<T>` only while `T` appears in covariant positions, so `Step` is declared through a method signature (bivariant) instead of a function-typed property.

## Testing the build, not the source

Unit tests import from source, so they cannot see what a consumer sees. `tests/integration/consumer-types.test.ts` compiles `tests/integration/fixtures/consumer.ts` against `dist/index.d.ts` with `skipLibCheck: false`. The fixture uses `@ts-expect-error` for lines that must fail, so a declaration that becomes too permissive breaks the test as surely as one that becomes too strict. The test needs `dist/`; `hub test` builds first.
