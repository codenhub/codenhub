---
status: APPROVED
last_updated: 2026-11-09
scope: TypeScript, JavaScript, and Node.js conventions, on top of the coding guidelines.
---

# TypeScript guidelines

The [coding guidelines](code.md) hold for every language in the project. This document adds what is particular to TypeScript, JavaScript, and Node.js, and the tools that check them.

## Naming

- Files and folders: kebab-case (`user-service.ts`, `api-routes/`).
- Variables and functions: camelCase (`getUserById`, `isValid`).
- Classes and types: PascalCase (`UserService`, `ApiResponse`).
- Constants: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`).

## TypeScript

- Use strict TypeScript; the root `tsconfig.json` sets the flags.
- Prefer `const` to `let`; never use `var`.
- Prefer `unknown` to `any`. Validate `unknown` at the boundary before use.
- Prefer interfaces for object shapes and type aliases for unions and intersections.
- Use type-only imports when importing only types.
- Prefer string-literal unions or `as const` objects to `enum`. `enum` is not erasable syntax: Node.js type stripping rejects it, so code that `tsc` and Vitest accept can fail when Node.js loads it. Tests of `enum` support are the exception. An earlier rule allowed `enum` and named its members in UPPER_SNAKE_CASE; it was replaced once code run by Node.js directly hit the rejection ([codenhub/codenhub@e3ae18df](https://github.com/codenhub/codenhub/commit/e3ae18df)).
- Keep casts narrow and close to the boundary that justifies them.
- Do not export types or values that are not part of the package or module API.
- A function with three or more parameters takes a typed options object instead, under the exceptions the [coding guidelines](code.md#code) give.

## Modules and imports

- Group related files in a folder with an `index.ts` entrypoint.
- Prefer named exports, except where a tool or framework requires a default export, such as config files or framework routes.
- Use barrel files only as package or folder entrypoints.
- Do not deep-import another package's internals unless the subpath is part of its `exports`.

## Async and logging

- Use `async`/`await` for asynchronous code.
- Run independent async work in parallel with `Promise.all()`. Sequential awaits in a loop need a reason, given in the comment on the lint suppression they require.
- `console` is for examples, CLIs, debugging utilities, entrypoints reporting startup failures, and deliberate diagnostics. Casual logging is not a substitute for error handling.

## TSDoc

The API documentation the [coding guidelines](code.md#documentation-in-code) require is TSDoc in source. Every symbol exported from a published package's entrypoint, through `package.json` `exports`, is that package's API: functions, classes and their public members, interfaces, type aliases, constants, and configuration objects. Its TSDoc:

- Opens with a one-sentence summary of what the symbol does for the caller, in the present tense. Longer explanation goes in `@remarks`.
- Documents every parameter and type parameter with `@param` and `@typeParam`, giving intent and any constraint, unit, or accepted range rather than the type. A `@param` MAY be left out only when the name already fixes the meaning exactly.
- Documents the returned value with `@returns`, including the states a caller must handle, such as an empty collection, `null`, or a failed result. Leave it out for `void`.
- Gives one `@throws` per error type, with the condition that triggers it. A symbol that reports failure by return value instead says so where a reader would expect a throw.
- Gives `@defaultValue` to an optional parameter or property whose default a caller cannot infer.
- Carries `@deprecated` with the replacement and, when known, the version that removes it.
- Documents each public member of a class or interface with its own TSDoc. A bare member is an incomplete API.
- Prefers `{@link OtherSymbol}` to repeating another symbol's contract.

`@example` blocks are encouraged for any non-obvious usage; each MUST be realistic and compile against the current API.

An export needed only to compose entrypoints SHOULD stay out of public entrypoints. When one cannot, mark it `@internal`.

oxlint checks the structure of the tags.

For `private: false` workspace packages, every symbol exposed through `package.json` `exports` is public API, including plugin factories and CSS or token surfaces represented in TypeScript, and the MUST above applies to all of them. [`docs/specs/packages-documentation.md`](../specs/packages-documentation.md) defines the public package documentation contract, and [`docs/specs/packages-readme.md`](../specs/packages-readme.md) the README requirements. An `@internal` export stays out of package README examples, and a change to the API updates the package's public docs and LLM documentation along with its README.

Weak tags become weak public prose: the generated API reference ([`docs/specs/packages-reference.md`](../specs/packages-reference.md)) renders these tags directly, so a missing `@throws` or a type-restating `@param` reaches consumers, not just reviewers.

`hub check` enforces the TSDoc rule: it reports `undocumented-export/missing-jsdoc` errors for undocumented top-level declarations exposed through typed package exports, following re-exports to their original declarations. It covers public packages and private packages that declare `codenhub.docs`, independently of generated reference opt-in. Missing documentation fails local verification and pull-request CI. Class and interface members remain a review responsibility, as does the quality of the documentation.

## Formatting, linting, and type checking

- oxfmt formats code and JSON, and Prettier formats Markdown. While working, `pnpm format:check`, `pnpm lint:check`, and `pnpm typecheck` run the gate's parts on their own; [Workspace](../workspace.md#root-scripts) lists them.

<!-- Conventions for the project's frameworks and styling, for example a section per framework. -->
