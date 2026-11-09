---
status: APPROVED
last_updated: 2026-11-08
scope: Test categories, where each lives, tooling, scripts, and coverage expectations.
---

# Tests

This document defines how the project is tested: what kinds of tests exist, where they live, how they run, and what they are expected to cover. The conventions for writing an individual test are in the [coding guidelines](../guidelines/code.md#testing).

## Principles

- **Test behavior, not implementation.** A test verifies what a caller can observe, not how the code produces it.
- **Fast and deterministic.** A flaky test is a bug. Time, randomness, and the network come from sources a test controls; a test that depends on real timing, the network, or a real window does not belong in the default suite.
- **Error paths count.** Failure cases are tested as carefully as the happy path, and inputs and edge cases early.
- **No permanent absence checks.** A test asserting only that a removed name, class, or token is gone (`not.toContain("old-name")`) verifies nothing about current behavior: it is indistinguishable from asserting the absence of a string that never existed. Such a check earns its place only while a rename or removal is in flight, as a guard against a forgotten reference; delete it once the change is verified, in the same pull request. A durable rule, such as "no compatibility aliases", is a lint rule or repository check, not a permanent unit test.

## Categories

| Category    | Where                                                | Runs with             | Covers                                                                       |
| ----------- | ---------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| Unit        | Next to the code: `src/<file>.test.ts` or `.tsx`     | `pnpm test`           | One module, its boundaries replaced by fakes.                                |
| Integration | `<package>/tests/integration/`                       | `pnpm test`           | Several modules together, or a real boundary such as a database or a server. |
| Browser     | `<package>/tests/e2e/` or `<package>/tests/browser/` | Its own script, below | Full user journeys, rendering, and visual regression in real browsers.       |

Unit and integration tests use [Vitest](https://vitest.dev/); browser tests use [Playwright](https://playwright.dev/). Add a category only when the project has tests for it: an empty suite, or a script that passes without running anything, misleads more than a missing one.

Manual usage scenarios, such as a playground used during development, are outside these categories.

### Unit tests

- A test file is named after the file it covers: `store.ts` is tested by `store.test.ts`.
- What to mock, and what to test against real temporary state instead, is owned by the [coding guidelines](../guidelines/code.md#testing).
- Do not import test utilities across distant packages, except from a package or subpath that exists to share them.

### Integration tests

- Integration tests live inside the package or app they belong to. Do not add a repository-root `tests/` directory by default.
- When a journey or orchestration genuinely spans packages, a dedicated workspace package for those tests is allowed, rather than placing them in one of the packages they cross.

### Browser tests

- Browser suites are configured and run apart from `pnpm test`, so the loop everyone runs constantly stays fast and needs no browser installed. `pnpm test`, `pnpm test:watch`, and `pnpm test:coverage` MUST NOT reach a browser suite, directly or through another script.
- A project with a browser suite adds a `test:browser` script, at the root and in each package that has one. [Tooling](../tooling.md) records whether `pnpm verify` runs it and how browsers are installed. A package does not install browsers from its own scripts.
- Every Playwright project name ends in the engine it runs on, `chromium`, `firefox`, or `webkit`, optionally prefixed to distinguish surfaces (`app-chromium`). CI can then run one engine per job by selecting on the name, and a project named anything else cannot silently drop out of that selection. [CI](../ci.md) describes how jobs select engines.
- A suite SHOULD cover every engine its users run, because catching what one engine does differently is what the suite is for.
- Add visual regression tests once a component has an agreed visual design, not for placeholder interfaces.
- A Playwright config MUST set `retries: process.env.CI ? 1 : 0`, unless it states why it needs more. A test that passes on its retry is reported as `flaky`, not as passed, so the retry keeps one timing failure from failing a merge without hiding it, and a test that fails twice still fails the run. Locally there is no retry, so a flake shows up where it can be fixed. The cost is that a flaky test stays green until someone reads the summary line; a test that shows up there is fixed rather than retried more. Without retries, codenhub/codenhub's full run failed 3 of 30 merges on 2026-11-03, each on one timing-sensitive Firefox test ([codenhub/codenhub@702af904](https://github.com/codenhub/codenhub/commit/702af904)).
- A suite whose tests do not read cookies, storage, or permissions left by an earlier test SHOULD share one browser context per worker and take a fresh page per test. Playwright builds a context per test by default, and the engines price that very differently: on one codenhub/codenhub suite a fresh context cost Firefox about 2.6 s against Chromium's 0.3 s, the whole gap between them. Writing such state does not disqualify a suite; reading it back across a test boundary does. A suite whose assertions rely on state an earlier test left behind MUST keep the default. A suite that shares a context MUST reset whatever the page under test persists before each test, not after, so the reset holds even when a test fails partway.

## Configuration

- A package or app that needs custom options, such as path aliases, environment variables, plugins, or a DOM environment, MUST include its own explicit configuration file, `vitest.config.ts` or `playwright.config.ts`, and not `vite.config.ts`: a runner that discovers packages by their `vitest.config.ts` would silently leave one configured through `vite.config.ts` out of `pnpm test`. Do not rely on implicit or undocumented fallback behavior. How the runs are put together is [tooling](../tooling.md)'s.
- Test scripts MUST NOT chain their own build step. Build ordering belongs to the root tooling, as [Tooling](../tooling.md) describes.
- A package that defines its own test scripts uses the root names and meanings:
  - `test`: runs unit and integration tests once, and nothing that needs a browser.
  - `test:watch`: runs those tests in watch mode.
  - `test:coverage`: runs those tests and writes a coverage report.
  - `test:browser`: runs the browser suite, when the package has one.
  - `test:browser:watch`: runs the browser suite in an interactive or UI mode, when the project offers one.

## Coverage

`pnpm test:coverage` writes a V8 coverage report to `coverage/`. The suggested target is **80%**. It guides development and review; it is not a gate and never fails a build, because a coverage threshold that blocks merges gets satisfied with tests that execute lines without asserting anything.

## Not covered by automated tests

Behavior that no automated test reaches is listed here with how it is verified instead, usually by hand, and why a suite was not added. A gap that is written down can be judged; a gap nobody recorded is found by a user.

### Codenhub specifics

Manual package usage scenarios use the optional `playground`, `dev`, and `debug` workflow in [`docs/specs/packages-development.md`](packages-development.md), meant for development or pre-ship debugging rather than automated runs.

Browser suites here:

- `pnpm verify` runs `pnpm test` and `pnpm test:browser` both. A package that declares a Playwright config MUST define `test:browser`, and `hub check` reports a missing one as it reports a `test`, `test:coverage`, or `test:watch` script that reaches a browser suite.
- Browsers are installed by `hub browsers`, which `hub test:browser` runs first. A package MUST NOT install browsers from its own scripts, because two packages doing that would download into one shared cache twice.
- Every package's browser suite SHOULD cover all three engines. `@codenhub/toaster` shows the prefixed naming, with `source-chromium` and `package-chromium`.
- Style sheets and components use visual regression tests to capture visual changes before merge.
- `packages/styles` shares one context per worker in `tests/browser/fixtures.ts`, which brought its Firefox run from 285 s to 84 s. Its playground stores the theme and aesthetic in local storage, so the fixture empties it as each document starts, which costs no round trip.

A target may be a package name, a workspace directory, a path, or a glob, and `--changed` selects the packages a branch changed:

```sh
pnpm test error
pnpm test packages/error/src/bucket.test.ts
pnpm test:coverage error
pnpm test:browser styles
pnpm test:browser:watch styles
pnpm test --changed
```

## Commands

Run tests from the repository root.

```sh
pnpm test
pnpm test:watch
pnpm test:coverage
```

Narrow a run while working on one area. A path after the script is forwarded to Vitest, so a single directory or file runs on its own:

```sh
pnpm test packages/<name>
pnpm test packages/<name>/src/<file>.test.ts
pnpm test:watch packages/<name>
```

[Tooling](../tooling.md) describes the other ways to narrow a run.
