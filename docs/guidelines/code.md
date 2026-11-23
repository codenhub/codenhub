---
status: IMPLEMENTED
last_updated: 2026-11-22
scope: Coding conventions for every package and app in the workspace.
---

# Coding guidelines

This document outlines the patterns, conventions, and guidelines to follow when working on this codebase. The [testing specification](../specs/tests.md) owns how tests are organized and run, and the [security guidelines](security.md) own how code keeps the project's security commitments. The [stack guidelines](stack.md) add the conventions of the project's languages and the tools that check them, such as casing and the format of API documentation.

## Naming

- Casing: each language's convention, which the [stack guidelines](stack.md#naming) name.
- Booleans: prefixed with is, has, can, or should (`isLoading`, `hasPermission`).
- Arrays: plural nouns (`users`, `items`).
- Functions: verb phrases (`calculateTotal`, `fetchUser`).

Name by domain intent. Avoid names that say only the type or the mechanism, such as `data`, `item`, `manager`, or `helper`, unless the scope makes the meaning obvious.

## Architecture and design

- Single responsibility: each function, class, and module does one thing well.
- High cohesion: logic that belongs together stays together.
- Loose coupling: minimize dependencies between modules.
- Prefer dependency injection to hard-coding. Whatever makes code hard to test or tied to one environment, such as the clock, randomness, the network, and storage, arrives as a dependency.
- Keep each package's public surface small and intentional.
- Keep dependency direction clear: shared code does not import app-specific code.
- Do not add compatibility layers unless there is a real consumer, persisted data, shipped behavior, or explicit requirement that needs one.

Workspace packages live in `packages/` and the sites in `apps/`. An app may import packages; a package never imports an app. A public package installs its public siblings from their npm releases through the catalog, never from the working tree, so it is built and tested against what its consumers install; [`docs/specs/packages-lifecycle.md`](../specs/packages-lifecycle.md), "Ranges", owns that rule. `packages/tools` is private, and every package builds and checks with it.

### Few dependencies

The project keeps what its packages depend on as close to zero as it can, and prefers owning a part to depending on a third party for it. Do not add a dependency unless simple in-house code is clearly worse.

The principle is about what reaches a package's consumers: its `dependencies`, any peer it requires, and any third-party tool that decides what the package ships, such as the compiler its stylesheets are built with. Tools that check or package the code without shaping what a consumer receives, such as TypeScript, the test runner, the bundler, and the formatter, are held only to the sentence above.

- **A tool consumers may already run is an adapter, never a requirement.** A package supports Tailwind CSS, Vite, PostCSS, or a framework through an entry point of its own, optional and never required, and every package works without it. Tailwind CSS is in this repository for compatibility with the projects that run it, not as a source of utilities.
- **A tool used to start faster is a step.** A dependency taken because it was quicker to build on stays until the package owns the part it covers, and the package's roadmap records that plan, as [the build styles owns](../../packages/styles/docs/internal/roadmap.md#a-build-the-package-owns-with-tailwind-as-an-adapter) does.
- **Code two packages share starts private,** as [A private workspace package](../specs/packages-lifecycle.md#a-private-workspace-package) describes.

Each dependency costs a consumer in three ways, as the `@codenhub/styles` [build command](../../packages/styles/docs/internal/cli.md#the-command-tree-shakes-it-does-not-compile) shows: an install they would not otherwise make, an output that varies with a version this repository can neither test nor pin, and behavior the package has to work around rather than decide. The cost accepted in exchange is code the project writes and maintains itself.

The principle does not remove a dependency by itself. An existing one stays until a change weighs it and finds owning the part worth that code.

Rejected: a third-party tool as the foundation a package is built on. It is the fastest start, and it makes every later feature a design around another project's compiler, and every major release of that project a port of the package.

### Fix it upstream

When a dependency lacks something or gets it wrong, the fix goes upstream where the project can report it, and the project takes it from a release. A local workaround is temporary and names the issue it waits on, as [a defect found mid-task](../../CONTRIBUTING.md#a-defect-found-mid-task) describes. That holds for a third-party dependency as much as for one the project or its owner maintains; only the latter is fixed upstream by the project itself.

## Code

- Functions are small and clearly nameable.
- Avoid magic numbers and strings: extract a value to a named constant when it has domain meaning or is reused.
- Code should explain itself through its names.
- Design for predictable, deterministic behavior. Time and randomness come from an injected source, so a test controls them.
- Avoid god objects, feature envy, and long method chains.
- Prefer readable code to clever code.

Literal values MAY stay inline when extraction makes code worse, such as protocol literals, header names, package names, CSS selectors, event names, SQL, test fixtures, one-off validation messages, and external API values used once near their boundary.

Function parameters:

- 0–1 parameters: excellent.
- 2 parameters: acceptable.
- 3 or more: refactor into an options object.

Exceptions: framework callbacks, test helpers, tiny local functions, and APIs where an object parameter would hide meaning instead of improving it.

## Concurrency and errors

- Run independent asynchronous work concurrently. Waiting for each in turn needs a reason, given where the code does it.
- Do not swallow errors silently.
- Throw or return errors with enough context to debug them.
- Do not log secrets, tokens, credentials, or private user data.
- Logging is not a substitute for error handling.

## Inputs, failures, and state

Most review findings that hold up are about these, not about style: a [study of this repository's review threads](../../packages/skills/docs/internal/coding-skill-research.md) records the evidence.

- Validate input from outside the code's control after it is converted, against the limits of what consumes it: `--timeout 1e308` passes "positive number" and becomes an infinite timer. Reject empty, whitespace-only, NaN, Infinity, and partial numbers such as `10s`.
- When required input is missing or matches nothing, fail with a message naming it. A run whose required input was absent never reports success.
- Hold unsaved changes in memory freely; that needs no write. Mark them as saved, such as a record's saved status or a cache entry's committed flag, only after the write succeeds, and never swallow a write error. A record shown as saved whose write failed is lost the next time the process restarts, and nobody was told.
- Apply a new option or fix to every path the same input or behavior flows through: each source of the value, sync and async variants, create and update, and every caller. Name any path left out, with the reason.
- A hand-written parser rejects syntax it does not support, naming the file and line, instead of reading it as data.
- Keep input order and any order a contract defines; sort output whose order is unspecified by a defined key with a tie-breaker.

## Testing

- Test behavior, edge cases, and error paths, not just the happy path.
- One behavior per test, named by the behavior it proves, as a sentence (`returns an empty list when the input is null`).
- Unit tests sit next to the code they test.
- Mock the network, timers, and browser APIs. Test code whose job is file or database access against a real temporary directory or database where practical, and mock them elsewhere. Pure logic is tested directly.
- Give each behavior decision a test that fails when the decision is reversed, and see a new test fail before keeping it.
- A test that writes files uses its own directory under the system temporary directory, never the package or the current directory, and removes it afterwards.
- Poll for a condition instead of sleeping a fixed time.
- Prefer observable behavior to implementation details.
- A change in behavior changes its tests in the same change.

Rejected: mocking the filesystem and storage everywhere, because a mock answers only what the test tells it, so it cannot show containment, symlink, and stale-output bugs; a real temporary directory does.

The [testing specification](../specs/tests.md) defines the test categories, configuration, scripts, and coverage target.

## Documentation in code

- Comments explain why, not what or how.
- Remove redundant comments, decorations, and outdated docs, in the change that makes them outdated.

Every symbol a published package exports is that package's API and MUST have API documentation in source, even when a README also documents it, in the format the [stack guidelines](stack.md) give. A private package's exports SHOULD have it too: their callers are the project's own code, which a reviewer can read, so a missing entry costs less there. The documentation describes the caller-facing purpose, important inputs, return values or side effects, and observable failure, including the states a caller must handle and the conditions under which it fails. It MUST NOT restate the type signature in prose or describe private implementation details. An example in it MUST be realistic and work against the current API.

When a change touches a package's exports or its observable behavior or failures, it updates the API documentation and every README or document describing them in the same change. Whether every export is documented, and how well, is a review responsibility unless the project enforces it, as the stack guidelines then record.

## Formatting, linting, and type checking

- Code MUST pass `pnpm verify`. [Workspace](../workspace.md) lists what it runs.
- Do not fight the formatter's output.
- Lint rules are enforceable project policy. Change the rule, or add a scoped override with its reason recorded, rather than ignoring it broadly. A local suppression comment says why it is there.
