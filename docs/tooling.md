---
status: IMPLEMENTED
last_updated: 2026-08-27
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

`hub browsers`, `hub assets`, `hub new`, `hub release`, and `hub preview:deploy`
have no root script of their own. They are occasional commands rather than part
of a change loop, and they read as what they are through `pnpm hub <command>`.

A command name without its own definition runs the package script of that name,
so package-specific scripts such as `dev` and `debug` work without registration.
Package scripts also accept the package-first form, such as `hub styles dev`,
when the first token identifies one package and the second names one of its
scripts. `dev`, `debug`, and `preview` keep that package attached to the terminal,
stream output as it arrives, and run without the default timeout.

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
`test:coverage`, `test:watch`, `typecheck`, `status:pack`, and `preview:deploy`
build their packages first, which is why package manifests MUST NOT chain
`pnpm build &&` into those scripts. Chaining it again would double every build.

Prerequisite builds cover the selected packages and their workspace
dependencies. Depending on a package means type-checking against its built
declarations, so a run that skipped them would pass on a tree holding stale
output and fail on a fresh clone — which is exactly the failure CI reports and a
laptop hides. `--no-deps` narrows the build to the selected packages when their
dependencies are known to be built, and `--no-build` skips the step entirely.
`--deps` is still accepted and now asks for the default.

`hub build` expands and orders the same way, because a dependency has to be built
before the package that imports it whether the build was asked for directly or
reached as a prerequisite. `hub build docs` therefore builds what `docs`
consumes first, and an unnarrowed `hub build` runs dependency-first rather than
in workspace order.

A build runs in dependency levels: everything with no unbuilt dependency left in
the selection starts together, and the next level waits for that one to finish.
Only a dependent has to wait for a dependency, and most packages depend on nothing,
so ordering the whole workspace into a single file would idle every core but one.
`--parallel` sets how wide a level may run; it never lets a package start beside
its own dependency.

The expansion includes the `dev` and `debug` environments nested inside a selected
package, and what they depend on. Those are workspace packages of their own, and a
browser test run starts their servers, so `hub test:browser theme` has to build the
plugin `theme/dev` imports even though `theme` itself never does.

`prepublishOnly` is exempt: npm runs it outside `hub`, so it MUST remain
self-contained.

## How a package script is run

`hub` runs a package script by handing its body to the platform shell with the
package's `node_modules/.bin` directories on `PATH`, which is what `pnpm run`
would have set up. The shim is skipped for its cost: starting `pnpm` takes on the
order of a second, and a workspace run pays that once per package per script, so
it can outweigh several of the scripts it starts.

A script with a `pre` or `post` hook is still run through `pnpm run`, because the
package manager owns those hooks and skipping it would silently drop a step. A
script that invokes `pnpm` itself, such as one chaining `pnpm build:styles`, pays
for that call as written; splitting such a chain into separate scripts is the way
to avoid it.

## Type checking

`hub typecheck` does not run one compiler per package. Every package whose
`typecheck` script is a bare `tsc -b` is checked in build mode, several projects
to a process, spread over as many processes as `--parallel` allows. Most of what
a project costs is loading the compiler and its libraries, and a batch pays that
once instead of once per package.

Build mode is also what makes a second run cheap. Each project records what it
checked in a `tsconfig.tsbuildinfo` beside its config, and a project whose inputs
have not changed since is skipped rather than re-checked. A workspace that has
just been checked answers in well under a second; `hub clean` removes those
records along with the rest of the build output.

This is why `docs/specs/packages-lifecycle.md` requires `composite` and `noEmit`
in a package `tsconfig.json`: `composite` is what build mode needs to track a
project, and `noEmit` keeps a type-check from writing declarations the build
already produces.

A package whose `typecheck` script is anything else runs as its own script, in
its own process, beside the batches. `apps/docs` is the one that does, because
`astro sync` has to regenerate its types before the compiler sees them. Such a
package takes a slot of its own and starts first, since nothing else in the run
gets shorter by waiting for it.

Diagnostics name the file they came from, so a batch that fails is reported
against the packages the diagnostics belong to rather than against everything it
covered. A failure with no file in it — a missing type library, say — is reported
against every package in the batch, because nothing narrows it.

## Options

| Option                | Effect                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| `--changed[=<ref>]`   | Narrow to packages changed against `<ref>`. Defaults to `main`.                     |
| `--parallel[=<n>]`    | Run up to `<n>` packages at once. Defaults to 6; a bare flag asks for one per core. |
| `--bail`              | Stop after the first failing package.                                               |
| `--no-build`          | Skip prerequisite builds.                                                           |
| `--no-deps`           | Build only the selected packages, not their workspace dependencies.                 |
| `--skip=<steps>`      | Leave verification steps out of a `verify` run.                                     |
| `--timeout=<seconds>` | Kill a finite package run after `<seconds>`. Defaults to 600.                       |
| `--no-timeout`        | Never kill a package run.                                                           |
| `--dry-run`           | Print the commands that would run.                                                  |
| `--fix`               | Apply fixes instead of only reporting.                                              |
| `--pack`              | Let `check` run `npm pack --dry-run` to inspect publishable contents.               |
| `--json`              | Emit machine-readable output where supported.                                       |
| `--verbose`           | Report every command's output, not only the output of what failed.                  |
| `-h`, `--help`        | Show usage.                                                                         |
| `--version`           | Print the tooling version.                                                          |

Unrecognized flags and everything after a bare `--` are forwarded to the
underlying tool, so `hub test error --reporter=verbose` reaches Vitest unchanged.

## Reporting

A run reports what failed. Child output is captured rather than streamed, and a
package that passed prints nothing beyond its place in the closing count; a
package that failed prints its whole output under its own heading. A green
workspace run is a handful of lines, which is what makes the one red package in it
findable.

`--verbose` reports what passed as well, which is the way to read output a
successful command produced. It streams that output live only when one command
holds the terminal; several packages running at once would interleave into a
transcript nobody can read, so their output is captured and printed as each one
finishes. Repository-wide tools are the exception to the rule above: `lint`,
`format`, and `cloc` repeat whatever they wrote, pass or fail, because a linter
reports warnings and still exits zero, and keying their output off the exit code
would drop the findings the run existed to surface.

Package runs are killed when they exceed `--timeout`. This is what keeps one
hanging browser-test worker from blocking a whole workspace run. Interactive
`dev`, `debug`, `preview`, and watch commands stream through one attached terminal
and have no timeout.

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

Browser suites run several packages at a time like any other script, so a package
that starts a server MUST bind a port no other package uses. Two suites sharing a
port passed only because the runs were once serialized, and would now race.

A package opts in by declaring `@playwright/test`. Browsers are cached per
Playwright version outside the repository, so packages on the same version share
one install, and the command only downloads once for all of them. Extra arguments
reach Playwright, which is how CI asks for the system libraries a headless browser
needs on a runner with `--with-deps`.

## Asset placement

Root `assets/` (`docs/assets.md`) catalogs Coden's brand artwork and fonts,
but says nothing about where any consumer places a file — that stays each
package's own decision, since a web app, a demo, and a future non-web
consumer each place things differently. A package declares exactly which
files it needs and exactly where in its own manifest:

```json
"codenhub": {
  "assets": [
    { "from": "favicon/favicon.ico", "to": "public/favicon.ico" },
    { "from": "logo/logo-dark.svg", "to": "public/assets/logo/logo-dark.svg" }
  ]
}
```

`from` is relative to root `assets/`; `to` is relative to the package's own
directory. `pnpm hub assets` reads that declaration and syncs it:

```sh
pnpm hub assets
pnpm hub assets demo
```

It is the one place root `assets/` gets copied from, so every consumer
reuses the same implementation instead of carrying its own copy script.
`build` and `dev` run it automatically through their `prepare` step for any
package that declares `codenhub.assets`, so a package's own scripts need no
`predev`/`prebuild` step of their own. A destination is remembered per
package (a gitignored `.codenhub-assets.json` beside its manifest), so a
later run can tell a file it placed apart from one it never touched — that
is what lets a dropped entry's old file be removed without risking anything
the mechanism did not itself place. `hub check` validates that every
declared `from` resolves to a real file under `assets/`.

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

`hub verify` runs `format`, `lint`, `build`, `typecheck`, `test`, `test:browser`,
and `check` in that order and stops at the first failure. The order is by cost: the
cheapest step that is most likely to fail on a fresh change runs first, browser
tests follow the unit tests because a unit failure answers the same question far
sooner, and a compliance report is only worth reading once the code it describes
compiles and passes. Steps that never ran are reported as skipped rather than
omitted, so the summary always accounts for all seven.

`build` is a step of the run rather than a prerequisite of the three steps that
need one. Left to each of them it builds the same packages three times, because no
later step can tell that an earlier one already produced what it needs. Running it
once and telling the rest the output is there is the same work done once.
`--no-build` drops the step and leaves every other step to find its own build
output, and `--skip=build` does the same.

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

`pre-commit` reads files from the working tree rather than from the index. For a
file that is only partly staged that matters: the hook never rewrites it, because
re-staging would sweep in the parts deliberately left out of the commit, and it
checks the file as it sits on disk. A commit whose staged content is already
clean can therefore still fail. The alternative — skipping such files — would let
unformatted code through the one check meant to stop it.

A `commit-msg` hook checks the subject line against the Conventional Commits
shape `CONTRIBUTING.md` describes: a known type, an optional lowercase scope, an
imperative lowercase subject, no trailing period, and 72 characters at most. It
checks the subject and nothing else. A body is optional, and no hook can tell
whether a message describes the commit honestly, so the mechanical half is
automated and the rest stays with review.

Merges, reverts, and `fixup!` markers pass unchecked. Git composes those
subjects, and rejecting a message nobody wrote would only train people to reach
for `--no-verify` out of habit, which costs the checks that do matter.

72 characters is where the repository already sits rather than a number picked
from a style guide: replaying the 200 commits before the hook, it rejects six.
Three of those are merely long, and the other three join two changes with "and"
or "+", which is the split the convention asks for anyway.

The hooks live in `.githooks/` and are wired by `core.hooksPath`, which the root
`prepare` script sets on every install. That is a local git setting rather than
a tracked one, so a fresh clone runs no hooks until something sets it; doing it
from `prepare` keeps a hook manager out of the dependency list. The setup step
never fails an install: a tree without git, or without permission to write its
config, reports and carries on.

A `pre-push` hook refuses a push whose destination is `refs/heads/main`. What it
reads is the destination ref rather than the branch you are standing on, so it
holds for a push from `main`, for an explicit refspec that targets it from
somewhere else, and for a `--delete`. `CONTRIBUTING.md` states the rule and why
`main` is the branch that gets one; this is what makes it more than advice.

`--no-verify` bypasses these: on `git commit` for the first two, on `git push`
for the last. It is for the change that genuinely has to land unfixed, and it is
worth saying out loud when it is used, since the whole point of a hook is that
skipping one is visible.

## Hosted previews

`hub preview:deploy docs` builds the documentation site and uploads it as a new
Worker version without deploying it, printing a preview URL for that version.
Pass an alias to get a stable readable URL instead of a per-version one:

```sh
pnpm hub preview:deploy docs
pnpm hub preview:deploy docs -- --preview-alias staging
```

The alias needs the `--` separator. A value after a bare flag would otherwise be
read as a target, since that is what a bare word after the command name means
everywhere else.

It exists because the documentation deployment no longer builds branches. The
Cloudflare project builds the production branch only, so a preview is something a
maintainer asks for rather than something every push produces. `docs/ci.md`
covers that side. The upload runs from the maintainer's machine against their own
`wrangler` login, which is why it stays out of CI and needs no repository
credentials.

`preview` and `preview:deploy` are different things: `preview` runs `wrangler dev`
locally against the built output, while `preview:deploy` puts a version on
Cloudflare that other people can open.

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

`hub clean` removes `dist`, `coverage`, `test-results`, `.astro`, and every
`*.tsbuildinfo` from the selected packages, descending below each package root so
playgrounds and nested workspaces are covered too. The compiler's records go with
the output they describe: left behind, they would tell the next type-check that
projects whose declarations have just been deleted are still up to date. It stops at each artifact it finds rather than
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
| `assets`        | `codenhub.assets` entries resolve to real files under root `assets/`.                                                   |

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
