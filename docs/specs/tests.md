---
status: APPROVED
last_updated: 2026-08-30
---

# Testing specification

This document outlines the testing strategy, architecture, and standards for this repository. It defines test categories, tooling, configuration requirements, and code coverage targets.

## Philosophy

- **Test Behavior, Not Implementation**: Write tests that verify the observable behavior of your API or component, rather than its internal implementation details.
- **No Permanent Absence Checks**: A test asserting only that a removed name, class, or token is gone (e.g. `not.toContain("old-name")`) verifies nothing about current behavior — it is indistinguishable from asserting the absence of a string that never existed. Such a check earns its keep only while a rename or removal is in flight, as a guard against a forgotten reference; delete it once the change is verified, in the same pull request. If the check encodes a durable rule (e.g. "no backward-compat aliases"), express that as a repository lint/check in `packages/tools`, not as a permanent unit test.
- **Fast and Deterministic**: Tests must run quickly and yield consistent, predictable results. Flaky tests are unacceptable.
- **Fail Fast**: Test inputs and edge cases early. Ensure error paths are tested alongside happy paths.

## Test Categorization

Tests in this repository are divided into three distinct categories based on their scope and isolation level.

Manual package usage scenarios are outside this categorization. Use the optional `playground`, `dev`, and `debug` workflow from `docs/specs/packages-development.md` for real usage scenarios that are meant for development or pre-ship debugging rather than automated test execution.

### 1. Unit Tests

Unit tests verify the correctness of small, isolated blocks of code (such as individual functions, classes, or hooks) in isolation.

- **Location**: Colocated in the same directory as the source code they verify.
- **File Naming**: `[filename].test.ts` or `[filename].test.tsx` (e.g., `src/normalize.test.ts`).
- **Tooling**: [Vitest](https://vitest.dev/).
- **Conventions**:
  - Mock external dependencies (network APIs, local storage, databases, file system, timers, and browser-specific globals).
  - Do not cross-import test utilities across distant packages unless exposed via explicit shared test packages.
  - Run automatically during local development and on every pull request.

### 2. Integration Tests

Integration tests verify that multiple modules or packages interact correctly, including boundaries such as database adapters, network middleware, or cache layers.

- **Location**: Housed in a `tests/integration/` directory inside the package or application root (e.g., `packages/store/tests/integration/`).
- **Tooling**: [Vitest](https://vitest.dev/).
- **Conventions**:
  - Do not use a repository-root global `tests/` directory by default. Keep tests colocated within the package/app scope.
  - Do not create a hard rule banning global repository-level integration directories if complex, multi-package orchestration tests become necessary in the future.

### 3. End-to-End (E2E) & Visual Tests

E2E tests verify full user journeys, page transitions, rendering, and visual regression across real browser environments.

- **Location**: Housed in `tests/e2e/` or `tests/browser/` directories within the target application or specialized styling packages.
- **Tooling**: [Playwright](https://playwright.dev/).
- **Conventions**:
  - Use visual regression testing for style sheets and components to capture visual changes before merge.
  - Since E2E tests are slower and require browser environments, configure them separately to avoid blocking fast unit test loops.
  - Browser suites MUST be reachable only through `test:browser`. A package that declares a Playwright config MUST define that script, and `test`, `test:coverage`, and `test:watch` MUST NOT reach a browser suite, directly or through another script. `hub check` reports both.
  - Browsers are installed by `hub browsers`, which `hub test:browser` runs first. A package MUST NOT install browsers from its own scripts, because two packages doing that would download into one shared cache twice.
  - Every Playwright project name MUST end in the engine it runs on — `chromium`, `firefox`, or `webkit` — optionally prefixed to distinguish surfaces, as `@codenhub/toaster` does with `source-chromium` and `package-chromium`. CI runs one engine per job and selects it across every package with `--project='*<engine>*'`, so a project named anything else drops out of that job silently rather than failing it. See `docs/ci.md`.
  - A package with a browser suite SHOULD cover all three engines. The suites exist to catch what one engine does differently from another, which a single-engine run cannot do.
  - A browser suite whose tests carry no cookies, storage, or permissions SHOULD share one browser context per worker and take a fresh page per test, as `packages/styles` does in `tests/browser/fixtures.ts`. Playwright builds a context per test by default, and the engines price that very differently: on that suite a fresh context cost Firefox about 2.6s against Chromium’s 0.3s, which was the whole of the gap between them. A suite that does carry such state MUST keep the default, and a suite that shares a context MUST reset whatever the page under test persists — the styles playground stores its theme and aesthetic in local storage, so the fixture empties it as each document starts.

## Configuration Requirements

To maintain clean and explicit testing setups, follow these configuration rules:

- **Config Files**:
  - If a package or application requires custom options (such as path aliases, environment variables, vitest plugins, or specific setups), it **MUST** include an explicit configuration file (`vite.config.ts`, `vitest.config.ts`, or `playwright.config.ts`).
  - Do not rely on implicit or undocumented fallback behavior.
- **Package Scripts**:
  - Every testable package or app `package.json` must expose standard test scripts:
    - `"test"`: Runs unit and integration tests once, and nothing that needs a browser.
    - `"test:watch"`: Runs those tests in interactive watch mode.
    - `"test:coverage"`: Runs those tests and outputs a coverage report.
  - A package with a browser suite must also expose:
    - `"test:browser"`: Runs the browser suite once.
    - `"test:browser:watch"`: Runs the browser suite in Playwright's UI mode.

## Code Coverage

- **Suggested Target**: **80%** code coverage.
- **Non-Blocking Target**: Code coverage is a target to guide development and review discussions. It must not block the CI/CD pipeline or fail builds due to minor discrepancies, preventing false-positive failures and unnecessary development overhead.

## Execution Commands

Always run tests from the repository root. Test scripts MUST NOT chain their own
build step; `docs/tooling.md` defines how build ordering is owned by the root
tooling instead.

### Workspace-wide Checks

```sh
pnpm test
pnpm test:browser
pnpm test:coverage
```

`pnpm test` covers unit and integration tests, and `pnpm test:browser` covers the
browser suites of the packages that have one, installing their browsers first.
`pnpm verify` runs both. Keeping them apart is what lets the loop everyone runs
constantly stay a few seconds long.

### Narrowed Checks

Prefer a narrowed run when working on a single package, a single file, or a set
of changed packages:

```sh
pnpm test error
pnpm test packages/error/src/bucket.test.ts
pnpm test:watch error
pnpm test:coverage error
pnpm test:browser styles
pnpm test:browser:watch styles
pnpm test --changed
```

A target may be a package name, a workspace directory, a path, or a glob. File
paths are forwarded to Vitest, so a single test file runs on its own. See
`docs/tooling.md` for the full selector and option surface.
