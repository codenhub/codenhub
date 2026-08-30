---
status: IMPLEMENTED
last_updated: 2026-08-30
scope: Continuous integration workflows, the pinned workspace toolchain, and the checks that report on pull requests.
---

# Continuous integration

`.github/workflows/ci.yml` is the only workflow. It runs the same commands a
contributor runs locally, so a green run means `pnpm verify` passed rather than
that some CI-only approximation of it did.

## Toolchain

Local and CI runs resolve the same versions, declared once each:

| Where                           | Declares                                       |
| ------------------------------- | ---------------------------------------------- |
| `package.json` `engines`        | The Node and pnpm range every run must satisfy |
| `package.json` `packageManager` | The exact pnpm version pnpm installs itself    |
| `.nvmrc`                        | The exact Node version, read by `nvm` and CI   |
| `.npmrc` `engine-strict`        | Makes an install outside `engines` fail        |

CI reads those same files rather than repeating a version: `pnpm/action-setup`
takes the pnpm version from `packageManager`, and `actions/setup-node` takes the
Node version from `.nvmrc`. A version is therefore raised in one place, and a
machine that cannot satisfy it is told at install time instead of failing later
in a way nobody can reproduce.

`engine-strict` is deliberate friction. A patch-level Node difference rarely
matters, and the one time it does, the failure looks like a bug in the change
being reviewed rather than a difference in the runtime.

## Triggers and selection

| Event          | Selection                             |
| -------------- | ------------------------------------- |
| `pull_request` | `--changed=origin/<base branch>`      |
| `push` to main | The whole workspace, with no selector |

A pull request checks what it changed, which is what makes the run fast enough to
wait for. A merge into `main` checks everything, so nothing lands unverified
because it happened to sit outside a changed package. Both are needed: neither
alone both stays fast and stays honest.

`--changed` compares against a branch ref, so the checkout uses `fetch-depth: 0`.
A shallow clone has no base branch to compare against. Both selecting jobs assert
the base ref exists before running: `--changed` degrades to working-tree changes
when its ref is missing, which locally means "check what I am editing" and in CI
would mean checking nothing and reporting success.

Runs for the same pull request cancel each other, because only the newest push is
worth a verdict. Runs on `main` never cancel: each merge is the authoritative
check of that commit.

## Jobs

The jobs run in parallel and only `browser-result` waits on another, so a stale
generated file is reported without waiting for the slowest test suite.

| Job              | Runs                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `verify`         | `pnpm verify --skip=test:browser <selector>`                                                                          |
| `browser`        | `pnpm hub browsers --with-deps <selector> -- <engine>`, then `pnpm test:browser <selector> -- --project='*<engine>*'` |
| `drift`          | `pnpm generate --dry-run`, then `git diff --exit-code`                                                                |
| `browser-result` | Nothing; it passes only when every `browser` job passed                                                               |

`verify` skips the browser step because the `browser` job owns it. Running it in
both would double the slowest part of the run for no extra signal.

`browser` is a matrix of one job per engine — `chromium`, `firefox`, `webkit` —
so the workflow runs six jobs in total. The browser suites are by far the
slowest thing in a run and the three engines share nothing, so splitting them
trades runner minutes, which are cheap, for wall-clock time, which is what
anyone waits on. The engines are no longer far apart. Firefox once cost roughly
five times what Chromium did on the `styles` suite, which was a fixture
problem rather than an engine one: every test took a fresh browser context, and
Firefox charges far more for one than the others do. `packages/styles` now
shares a context per worker, which brought that suite from 285s to 84s on
Firefox. WebKit is the slowest engine on it today, and the matrix is what keeps
the slowest one off everybody else’s critical path.

`fail-fast` is off for the matrix. "Firefox broke" and "WebKit broke" are
different findings, and cancelling one to report the other hides half of what a
run was started to learn.

`browser-result` exists because a protected `main` requires a check by name, and
a matrix reports one check per engine rather than the single one the rule names.
It carries that name and passes only when every engine job passed, so the branch
rule keeps working without naming the engines: adding or removing one is a change
to `ci.yml` and to nothing else. Encoding the engines in the branch rule instead
would put half of this design into settings nobody can review in a diff.

It runs under `always()`, which is what makes it a gate rather than a formality.
A job that runs only on success is skipped when an engine fails, and a skipped
required check blocks a pull request exactly as an unreported one does, with the
difference that nobody can tell why. Reporting the failure is the point.

Each job installs only its own engine and selects it with one glob. That works
because every Playwright project in the repository is named after the engine it
runs on; `docs/specs/tests.md` carries the rule, and a package free to name a
project anything would silently drop out of an engine's job. `hub browsers` and
`hub test:browser` both forward what follows `--` to Playwright, so neither the
matrix nor the selector needed new tooling.

Browsers are restored from `actions/cache` before the install, keyed on the
runner, the engine, and `pnpm-lock.yaml` — the lockfile being what pins the
Playwright version the browsers belong to. `--with-deps` runs on a cache hit as
well, because the system libraries it installs live outside the cached
directory and a runner never has them.

The install runs through `hub browsers`, the same command a contributor uses, so
CI and a laptop resolve the same browser versions. Playwright artifacts are
uploaded only when a job fails, which is the only time anyone reads them, and are
named per engine so three jobs cannot overwrite each other's.

The gate also catches what an install itself writes. A tracked `bin` target has to
be committed with its executable bit: pnpm chmods the file it links, so a mode
that disagrees with the index shows up as a modified working tree on Linux and
nowhere on Windows. `packages/tools/src/cli.ts` is tracked `100755` for that
reason.

`drift` is a gate rather than a fix: `hub generate --dry-run` lists the files that
no longer match the READMEs, package docs, and manifests they are derived from and
exits non-zero without writing any of them. The `git diff --exit-code` step after
it asserts that the dry run really wrote nothing. A stale generated file means the
repository describes itself incorrectly, which is why it fails a run rather than
being regenerated by a bot: the author is the one who knows whether the source
change was intended.

Workspace setup — pnpm, Node, and a frozen-lockfile install — lives in
`.github/actions/setup` so no job can drift apart from the others.

## Changing the workflow

Prefer moving work into `hub` over adding steps to the workflow. A step that only
CI can run is a step no one can reproduce before pushing; `hub verify`,
`hub generate --dry-run`, and `hub browsers` are all runnable locally, and that is
what keeps CI from becoming a separate build system. See `docs/tooling.md` for the
command surface.

### Pinning third-party actions

Every action from another repository is referenced by full commit SHA, with the
release it corresponds to in a trailing comment:

```yaml
uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0
```

A tag is a mutable pointer. `@v5` resolves to whatever its owner last pointed it
at, so a compromised or simply retagged release changes what runs here without any
change landing in this repository. A SHA cannot move, which turns an action upgrade
into a reviewable diff rather than something that happens to a run. The comment
carries the human-readable version, because a bare SHA says nothing about how far
behind it is.

The rule is all or nothing on purpose. Pinning some actions and not others is worse
than pinning none: a reader cannot tell a reference that was reviewed and accepted
from one that was missed, so the unpinned ones stop being visible as a decision.
Adding an action means resolving its SHA in the same change.

`./.github/actions/setup` is deliberately not pinned. It is a path in this
repository, so it is already versioned by the commit under test; pinning it would
mean a run could use a setup step other than the one it is checking.

Nothing updates these automatically. That is the cost of the rule, accepted rather
than overlooked: upgrades are manual, and a pin left alone is a pin going stale.
Resolve the new SHA with `gh` and update the comment alongside it:

```sh
gh api repos/actions/checkout/commits/v5 --jq .sha
```

## The documentation deployment check

A second check reports on pull requests without living in this repository. The
documentation site deploys through Cloudflare Workers Builds, connected to the
repository from the Cloudflare dashboard; `apps/docs/wrangler.jsonc` describes
what to serve and the rest of the deployment is dashboard state. `docs/roadmap.md`
records why that split exists.

Because the trigger is dashboard state, a build fires for every push unless the
project's build watch paths exclude the change. The excluded paths are recorded
here so the reasoning is reviewable even though the setting is not:

```
.github/*
.githooks/*
docs/*
apps/debug/*
AGENTS.md
CLAUDE.md
CONTRIBUTING.md
README.md
LICENSE
.oxlintrc.json
.oxfmtrc.json
.editorconfig
.gitattributes
.gitignore
packages/*/docs/internal/*
packages/*/tests/*
packages/*/dev/*
packages/*/debug/*
packages/*/demo/*
```

The list excludes rather than includes, and that direction is the point. An
include list that misses a path publishes a stale site and says nothing; an
exclude list that misses one costs a build nobody needed. Only the second failure
is visible, so the filter is built to fail that way.

Each entry is excluded because the site provably cannot read it. The site's
content comes from `packages/` alone: `apps/docs/astro.config.ts` points the
documentation integration at that root, and `src/lib/catalog.ts` globs
`packages/**/package.json` and public `packages/**/docs/**/*.md` from it. Root
`docs/`, `README.md`, and `CONTRIBUTING.md` are repository governance, not site
content.
`docs/internal/**` is already outside the catalog glob. The `dev`, `debug`, and
`demo` workspaces are `private: true`, and private manifests are filtered out of
the public package summaries.

Package `src/` directories are deliberately absent from the list. Most of them
cannot affect the site, but `@codenhub/tools`, `@codenhub/styles`, and
`@codenhub/kbd` are build inputs to it — the integration imports
`@codenhub/tools/documentation` — so excluding `src/` wholesale would ship a
stale site, and excluding it per package would leave a trap for the first change
that adds an import. Replaying the 108 commits that preceded this document,
adding them would have skipped 2 more builds. That is not worth a silent
staleness failure.

Watch paths apply to the production branch only. Cloudflare documents excludes as
applied first, with a build triggered only if a changed path survives them and
then matches an include, and documents `*` as matching across `/` — so a push
touching only `docs/ci.md` should not build. Three such pushes on a pull request
branch built anyway, and the merge of the same change into `main` skipped. Read
the filter as governing merges, not pull requests; nothing it lists will spare a
build on a branch.

Expect the filter to skip roughly a sixth of merges, not most of them. Over that
same window it skips 16 of 108, because 72 of those commits touch a surface the
site publishes and genuinely need the rebuild they get. This repository is
docs-first and `pnpm generate` rewrites `llms-full.txt` whenever a document
changes, so most commits reach a published surface whatever else they touch. Path
filtering cannot change that, which is why the larger saving came from not
building branches at all.

## Previews

The Cloudflare project builds the production branch only; builds for
non-production branches are off. That is where the build minutes went — a pull
request pushed six times built the site six times, and watch paths would not have
stopped any of them. Pull requests are now checked by the workflow above and
nothing else.

A preview is therefore something a maintainer asks for:

```sh
pnpm hub preview:deploy docs
```

That builds the site and uploads it as a new Worker version without deploying it,
printing a preview URL. It runs from the maintainer's machine against their own
`wrangler` login, so it consumes no build minutes and needs no credentials in this
repository, which keeps the split that the rest of this section describes.
`docs/tooling.md` documents the command and its alias flag.

Previewing the merge rather than a working tree is the one thing it does not do.
A version uploaded from a laptop is built from whatever is checked out there.

## Not covered yet

Package publishing is deliberately absent, and so is any deployment the
repository would own. `docs/roadmap.md` tracks trusted publishing, and
`docs/specs/packages-lifecycle.md` keeps `npm publish` a human action, so delivery
work must stay a maintainer-triggered workflow rather than publish-on-merge.
Neither the documentation deployment nor its previews are an exception: one runs
from dashboard state and the other from a maintainer's machine, and neither
carries a credential here.

A second deployed surface, `apps/demo`, is designed in
`docs/specs/packages-demo.md` (the general contract) and
`apps/demo/docs/internal/architecture.md` (this app's own implementation),
and tracked in `docs/roadmap.md` under `@codenhub/demo`. It follows the same
dashboard-connected, credential-free pattern as the documentation deployment
above, but no Cloudflare project for it exists yet, so this section will
gain a second subsection once one does.
