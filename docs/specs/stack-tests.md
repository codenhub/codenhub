---
status: APPROVED
last_updated: 2026-11-09
scope: How the test categories run with Vitest and Playwright: file names, configuration, scripts, coverage reports, and commands.
---

# Tests with Vitest and Playwright

The [testing specification](tests.md) defines the categories, where they live, and what they cover. This document says how they run on this stack.

## Runners and file names

| Category    | Runner                                | File                                                               | Runs with           |
| ----------- | ------------------------------------- | ------------------------------------------------------------------ | ------------------- |
| Unit        | [Vitest](https://vitest.dev/)         | `<file>.test.ts` or `.tsx`, next to `<file>.ts`, usually in `src/` | `pnpm test`         |
| Integration | Vitest                                | `<package>/tests/<suite>/`, such as `tests/integration/`           | `pnpm test`         |
| Browser     | [Playwright](https://playwright.dev/) | `<package>/tests/e2e/` or `<package>/tests/browser/`               | `pnpm test:browser` |

## Configuration

- A package or app that needs custom options, such as path aliases, environment variables, plugins, or a DOM environment, MUST include its own explicit configuration file, `vitest.config.ts` or `playwright.config.ts`, and not `vite.config.ts`: a runner that discovers packages by their `vitest.config.ts` would silently leave one configured through `vite.config.ts` out of `pnpm test`. Do not rely on implicit or undocumented fallback behavior. How the runs are put together is [tooling](../tooling.md)'s.
- Test scripts MUST NOT chain their own build step. Build ordering belongs to the root tooling, as [Tooling](../tooling.md) describes.
- A package that defines its own test scripts uses the root names and meanings:
  - `test`: runs unit and integration tests once, and nothing that needs a browser.
  - `test:watch`: runs those tests in watch mode.
  - `test:coverage`: runs those tests and writes a coverage report.
  - `test:browser`: runs the browser suite, when the package has one.
  - `test:browser:watch`: runs the browser suite in an interactive or UI mode, when the project offers one.

## Browser suites

- `pnpm test`, `pnpm test:watch`, and `pnpm test:coverage` MUST NOT reach a browser suite, directly or through another script.
- A project with a browser suite adds a `test:browser` script, at the root and in each package that has one. [Tooling](../tooling.md) records whether `pnpm verify` runs it and how browsers are installed. A package does not install browsers from its own scripts.
- Every Playwright project name ends in the engine it runs on, `chromium`, `firefox`, or `webkit`, optionally prefixed to distinguish surfaces (`app-chromium`). CI can then run one engine per job by selecting on the name, and a project named anything else cannot silently drop out of that selection. [CI](../ci.md) describes how jobs select engines.
- A Playwright config MUST set `retries: process.env.CI ? 1 : 0`, unless it states why it needs more. A test that passes on its retry is reported as `flaky`, not as passed, so the retry keeps one timing failure from failing a merge without hiding it, and a test that fails twice still fails the run. Locally there is no retry, so a flake shows up where it can be fixed. The cost is that a flaky test stays green until someone reads the summary line; a test that shows up there is fixed rather than retried more. Without retries, codenhub/codenhub's full run failed 3 of 30 merges on 2026-11-03, each on one timing-sensitive Firefox test ([codenhub/codenhub@702af904](https://github.com/codenhub/codenhub/commit/702af904)).
- A suite whose tests do not read cookies, storage, or permissions left by an earlier test SHOULD share one browser context per worker and take a fresh page per test. Playwright builds a context per test by default, and the engines price that very differently: on one suite in codenhub/codenhub, a fresh context cost Firefox about 2.6 s against Chromium's 0.3 s, the whole gap between them ([codenhub/codenhub@7aad1c19](https://github.com/codenhub/codenhub/commit/7aad1c19ff7a1b43db939ddff6a0ac435fe8bc5d)). Writing such state does not disqualify a suite; reading it back across a test boundary does. A suite whose assertions rely on state an earlier test left behind MUST keep the default. A suite that shares a context MUST reset whatever the page under test persists before each test, not after, so the reset holds even when a test fails partway.

## Coverage

`pnpm test:coverage` runs each package's `test:coverage` in that package's directory, which writes a V8 coverage report to the package's own `coverage/`. `@codenhub/styles` is CSS only and runs its integration tests instead, as its [exception](packages-exceptions.md#codenhubstyles-coverage-report) records.

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
