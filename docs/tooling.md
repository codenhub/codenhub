---
status: IMPLEMENTED
last_updated: 2026-08-09
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

The Node and pnpm versions it runs under are pinned by `engines`,
`packageManager`, and `.nvmrc`, and an install outside that range fails rather
than warns. `docs/ci.md` explains where each version is declared.

Root scripts map directly onto it:

| Root script          | Command             |
| -------------------- | ------------------- |
| `pnpm build`         | `hub build`         |
| `pnpm check`         | `hub check`         |
| `pnpm clean`         | `hub clean`         |
| `pnpm cloc`          | `hub cloc`          |
| `pnpm format:check`  | `hub format`        |
| `pnpm format:fix`    | `hub format --fix`  |
| `pnpm generate`      | `hub generate`      |
| `pnpm lint:check`    | `hub lint`          |
| `pnpm lint:fix`      | `hub lint --fix`    |
| `pnpm packages`      | `hub list`          |
| `pnpm prepare`       | installs git hooks  |
| `pnpm status:npm`    | `hub status:npm`    |
| `pnpm status:pack`   | `hub status:pack`   |
| `pnpm test`          | `hub test`          |
| `pnpm test:browser`  | `hub test:browser`  |
| `pnpm test:coverage` | `hub test:coverage` |
| `pnpm test:watch`    | `hub test:watch`    |
| `pnpm typecheck`     | `hub typecheck`     |
| `pnpm verify`        | `hub verify`        |

`hub browsers`, `hub new`, and `hub release` have no root script of their own.
They are occasional commands rather than part of a change loop, and they read as
what they are through `pnpm hub <command>`.

A command name without its own definition runs the package script of that name,
so package-specific scripts such as `dev` and `debug` work without registration.

## Targets

Every command SHOULD be given a target. Omitting one covers the whole workspace,
which is a deliberate choice rather than a convenient default: a repo-wide `test`
takes minutes, while the same command narrowed to one package takes seconds. Work
on a package by naming it from the repository root, and reserve the omitted form
for final verification before delivering a change and for commands that are
repo-wide by nature, such as `cloc`.

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
accept them (`test`, `test:browser`, `test:browser:watch`, `test:coverage`,
`test:watch`). Other commands treat a path as a way to name its package.

`--changed` narrows an explicit selection and replaces an empty one, so
`hub test --changed` runs changed packages and `hub test error --changed` runs
`error` only when it changed.

Every command narrows to one package, including `check` and `generate`. Two
generated artifacts are workspace-wide and are therefore skipped by a narrowed
`hub generate`: the root README package list is only rewritten when the selection
covers the whole workspace. Run `pnpm generate` unfiltered before delivering a
change that touched package metadata.

## Execution order

`hub` owns build ordering. `test`, `test:browser`, `test:browser:watch`,
`test:coverage`, `test:watch`, `typecheck`, and `status:pack` build their packages
first, which is why package manifests MUST NOT chain `pnpm build &&` into those
scripts. Chaining it again would double every build.

Prerequisite builds cover the selected packages only. Pass `--deps` to include
their workspace dependencies, or `--no-build` to skip the step entirely.

`prepublishOnly` is exempt: npm runs it outside `hub`, so it MUST remain
self-contained.

## Options

| Option                | Effect                                                                |
| --------------------- | --------------------------------------------------------------------- |
| `--changed[=<ref>]`   | Narrow to packages changed against `<ref>`. Defaults to `main`.       |
| `--parallel[=<n>]`    | Run up to `<n>` packages at once. Output is buffered when above one.  |
| `--bail`              | Stop after the first failing package.                                 |
| `--no-build`          | Skip prerequisite builds.                                             |
| `--deps`              | Include workspace dependencies in prerequisite builds.                |
| `--skip=<steps>`      | Leave verification steps out of a `verify` run.                       |
| `--timeout=<seconds>` | Kill a package run after `<seconds>`. Defaults to 600.                |
| `--no-timeout`        | Never kill a package run.                                             |
| `--dry-run`           | Print the commands that would run.                                    |
| `--fix`               | Apply fixes instead of only reporting.                                |
| `--pack`              | Let `check` run `npm pack --dry-run` to inspect publishable contents. |
| `--json`              | Emit machine-readable output where supported.                         |
| `-h`, `--help`        | Show usage.                                                           |
| `--version`           | Print the tooling version.                                            |

Unrecognized flags and everything after a bare `--` are forwarded to the
underlying tool, so `hub test error --reporter=verbose` reaches Vitest unchanged.

Package runs are killed when they exceed `--timeout`. This is what keeps one
hanging browser-test worker from blocking a whole workspace run.

## Repository-wide tools

`lint`, `format`, and `cloc` run their tool once from the repository root with
resolved paths rather than once per package. Selecting nothing falls back to the
whole repository, which is why `pnpm cloc` needs no argument.

## Browser tests

`hub test` runs unit tests only. Browser suites live behind `hub test:browser`,
and `hub test:browser:watch` opens Playwright's UI mode for one package. The split
is what keeps the common command fast: `pnpm test error` needs no browser, no
server, and no download, while `pnpm test:browser styles` still runs the real
thing. `docs/specs/tests.md` owns the rule; `hub check` enforces it, because a
`test` script that reaches a browser suite quietly makes every unit run slow again.

Browsers are installed by the tooling rather than by each contributor:

```sh
pnpm hub browsers
pnpm hub browsers styles
pnpm hub browsers --with-deps
```

`hub test:browser` and `hub test:browser:watch` run that install themselves before
the tests, so a browser test cannot fail on a machine that simply never downloaded
a browser. Playwright verifies its own cache in well under a second, which is why
the step runs every time instead of being guarded by a marker file that would
claim browsers are present after someone cleared the cache.

A package opts in by declaring `@playwright/test`. Browsers are cached per
Playwright version outside the repository, so packages on the same version share
one install, and the command only downloads once for all of them. Extra arguments
reach Playwright, which is how CI asks for the system libraries a headless browser
needs on a runner with `--with-deps`.

## Creating a package

`hub new <name>` scaffolds a public package under `packages/<name>`:

```sh
pnpm hub new store --description="Typed localStorage-backed state stores."
```

It writes the manifest, `tsconfig.json`, `README.md`, `llms.txt`,
`docs/index.md`, `docs/.npmignore`, a source entrypoint, and a test, then
compiles `llms-full.txt` from the surfaces it just wrote. The result passes
`pnpm verify` and all seven check rules on its first run, so the author edits
prose instead of hunting for the fields and surfaces a package is required to
have. Everything a human should write is marked `TODO`.

The scope comes from the workspace rather than a constant, and a new package
always starts `experimental`: promoting it is a deliberate act that has to
update the README notice at the same time.

Two things the scaffold deliberately leaves out. It writes no `LICENSE`, because
a license file is a legal artifact rather than boilerplate — the manifest
declares Apache-2.0, the command says to add the file, and `hub check` warns
until it exists. And it never writes into a directory that already exists,
because overwriting a package would destroy work no check could recover.

`hub new` is the one command that does not resolve its argument to an existing
package. Selectors are resolved before a command runs, which cannot work for a
name the workspace does not contain yet, so it reads the raw tokens instead.

## Verification

`hub verify` runs `format`, `lint`, `typecheck`, `test`, `test:browser`, and
`check` in that order and stops at the first failure. The order is by cost: the
cheapest step that is most likely to fail on a fresh change runs first, browser
tests follow the unit tests because a unit failure answers the same question far
sooner, and a compliance report is only worth reading once the code it describes
compiles and passes. Steps that never ran are reported as skipped rather than
omitted, so the summary always accounts for all six.

`--skip=<steps>` leaves steps out, and they are still listed in the summary so a
partial run never reads as a full one. CI uses it to hand the browser step to the
job that owns it:

```sh
pnpm verify --skip=test:browser
pnpm verify --skip=test:browser,check error
```

Tool arguments are not forwarded, because the steps run different executables and
no argument could mean the same thing to all of them. Selection and every other
option still apply, so `hub verify error` verifies one package and
`hub verify --changed` verifies a branch.

## Git hooks

A `pre-commit` hook formats and lints the staged files, fixes what it can, and
re-stages the result. It runs those two checks and no others: type checking and
tests take minutes, and a hook that slow gets bypassed until it may as well not
exist. `pnpm verify` is where the rest belongs.

The hook lives in `.githooks/` and is wired by `core.hooksPath`, which the root
`prepare` script sets on every install. That is a local git setting rather than
a tracked one, so a fresh clone runs no hooks until something sets it; doing it
from `prepare` keeps a hook manager out of the dependency list. The setup step
never fails an install: a tree without git, or without permission to write its
config, reports and carries on.

Files are read from the working tree rather than from the index. For a file that
is only partly staged that matters: the hook never rewrites it, because
re-staging would sweep in the parts deliberately left out of the commit, and it
checks the file as it sits on disk. A commit whose staged content is already
clean can therefore still fail. The alternative — skipping such files — would let
unformatted code through the one check meant to stop it.

`git commit --no-verify` bypasses the hook when a commit has to land unfixed.

## Release preflight

`hub release` reports whether the selected packages could be published. It runs
`verify` first, then checks the three preconditions a build and a test run
cannot answer: whether the local version is ahead of the registry, whether the
package has uncommitted changes, and whether `npm pack --dry-run` includes every
file the manifest's entry points name.

```sh
pnpm hub release error
pnpm hub release --skip-verify
```

It writes nothing, tags nothing, and publishes nothing. Publishing is
irreversible in a way no other repository action is — a version can be deprecated
but never replaced — so the tooling stops at the report and leaves the
irreversible step to a person.

A precondition that cannot be resolved, such as a tarball npm refused to build,
is reported as unresolved rather than as ready. A blocker fails the run; an
unresolved check does not, because "npm is unavailable" is not the same claim as
"this package must not ship".

`--skip-verify` reports readiness without the verification step, which is what
you want while fixing one blocker at a time.

## Cleaning

`hub clean` removes `dist`, `coverage`, `test-results`, and `.astro` from the
selected packages, descending below each package root so playgrounds and nested
workspaces are covered too. It stops at each artifact it finds rather than
descending into it, and it never touches `node_modules`: dependencies belong to
the package manager, and removing them turns a seconds-long cleanup into a
reinstall.

## Compliance checks

`hub check` reads each selected package and reports it against
`docs/specs/packages-lifecycle.md` and `docs/specs/packages-documentation.md`.
Every package is inspected before anything is printed, so one non-compliant
package cannot hide the rest.

Findings carry a `<rule>/<detail>` code and a severity. Only `error` findings
fail the run; `warning` covers SHOULD-level rules such as the recommended
`license` and `repository` metadata. `pnpm check --json` prints the codes.

| Rule            | Checks                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `metadata`      | Required and recommended manifest fields, and the LICENSE file, of published packages.                                  |
| `scripts`       | Required scripts, a self-contained `prepublishOnly`, no chained builds, and browser tests kept out of the unit scripts. |
| `dependencies`  | Declared where used, in the right field, with catalog ranges and no cycles.                                             |
| `exports`       | Import paths shown in the README and public docs are declared in `exports`.                                             |
| `documentation` | Required surfaces, frontmatter, single H1, link targets, and slug uniqueness.                                           |
| `llms-full`     | `llms-full.txt` still matches the documents it compiles.                                                                |
| `readme`        | README status notices agree with `codenhub.docs.status`.                                                                |

The `exports` rule reads import statements, not prose: naming a path in a
sentence is not a promise that it resolves, but showing it in an `import` is.
The reverse direction — a supported path the package never documents — is not
mechanically knowable and stays a review responsibility.

The `dependencies` rule reads installed fields only for ranges. A
`peerDependencies` range is a contract with the consumer rather than an
installation, so neither the `workspace:` nor the `catalog:` requirement applies
to it. A cycle is reported on every package that takes part in it, naming one
cycle per package: breaking that one re-runs the check against whatever remains.

The same rule reads the package's own files, in two scopes that answer different
questions:

- `dependencies/runtime-declaration` walks the import graph from the published
  entry points, mapping each `exports` target back to its source file. That is
  the only way to tell code a consumer receives from a test helper that happens
  to live beside it, so it is what decides whether a dependency belongs in
  `dependencies` rather than `devDependencies`. Private packages are exempt:
  nothing installs them, so the field changes nothing.
- `dependencies/runtime-declaration` ignores type-only imports, which a build
  erases. It cannot see whether the emitted `.d.ts` still names the package, so
  that half stays a review responsibility.
- `dependencies/undeclared` covers every non-test source file and keeps type-only
  imports, because a package must be installed to type-check against it. Importing
  something undeclared is a bug wherever it is written — it resolves today only
  by borrowing another package's installation. Test files are excluded: they
  quote example imports freely, and a test that imports something missing fails
  the moment it runs.

`dependencies/unused` runs the other way and is deliberately permissive, because
the two mistakes do not cost the same. Reporting a dependency that is quietly
needed sends someone chasing a removal that breaks a build; missing an unused one
leaves the manifest as it already is. A dependency is reported only when its name
appears nowhere in the package at all — no import, no script, no quoted string,
no comment — and when no binary it installs is named by a script either. Ambient
`@types/*` packages and companions published under a used tool's own scope, such
as a coverage provider, are never reported.

A `playground` directory is read as part of the `dev` and `debug` workspaces that
run it rather than the package that hosts it. `docs/specs/packages-development.md`
makes it leaf code rather than a workspace package, and its imports resolve
through the environment whose server loads it.

A `readme` status notice is a blockquote above the first section heading, which
is where a consumer sees it before adopting the package. An `active` package
carrying an experimental or deprecated notice is reported the same way as an
experimental package carrying none.

Tarball publication is checked only with `--pack`, which runs
`npm pack --dry-run --ignore-scripts --json` per package. The documentation spec
requires real npm output rather than an approximation of its inclusion rules, so
the check is skipped rather than estimated when the flag is absent. Scripts are
ignored because a read-only check must not build the package, and npm is subject
to `--timeout` like any other child process.

A finding is waived only by a `Checks bypassed` bullet in
`docs/specs/packages-exceptions.md`. There is no in-code suppression: a waiver
that is not documented does not exist. The reverse is reported too: a waiver that
suppresses no finding is listed as dead, so a stale entry or a mistyped code or
package name cannot sit in the register looking effective. A dead waiver is a
warning and does not fail the run.

## Generated files

`hub generate` rewrites derived files from their canonical sources and writes
only the ones that actually changed:

- `<package>/llms-full.txt`, compiled from the package README, `docs/index.md`,
  and the remaining public documents in that order. Presentation frontmatter is
  stripped, `docs/internal/` is excluded, each section is introduced by a
  `<!-- Source: ... -->` marker, and relative link targets are rebased so they
  resolve from the package root.
- The root `README.md` package list, between its
  `<!-- generated: packages start -->` and `<!-- generated: packages end -->`
  markers. Descriptions come from package manifests, so the list cannot drift
  from what each package says about itself.

`llms.txt` stays hand-authored. It is a router whose value is the editorial
summary a generator cannot write; `hub check` validates it like any other
documentation surface.

`hub generate --dry-run` lists the files that are out of date and exits non-zero,
which is what the drift gate in `docs/ci.md` runs.

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

## Adding a check or a generator

Checks live in `packages/tools/src/checks/` and implement `CheckRule`: a name, an
`appliesTo` predicate, and a `run` that returns findings. Register it in
`checks/registry.ts`. Rules report rather than throw so every package can be
inspected in one pass, and each finding needs a stable code because that code is
what the exception register bypasses.

Generators live in `packages/tools/src/generators/` and implement `Generator`,
returning the contents a file should have rather than writing it. The command
diffs and writes, so `--dry-run` and change detection are not reimplemented per
generator. Use `replaceGeneratedRegion` for a generated region inside an
otherwise hand-written file.

The documentation model both of them build on lives in
`packages/tools/src/documentation/` and is published as
`@codenhub/tools/documentation`. `apps/docs` consumes the same module, so the
documentation contract has one implementation rather than two.

Checks and generators are siblings and neither imports the other's rules. What
both need lives below them: predicates over a package in
`packages/tools/src/workspace/package-policy.ts`, and the documents an
`llms-full.txt` compiles in `packages/tools/src/documentation/llms-full.ts`.
