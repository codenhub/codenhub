---
status: IMPLEMENTED
last_updated: 2026-09-08
scope: Continuous integration workflows, the pinned workspace toolchain, and the checks that report on pull requests.
---

# Continuous integration

Two workflows run here. `.github/workflows/ci.yml` verifies every pull request and every merge; `.github/workflows/publish.yml` releases one package when a maintainer pushes its tag. Both run the same commands a contributor runs locally, so a green run means `pnpm verify` passed rather than that some CI-only approximation of it did.

## Toolchain

Local and CI runs resolve the same versions, declared once each:

| Where                           | Declares                                       |
| ------------------------------- | ---------------------------------------------- |
| `package.json` `engines`        | The Node and pnpm range every run must satisfy |
| `package.json` `packageManager` | The exact pnpm version pnpm installs itself    |
| `.nvmrc`                        | The exact Node version, read by `nvm` and CI   |
| `.npmrc` `engine-strict`        | Makes an install outside `engines` fail        |

CI reads those same files rather than repeating a version: `pnpm/action-setup` takes the pnpm version from `packageManager`, and `actions/setup-node` takes the Node version from `.nvmrc`. A version is therefore raised in one place, and a machine that cannot satisfy it is told at install time instead of failing later in a way nobody can reproduce.

`engine-strict` is deliberate friction. A patch-level Node difference rarely matters, and the one time it does, the failure looks like a bug in the change being reviewed rather than a difference in the runtime.

## Triggers and selection

| Event          | Selection                             |
| -------------- | ------------------------------------- |
| `pull_request` | `--changed=origin/<base branch>`      |
| `push` to main | The whole workspace, with no selector |

A pull request checks what it changed, which is what makes the run fast enough to wait for. A merge into `main` checks everything, so nothing lands unverified because it happened to sit outside a changed package. Both are needed: neither alone both stays fast and stays honest.

`--changed` compares against a branch ref, so the checkout uses `fetch-depth: 0`. A shallow clone has no base branch to compare against. Both selecting jobs assert the base ref exists before running: `--changed` degrades to working-tree changes when its ref is missing, which locally means "check what I am editing" and in CI would mean checking nothing and reporting success.

Runs for the same pull request cancel each other, because only the newest push is worth a verdict. Runs on `main` never cancel: each merge is the authoritative check of that commit.

The verification sequence builds declarations before `hub check` inspects them. Its `undocumented-export/missing-jsdoc` errors fail the `Verify` job when a selected package exposes a top-level typed export without JSDoc/TSDoc. Pull requests check the changed packages against their base branch; pushes to `main` check the whole workspace. The scope and remaining review responsibilities are defined in `docs/code-guidelines.md`.

## Jobs

The jobs run in parallel and only `browser-result` waits on another, so a stale generated file is reported without waiting for the slowest test suite.

| Job              | Runs                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `verify`         | `pnpm verify --skip=test:browser <selector>`                                                                          |
| `browser`        | `pnpm hub browsers --with-deps <selector> -- <engine>`, then `pnpm test:browser <selector> -- --project='*<engine>*'` |
| `drift`          | `pnpm generate --dry-run`, then `git diff --exit-code`                                                                |
| `browser-result` | Nothing; it passes only when every `browser` job passed                                                               |

`verify` skips the browser step because the `browser` job owns it. Running it in both would double the slowest part of the run for no extra signal.

`browser` is a matrix of one job per engine — `chromium`, `firefox`, `webkit` — so the workflow runs six jobs in total. The browser suites are by far the slowest thing in a run and the three engines share nothing, so splitting them trades runner minutes, which are cheap, for wall-clock time, which is what anyone waits on. The engines are no longer far apart. Firefox once cost roughly five times what Chromium did on the `styles` suite, which was a fixture problem rather than an engine one: every test took a fresh browser context, and Firefox charges far more for one than the others do. `packages/styles` now shares a context per worker, which brought that suite from 285s to 84s on Firefox. WebKit is the slowest engine on it today, and the matrix is what keeps the slowest one off everybody else’s critical path.

`fail-fast` is off for the matrix. "Firefox broke" and "WebKit broke" are different findings, and cancelling one to report the other hides half of what a run was started to learn.

`browser-result` exists because a protected `main` requires a check by name, and a matrix reports one check per engine rather than the single one the rule names. It carries that name and passes only when every engine job passed, so the branch rule keeps working without naming the engines: adding or removing one is a change to `ci.yml` and to nothing else. Encoding the engines in the branch rule instead would put half of this design into settings nobody can review in a diff.

It runs under `always()`, which is what makes it a gate rather than a formality. A job that runs only on success is skipped when an engine fails, and a skipped required check blocks a pull request exactly as an unreported one does, with the difference that nobody can tell why. Reporting the failure is the point.

Each job installs only its own engine and selects it with one glob. That works because every Playwright project in the repository is named after the engine it runs on; `docs/specs/tests.md` carries the rule, and a package free to name a project anything would silently drop out of an engine's job. `hub browsers` and `hub test:browser` both forward what follows `--` to Playwright, so neither the matrix nor the selector needed new tooling.

Browsers are restored from `actions/cache` before the install, keyed on the runner, the engine, and `pnpm-lock.yaml` — the lockfile being what pins the Playwright version the browsers belong to. `--with-deps` runs on a cache hit as well, because the system libraries it installs live outside the cached directory and a runner never has them.

The install runs through `hub browsers`, the same command a contributor uses, so CI and a laptop resolve the same browser versions. Playwright artifacts are uploaded only when a job fails, which is the only time anyone reads them, and are named per engine so three jobs cannot overwrite each other's.

The gate also catches what an install itself writes. A tracked `bin` target has to be committed with its executable bit: pnpm chmods the file it links, so a mode that disagrees with the index shows up as a modified working tree on Linux and nowhere on Windows. `packages/tools/src/cli.ts` is tracked `100755` for that reason.

`drift` is a gate rather than a fix: `hub generate --dry-run` lists the files that no longer match the READMEs, package docs, and manifests they are derived from and exits non-zero without writing any of them. The `git diff --exit-code` step after it asserts that the dry run really wrote nothing. A stale generated file means the repository describes itself incorrectly, which is why it fails a run rather than being regenerated by a bot: the author is the one who knows whether the source change was intended.

Workspace setup — pnpm, Node, and a frozen-lockfile install — lives in `.github/actions/setup` so no job can drift apart from the others.

## Changing the workflow

Prefer moving work into `hub` over adding steps to the workflow. A step that only CI can run is a step no one can reproduce before pushing; `hub verify`, `hub generate --dry-run`, and `hub browsers` are all runnable locally, and that is what keeps CI from becoming a separate build system. See `docs/tooling.md` for the command surface.

### Pinning third-party actions

Every action from another repository is referenced by full commit SHA, with the release it corresponds to in a trailing comment:

```yaml
uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5.1.0
```

A tag is a mutable pointer. `@v5` resolves to whatever its owner last pointed it at, so a compromised or simply retagged release changes what runs here without any change landing in this repository. A SHA cannot move, which turns an action upgrade into a reviewable diff rather than something that happens to a run. The comment carries the human-readable version, because a bare SHA says nothing about how far behind it is.

The rule is all or nothing on purpose. Pinning some actions and not others is worse than pinning none: a reader cannot tell a reference that was reviewed and accepted from one that was missed, so the unpinned ones stop being visible as a decision. Adding an action means resolving its SHA in the same change.

`./.github/actions/setup` is deliberately not pinned. It is a path in this repository, so it is already versioned by the commit under test; pinning it would mean a run could use a setup step other than the one it is checking.

Nothing updates these automatically. That is the cost of the rule, accepted rather than overlooked: upgrades are manual, and a pin left alone is a pin going stale. Resolve the new SHA with `gh` and update the comment alongside it:

```sh
gh api repos/actions/checkout/commits/v5 --jq .sha
```

## Deployment checks

Three checks report on pull requests without living in this repository. The site index, the documentation site, and the demo site each deploy through their own Cloudflare Workers Builds project, connected to the repository from the Cloudflare dashboard; `apps/www/wrangler.jsonc`, `apps/docs/wrangler.jsonc`, and `apps/demo/wrangler.jsonc` describe what each one serves and the rest of all three deployments is dashboard state. `docs/roadmap.md` records why that split exists.

Because the trigger is dashboard state, a build fires for every push unless that project's build watch paths exclude the change. All three lists are recorded below so the reasoning is reviewable even though the setting is not.

Three things are true of all three.

Each list excludes rather than includes, and that direction is the point. An include list that misses a path publishes a stale site and says nothing; an exclude list that misses one costs a build nobody needed. Only the second failure is visible, so both filters are built to fail that way.

Package `src/` directories are deliberately absent from all three. Most of them cannot affect any site, but each site has a handful that are build inputs to it, so excluding `src/` wholesale would ship stale output, and excluding it per package would leave a trap for the first change that adds an import or a dependency. The saving does not come close to paying for a silent staleness failure.

Watch paths apply to the production branch only. Cloudflare documents excludes as applied first, with a build triggered only if a changed path survives them and then matches an include, and documents `*` as matching across `/` — so a push touching only `docs/ci.md` should not build. Three such pushes on a pull request branch built anyway, and the merge of the same change into `main` skipped. Read these filters as governing merges, not pull requests; nothing either one lists will spare a build on a branch.

The figures below come from replaying the same window of merges into `main` through each filter, so the documentation and demo lists are comparable with each other. The site index is new and has no replay window yet.

### The site index

The `codenhub` project, serving `apps/www/dist`. `apps/www` is the entry point a visitor reaches first, so it takes the shortest project name; the documentation project moved to `codenhub-docs` when this one was added. These are the paths its Build watch paths setting excludes:

```
.github/*
.githooks/*
docs/*
apps/docs/*
apps/demo/*
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
packages/*/README.md
packages/*/LICENSE
packages/*/llms.txt
packages/*/llms-full.txt
packages/*/docs/*
packages/*/tests/*
packages/*/dev/*
packages/*/debug/*
packages/*/demo/*
```

The index reads one input only: `apps/www/src/lib/catalog.ts` globs `packages/**/package.json` for names, descriptions, statuses, and `homepage`, and derives each documentation slug from the presence of `packages/**/docs/**/*.md` without reading any of it. So the list excludes package `docs/` wholesale like the demo list does, plus each package's `README.md`, `LICENSE`, and `llms*.txt`, and both other apps. What it keeps is `packages/*/package.json` and the `src/` rule shared by all three — `@codenhub/app-shell`, `@codenhub/styles`, `@codenhub/icons`, and `@codenhub/tools` are build inputs here.

### The documentation site

The `codenhub-docs` project, serving `apps/docs/dist`. These are the paths its Build watch paths setting excludes:

```
.github/*
.githooks/*
docs/*
apps/demo/*
apps/www/*
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

Each entry is excluded because the site provably cannot read it. The site's content comes from `packages/` alone: `apps/docs/astro.config.ts` points the documentation integration at that root, and `src/lib/catalog.ts` globs `packages/**/package.json` and public `packages/**/docs/**/*.md` from it. Root `docs/`, `README.md`, and `CONTRIBUTING.md` are repository governance, not site content. `docs/internal/**` is already outside the catalog glob. The `dev`, `debug`, and `demo` workspaces are `private: true`, and private manifests are filtered out of the public package summaries. `apps/demo/*` and `apps/www/*` are the other apps, which nothing here reads.

The `src/` rule above bites hardest here: `@codenhub/tools`, `@codenhub/styles`, and `@codenhub/kbd` are build inputs to this site — the integration imports `@codenhub/tools/documentation`. Over the replay window, excluding every package `src/` would have skipped only 2 more builds.

Expect the filter to skip roughly a sixth of merges, not most of them. Over the window it skips 16 of 108, because the other 92 touch a surface the site publishes and genuinely need the rebuild they get. This repository is docs-first and `pnpm generate` rewrites `llms-full.txt` whenever a document changes, so most commits reach a published surface whatever else they touch. Path filtering cannot change that, which is why the larger saving came from not building branches at all.

`apps/demo/*` and `apps/www/*` are correct but not yet load-bearing: over the replay window no merge touched either without also touching something else this list excludes, so adding them skipped no build that was not already skipped. They start paying once the other apps accumulate changes of their own.

### The demo site

The `codenhub-demo` project, serving `apps/demo/dist`. `apps/demo/docs/internal/architecture.md` owns how that output is built; this is what triggers the build. These are the paths its Build watch paths setting excludes:

```
.github/*
.githooks/*
docs/*
apps/docs/*
apps/www/*
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
packages/*/README.md
packages/*/LICENSE
packages/*/llms.txt
packages/*/llms-full.txt
packages/*/docs/*
packages/*/tests/*
packages/*/dev/*
packages/*/debug/*
```

It is close to the inverse of the documentation list. `packages/*/demo/*` moves from excluded to the thing that should trigger a build — it is what this site serves — and `apps/docs/*` and `apps/www/*` join the excludes, since a change to either of the other apps cannot reach this one.

The rest of the difference is that this site reads no Markdown at all. `apps/demo/src/lib/catalog.ts` globs `packages/*/demo/package.json` and `demo-integration.ts` copies each demo's `dist/`; nothing else in a package is an input. So where the documentation list has to keep public `packages/*/docs/` and exclude only `docs/internal/`, this one excludes package `docs/` wholesale, along with each package's `README.md`, `LICENSE`, `llms.txt`, and `llms-full.txt`.

That last pair is what makes this filter worth more than the other. `pnpm generate` rewrites `llms-full.txt` whenever a package document changes, which is exactly why the documentation filter cannot skip much; here those files are provably unread. Over the same window the demo filter skips 28 of 108 merges, roughly a quarter, against the documentation filter's sixth.

The `src/` rule applies here through dependencies rather than imports: `@codenhub/icons`, `@codenhub/styles`, and `@codenhub/tools` are build inputs, and `apps/demo/package.json` names each demo package it aggregates with a hand-maintained `workspace:*` line. Excluding the `src/` of packages absent from that list would mean the day someone adds a demo and forgets this file, the site quietly stops rebuilding. The architecture doc already makes that manifest a hand-maintained list; it should not also be a hand-maintained build trigger.

## Previews

All three Cloudflare projects build the production branch only; builds for non-production branches are off. That is where the build minutes went — a pull request pushed six times built the site six times, and watch paths would not have stopped any of them. Pull requests are now checked by the workflow above and nothing else.

A preview is therefore something a maintainer asks for:

```sh
pnpm hub preview:deploy www
pnpm hub preview:deploy docs
pnpm hub preview:deploy demo
```

That builds the app and uploads it as a new Worker version without deploying it, printing a preview URL. It runs from the maintainer's machine against their own `wrangler` login, so it consumes no build minutes and needs no credentials in this repository, which keeps the split that the rest of this section describes. `docs/tooling.md` documents the command and its alias flag.

Previewing the merge rather than a working tree is the one thing it does not do. A version uploaded from a laptop is built from whatever is checked out there.

## Publishing

`.github/workflows/publish.yml` publishes one package to npm. It is the only workflow that changes anything outside this repository, and everything about it is shaped by that.

It triggers on a tag matching `@codenhub/*@*` and on nothing else. The tag names the package and the version — `@codenhub/error@0.3.0` — and that pairing is the authorization: `docs/specs/packages-lifecycle.md` requires the version in the tag to equal the version in the manifest at the tagged commit, and `hub publish` refuses the run when they disagree. A merge never publishes. A merge is a decision to change `main`, not a decision to release, and keeping them apart is what makes a version bump revertible right up until someone tags it.

The `publish` job's body is one command:

```sh
pnpm hub publish --from-tag="$GITHUB_REF_NAME"
```

That command verifies the package, runs the publish preflight `hub release` reports, and publishes only when every precondition is `ready`. It is the same command a maintainer can run locally, which is the rule the section above states: a step only CI can run is a step nobody can reproduce before pushing. `docs/tooling.md` documents its flags.

### The GitHub release

A second job, `release`, cuts a GitHub release from the same tag once `publish` succeeds, so the Releases tab and its Atom feed carry the history npm already has. Its notes are the version's `docs/changelog/<version>.md` page when the package keeps a changelog, and GitHub's generated notes otherwise; a pre-release version is marked as one. It runs `gh release create` directly rather than through `hub`, because it touches GitHub metadata rather than the package.

It is a separate job on purpose. `gh release create` needs `contents: write`, and the `publish` job runs the entire build and lifecycle toolchain — repository-controlled code that should never share a step with a push credential. So `publish` stays `contents: read` with `persist-credentials: false`, and only `release`, which checks out the repository and runs nothing from it, holds the write scope. Before creating the release it re-fetches the tag and refuses to continue if it no longer points at the commit that was published, since a tag can be force-moved by anyone with write access. The release never undoes the publish before it: the version is already on npm, and a missing release entry is re-creatable by hand with the same command.

### Credentials

There are none. The `publish` job holds `id-token: write` and authenticates through npm trusted publishing, which exchanges that OIDC token for a credential valid for the length of the publish. No npm token exists in this repository or in its Actions secrets, which is the same split the deployments above keep — the repository carries the build, never the key. The workflow's default permission is `contents: read`; `contents: write` is the `release` job's alone.

Provenance comes with that exchange rather than from a flag. `--provenance` is deliberately not passed: the registry already attests a trusted-publishing release, and the flag is rejected outside a supported CI provider, so passing it would buy nothing here and break `hub publish` on a maintainer's machine.

Trusted publishing needs npm 11.5.1 or newer. The pinned Node ships one well past that, so the workflow asserts the version rather than installing one — an npm that cannot do the exchange should fail by name, not as an authentication error inside `npm publish`.

### The two things this workflow cannot do

A package's **first** release cannot go through it. npm has no trusted publisher to configure for a name that does not exist yet, so the first version of a package is published by a maintainer running `hub publish <package>` against their own `npm login`, and the trusted publisher is configured afterwards. Every release after the first goes through the workflow.

A tag can be pushed by anyone with write access, from any commit. The job therefore runs in the `npm` environment, which is where a required reviewer is configured. Until one is, the environment exists with no protection rules and the workflow runs unimpeded; the environment is what gives that decision somewhere to live.

## Not covered yet

Nothing the repository would own is missing any more. The three deployments run from Cloudflare dashboard state, their previews from a maintainer's machine, and publishing from a tag through trusted publishing. None of them carries a credential here, which is the property to preserve when any of them changes.
