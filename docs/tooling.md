---
status: IMPLEMENTED
last_updated: 2026-08-06
scope: Repository-wide developer tooling and root workspace scripts.
---

# Repository tooling

Root workspace scripts are thin wrappers around `hub`, the workspace-aware CLI in
`packages/tools`. It owns package selection, execution order, and reporting so
package manifests stay minimal and root scripts stay short.

## Why it exists

Before `hub`, root scripts fanned out with `pnpm -r --if-present <script>`. That
made it impossible to narrow a run to one file, forced every package to chain its
own `pnpm build &&` prefix, and let a single hanging package block the whole
workspace. Those three problems are the tool's reason to exist; new commands
should solve comparable repository-wide problems rather than wrap a tool that is
already convenient on its own.

## Running it

```sh
hub <command> [targets...] [options] [-- tool arguments]
```

`hub` is available through the root `hub` script and as a local binary. It finds
the repository root by walking up to `pnpm-workspace.yaml`, so it behaves the same
from any directory.

Root scripts map directly onto it:

| Root script          | Command             |
| -------------------- | ------------------- |
| `pnpm build`         | `hub build`         |
| `pnpm cloc`          | `hub cloc`          |
| `pnpm format:check`  | `hub format`        |
| `pnpm format:fix`    | `hub format --fix`  |
| `pnpm lint:check`    | `hub lint`          |
| `pnpm lint:fix`      | `hub lint --fix`    |
| `pnpm packages`      | `hub list`          |
| `pnpm status:npm`    | `hub status:npm`    |
| `pnpm status:pack`   | `hub status:pack`   |
| `pnpm test`          | `hub test`          |
| `pnpm test:coverage` | `hub test:coverage` |
| `pnpm test:watch`    | `hub test:watch`    |
| `pnpm typecheck`     | `hub typecheck`     |

A command name without its own definition runs the package script of that name,
so package-specific scripts such as `dev` and `debug` work without registration.

## Targets

Every command takes the same selectors, resolved through one fallback chain:

| Target                              | Resolves to                                  |
| ----------------------------------- | -------------------------------------------- |
| _(omitted)_                         | every workspace package                      |
| `error`                             | a package directory name                     |
| `@codenhub/error`, `error`          | a package manifest name, scoped or unscoped  |
| `packages/error`                    | a workspace location                         |
| `packages/error/src/bucket.test.ts` | the owning package, with the path forwarded  |
| `packages/*/src/**/*.test.ts`       | a glob, expanded across packages             |
| `--changed`                         | packages with branch or working-tree changes |

Tokens are resolved in that order: alias, then existing path, then glob, then a
path relative to an already selected package. This is why
`hub test error src/bucket.test.ts` works after `error` is selected.

Manifest names and workspace locations always outrank directory names. `icons`
selects `@codenhub/icons`, never the nested `packages/plugins/vite/icons`. A
selector that matches several packages at the same rank fails and lists the
candidates instead of guessing; an unrecognized selector fails with suggestions.

Only file paths are forwarded to the underlying tool, and only for commands that
accept them (`test`, `test:coverage`, `test:watch`). Other commands treat a path
as a way to name its package.

`--changed` narrows an explicit selection and replaces an empty one, so
`hub test --changed` runs changed packages and `hub test error --changed` runs
`error` only when it changed.

## Execution order

`hub` owns build ordering. `test`, `test:coverage`, `test:watch`, `typecheck`,
and `status:pack` build their packages first, which is why package manifests MUST
NOT chain `pnpm build &&` into those scripts. Chaining it again would double every
build.

Prerequisite builds cover the selected packages only. Pass `--deps` to include
their workspace dependencies, or `--no-build` to skip the step entirely.

`prepublishOnly` is exempt: npm runs it outside `hub`, so it MUST remain
self-contained.

## Options

| Option                | Effect                                                               |
| --------------------- | -------------------------------------------------------------------- |
| `--changed[=<ref>]`   | Narrow to packages changed against `<ref>`. Defaults to `main`.      |
| `--parallel[=<n>]`    | Run up to `<n>` packages at once. Output is buffered when above one. |
| `--bail`              | Stop after the first failing package.                                |
| `--no-build`          | Skip prerequisite builds.                                            |
| `--deps`              | Include workspace dependencies in prerequisite builds.               |
| `--timeout=<seconds>` | Kill a package run after `<seconds>`. Defaults to 600.               |
| `--no-timeout`        | Never kill a package run.                                            |
| `--dry-run`           | Print the commands that would run.                                   |
| `--fix`               | Apply fixes instead of only reporting.                               |
| `--json`              | Emit machine-readable output where supported.                        |
| `-h`, `--help`        | Show usage.                                                          |

Unrecognized flags and everything after a bare `--` are forwarded to the
underlying tool, so `hub test error --reporter=verbose` reaches Vitest unchanged.

Package runs are killed when they exceed `--timeout`. This is what keeps one
hanging browser-test worker from blocking a whole workspace run.

## Repository-wide tools

`lint`, `format`, and `cloc` run their tool once from the repository root with
resolved paths rather than once per package. Selecting nothing falls back to the
whole repository, which is why `pnpm cloc` needs no argument.

## Adding a command

Commands are registered in `packages/tools/src/commands/registry.ts` and built
from two factories:

- `createScriptCommand` for anything that runs a package script per package.
- `createRootToolCommand` for anything that runs one executable once from the
  repository root.

Anything else implements `CommandDefinition` directly and receives a
`CommandContext` with the resolved workspace, selection, options, and reporter.
Selection, execution, and reporting are shared; a new command should not resolve
targets or spawn processes on its own.

## Planned

These are approved directions, not current behavior:

- `hub check`: package compliance derived from `docs/specs/packages-lifecycle.md`
  and the validation list in `docs/specs/packages-documentation.md`.
- `hub generate`: `llms-full.txt` generation and a generated root README package
  list. `llms.txt` stays hand-authored per
  `docs/specs/packages-documentation.md`.
- Sharing the documentation model in `apps/docs/src/lib/` with `hub` instead of
  maintaining two implementations of the same documentation contract.
