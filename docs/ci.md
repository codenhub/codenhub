---
status: IMPLEMENTED
last_updated: 2026-11-08
scope: Continuous integration workflows, the pinned workspace toolchain, and the checks that report on pull requests.
---

# Continuous integration

`.github/workflows/ci.yml` verifies every pull request, every merge-queue check, and every push to `main`. It runs the same script a contributor runs locally, `pnpm verify`, so a green run means `verify` passed rather than that some CI-only approximation of it did. [Workspace](workspace.md) says what each script guarantees.

## Toolchain

Local and CI runs resolve the same versions, each declared once:

| Where                           | Declares                                        |
| ------------------------------- | ----------------------------------------------- |
| `package.json` `engines`        | The Node.js and pnpm range every run must meet  |
| `package.json` `packageManager` | The exact pnpm version pnpm installs itself     |
| `.nvmrc`                        | The exact Node.js version, read by `nvm` and CI |
| `.npmrc` `engine-strict`        | Makes an install outside `engines` fail         |

CI reads those same files rather than repeating a version: `pnpm/action-setup` takes pnpm from `packageManager`, and `actions/setup-node` takes Node.js from `.nvmrc`. A version is raised in one place, and a machine that cannot satisfy it is told at install time instead of failing later in a way nobody can reproduce.

`engine-strict` is deliberate friction. A patch-level difference rarely matters, and the one time it does, the failure looks like a bug in the change under review rather than a difference in the runtime.

Workspace setup, pnpm, Node.js and a `--frozen-lockfile` install, lives in the composite action `.github/actions/setup`, so every job that needs the workspace sets it up the same way. A lockfile that disagrees with the manifests fails the install rather than being rewritten in CI.

### Dependency installs

`pnpm-workspace.yaml` holds the pnpm settings that govern installs, locally and in CI alike:

- `blockExoticSubdeps: true` refuses a transitive dependency that resolves to a git repository or a tarball URL instead of the registry. A direct dependency's source is written in `package.json`, where a reviewer sees it; a transitive one would arrive through another package's manifest unseen.
- `trustPolicy: no-downgrade` refuses a version whose publish-time trust evidence, such as provenance or trusted publishing, is weaker than that of an earlier version of the same package. A release that drops its provenance is a common sign of a compromised publish.
- `trustPolicyIgnoreAfter: 10080` is an age in minutes, seven days, after which a version is no longer held to the trust policy. It stops a long-published version that predates provenance from being refused as a downgrade, while a fresh release, the one a compromise would be, is still checked. When one recent version must be let through, `trustPolicyExclude` names that exact version, with the reason in a comment and the condition for removing it.
- `allowBuilds` lists the only dependencies whose install scripts run. It starts empty: the template's tools ship their native binaries as optional dependencies and need none. A dependency that needs one, such as `esbuild`, gets an entry in the same change, with the reason.
- pnpm's default `minimumReleaseAge` holds back a version published less than a day ago, so a compromised release is usually caught and pulled before it can be installed here. A version needed sooner goes in `minimumReleaseAgeExclude`, by exact version, and leaves it once it is old enough.

## The workflow

| Job      | Runner          | Runs                                                 |
| -------- | --------------- | ---------------------------------------------------- |
| `Verify` | `ubuntu-latest` | `pnpm verify`, then the `Working tree is clean` step |

There is no change-based selection: every run checks the whole workspace. A check that skips part of the workspace on a pull request lets that part reach `main` unverified, and a selection has to be maintained and can be wrong in ways a green run hides. A project whose full run grows too slow to wait for adds selection then, under three rules:

- **The whole workspace is checked before the merge lands.** A merge queue does that: it runs the full check on the merge result and drops a pull request that fails it. A push run on `main` only reports afterwards, once the failure is already there. Without a queue, codenhub/codenhub's pull requests went green on their own packages while 3 of 30 merges on 2026-11-03 failed on `main`, in packages those pull requests never touched ([codenhub/codenhub@702af904](https://github.com/codenhub/codenhub/commit/702af904)).
- **A change to `.github/` runs everything.** A workflow or the setup action belongs to no package, so a selection by changed package selects nothing, and the run passes without exercising the change it was opened for ([codenhub/codenhub@3d9bfe8a](https://github.com/codenhub/codenhub/commit/3d9bfe8a)).
- **The run asserts the ref it compares against.** A selection that compares against the base branch needs that ref in the checkout (`fetch-depth: 0`), and the job checks the ref exists before selecting: a tool that falls back to working-tree changes when the ref is missing would, in CI, check nothing and report success.

`Working tree is clean` fails when a check has left a tracked or untracked file changed. A check that writes has changed what it was checking, so it is reported rather than passing.

Runs for the same pull request cancel each other, because only the newest push is worth a verdict. A merge-queue run or a push to `main` never cancels: each is the authoritative check of a commit. The `merge_group` trigger never fires in a repository without a merge queue. A project that requires one removes the `push` trigger, which sits in a project block for that reason: the queue lands the exact commit it checked, so a push run would only repeat a passed check. The workflow's token is read-only (`permissions: contents: read`); a job that needs more asks for it on that job alone.

<!-- project:start -->

### Triggers and selection

This repository's full run grew too slow to wait for, so it selects, under the three rules above:

| Event          | Selection                                                                           |
| -------------- | ----------------------------------------------------------------------------------- |
| `pull_request` | `--changed=origin/<base branch>`, or the whole workspace when it changes `.github/` |
| `merge_group`  | The whole workspace, with no selector                                               |

A pull request checks what it changed, which is what makes the run fast enough to wait for. The merge queue checks everything, so nothing lands unverified because it happened to sit outside a changed package. Both are needed: neither alone both stays fast and stays honest. Requiring the queue is repository settings, in the ruleset for `main` ([below](#branch-protection)); the `merge_group` trigger is what lets the required checks report in it.

CI does not run on a `push` to `main`. The queue lands the exact commit it tested, so its passing checks are already attached to the commit on `main`, and the ruleset lets nobody bypass the queue. Keeping a `push` run as the record of the landed commit was the earlier choice. It was reversed because that run repeated a check on an identical commit: on 2026-11-04 the queue tested `a823c49f`, `main` moved to that same commit, and CI ran the full workspace on it again, a third run per pull request where there had been two. The trigger has to come back if the ruleset ever gains a bypass actor or stops requiring the queue, because a commit could then reach `main` without a full run.

The `.github/` rule is how a browser-install fix once went green on its pull request and failed on its merge. Both selecting jobs, `verify` and `browser`, assert the base ref exists before running: `--changed` degrades to working-tree changes when its ref is missing, which locally means "check what I am editing" and in CI would mean checking nothing and reporting success.

The verification sequence builds declarations before `hub check` inspects them. Its `undocumented-export/missing-jsdoc` errors fail the `Verify` job when a selected package exposes a top-level typed export without JSDoc/TSDoc. The scope and remaining review responsibilities are defined in [`docs/guidelines/code.md`](guidelines/code.md).

CI runs one Node.js version and no other, for the packages as for the repository. A published package's `engines.node` floor is therefore the pinned major, so it names a line CI tests. [`docs/specs/packages-lifecycle.md`](specs/packages-lifecycle.md), "Node.js support", owns that rule, why no job tests an older floor, and what moving `.nvmrc` to a new major requires.

The scripts the workflow runs are `hub` commands: `hub verify`, `hub generate --dry-run`, and `hub browsers` all run locally, and [tooling](tooling.md) describes them.

### Jobs

The jobs run in parallel except that `browser` and `drift` wait for `playwright`, which takes seconds, and `browser-result` waits on `browser`, so a stale generated file is reported without waiting for the slowest test suite.

| Job              | Runs                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `verify`         | `pnpm verify --skip=test:browser <selector>`                                                                             |
| `playwright`     | Reads the `playwright-core` version from `pnpm-lock.yaml` and names the Playwright image for it                          |
| `browser`        | In that image: `pnpm hub browsers <selector> -- <engine>`, then `pnpm test:browser <selector> -- --project='*<engine>*'` |
| `drift`          | `pnpm generate --dry-run`, then an assertion that the working tree is unchanged                                          |
| `browser-result` | Nothing; it passes only when every `browser` job passed                                                                  |

`verify` skips the browser step because the `browser` job owns it. Running it in both would double the slowest part of the run for no extra signal.

`browser` is a matrix of one job per engine — `chromium`, `firefox`, `webkit` — so the workflow runs six jobs in total. The browser suites are by far the slowest thing in a run and the three engines share nothing, so splitting them trades runner minutes, which are cheap, for wall-clock time, which is what anyone waits on. The engines are no longer far apart. Firefox once cost roughly five times what Chromium did on the `styles` suite, which was a fixture problem rather than an engine one: every test took a fresh browser context, and Firefox charges far more for one than the others do. `packages/styles` now shares a context per worker, which brought that suite from 285s to 84s on Firefox. WebKit is the slowest engine on it today, and the matrix is what keeps the slowest one off everybody else’s critical path.

`fail-fast` is off for the matrix. "Firefox broke" and "WebKit broke" are different findings, and cancelling one to report the other hides half of what a run was started to learn.

`browser-result` exists because a protected `main` requires a check by name, and a matrix reports one check per engine rather than the single one the rule names. It carries that name and passes only when every engine job passed, so the branch rule keeps working without naming the engines: adding or removing one is a change to `ci.yml` and to nothing else. Encoding the engines in the branch rule instead would put half of this design into settings nobody can review in a diff.

It runs under `always()`, which is what makes it a gate rather than a formality. A job that runs only on success is skipped when an engine fails, and a skipped required check blocks a pull request exactly as an unreported one does, with the difference that nobody can tell why. Reporting the failure is the point.

Each job installs only its own engine and selects it with one glob. That works because every Playwright project in the repository is named after the engine it runs on; `docs/specs/tests.md` carries the rule, and a package free to name a project anything would silently drop out of an engine's job. `hub browsers` and `hub test:browser` both forward what follows `--` to Playwright, so neither the matrix nor the selector needed new tooling.

The `browser` and `drift` jobs run in Playwright's own image, `mcr.microsoft.com/playwright:v<version>-noble`, which carries the system libraries a headless browser needs and the browsers of one Playwright version. The `playwright` job picks the version from `pnpm-lock.yaml`, so a Playwright upgrade moves CI with it; it runs first because a container's image is fixed before any of its steps. It fails when the lockfile holds more than one `playwright-core` version, or none, since one image carries one version's browsers. The jobs run as the runner's user, `--user 1001`, as Playwright's CI guide recommends: the workspace and home the runner mounts are that user's, and Firefox refuses to start as root in a home another user owns.

The image replaced installing on a bare runner with `--with-deps`, which fetched about 130 MB of Ubuntu packages from the runner's package mirror on every run, outside any cache. That mirror was the one outside service every browser job depended on, and it degraded often enough to matter: installs that normally took under a minute took three to six when it crawled, and on two merges in one day it stalled outright until the job gave up. A retry could not recover that. `apt-get` runs under `sudo`, so a timed-out install left it running as root, beyond the reach of the runner's user, still holding the package lock the second attempt needed. The image is pulled from Microsoft's container registry, a different service, and holds everything the tests need, so a run installs nothing.

The image is named by tag, not pinned by digest the way actions are. The tag names one exact Playwright version and is derived from the lockfile, so it changes only with a reviewed dependency upgrade; a digest would have to be updated by hand beside every such upgrade.

The install still runs through `hub browsers`, the same command a contributor uses. In the image it downloads nothing; it stays because it is what would notice an image and a lockfile that disagree. Playwright artifacts are uploaded only when a job fails, which is the only time anyone reads them, and are named per engine so three jobs cannot overwrite each other's.

The gate also catches what an install itself writes. A tracked `bin` target has to be committed with its executable bit: pnpm chmods the file it links, so a mode that disagrees with the index shows up as a modified working tree on Linux and nowhere on Windows. `packages/tools/src/cli.ts` is tracked `100755` for that reason.

`drift` is a gate rather than a fix: `hub generate --dry-run` lists the files that no longer match the READMEs, package docs, and manifests they are derived from and exits non-zero without writing any of them. The step after it asserts that the dry run really wrote nothing: `git diff --exit-code` for tracked files, and an empty `git status --porcelain` for a file it created, which a diff never shows. A stale generated file means the repository describes itself incorrectly, which is why it fails a run rather than being regenerated by a bot: the author is the one who knows whether the source change was intended.

`drift` also installs Chromium, the one engine it needs: `@codenhub/styles`' `styles-palette` generator computes `./palette`'s values by rendering real composed colors in a real browser rather than reimplementing `color-mix()` math by hand (`docs/internal/generated-palette.md` describes the composition), and `hub generate --dry-run` still has to run that generator to know whether `src/palette.css` is stale. It runs in the same image, as the same user, as the `browser` job's chromium leg.

<!-- project:end -->

## Changing the workflow

Prefer adding a script to `package.json` over adding a step to the workflow. A step only CI can run is a step nobody can reproduce before pushing, and that is how CI turns into a second build system.

### Pinning third-party actions

Every action from another repository is referenced by full commit SHA, with the release it corresponds to in a trailing comment:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

A tag is a mutable pointer. `@v7` resolves to whatever its owner last pointed it at, so a compromised or simply retagged release changes what runs here without any change landing in this repository. A SHA cannot move, which turns an action upgrade into a reviewable diff. The comment carries the human-readable version, because a bare SHA says nothing about how far behind it is.

The rule is all or nothing on purpose. Pinning some actions and not others is worse than pinning none: a reader cannot tell a reference that was reviewed from one that was missed. Adding an action means resolving its SHA in the same change. The repository's Actions settings can enforce the rule, refusing any workflow that references another repository's action by anything but a full SHA; that setting is dashboard state, so turn it on when the repository is created.

`./.github/actions/setup` is deliberately not pinned. It is a path in this repository, already versioned by the commit under test.

For a hand upgrade, resolve the new SHA with `gh` and update the comment alongside it:

```sh
gh api repos/actions/checkout/commits/v7.0.1 --jq .sha
```

## Dependency updates

`.github/dependabot.yml` proposes weekly updates for the GitHub Actions, including the composite actions under `.github/actions/`, and for npm, where an update arrives as a catalog change in `pnpm-workspace.yaml` with the lockfile. It moves an action's SHA and its version comment together, so a pin and its label cannot drift apart. Every update pull request is labelled `type:chore`.

The groups take minor and patch updates only, so a week is one grouped pull request per ecosystem and directory. Dependabot groups each listed directory on its own, so the workflows and `.github/actions/*` can each get one: two pull requests for the actions in one week is the configuration working, not a duplicate. A major update arrives as a pull request of its own: it is a decision that may need code changes, and inside a group it would hold the routine updates back until it is dealt with.

`@types/node` never takes a major update from Dependabot. Node's types follow the Node.js release in `engines` and `.nvmrc`, and types for a newer Node accept APIs the pinned runtime does not have; they move by hand, with `.nvmrc`. A dependency held back for a known breakage gets an `ignore` entry with the reason and the condition for removing it.

Renovate does the same job, and was rejected: it runs as a GitHub App with a configuration of its own, while Dependabot is built into GitHub and already raises the repository's security updates.

## Branch protection

The workflow reports; it does not block on its own. What blocks is a branch protection rule or a ruleset on `main`, repository settings no file here can enforce. A ruleset does the same job with more control, and either works if nobody can bypass it. The recommended configuration:

| Setting                | Value                                 |
| ---------------------- | ------------------------------------- |
| Required status checks | `Verify`, from the GitHub Actions app |
| Pull request required  | Yes                                   |
| Enforced for admins    | Yes, with no bypass actors            |
| Force pushes, deletion | Refused                               |

Binding the checks to the GitHub Actions app stops any other integration from reporting a passing check under the same name. Admin enforcement is what makes the rest hold: without it, a maintainer's direct push to `main` is stopped only by the `pre-push` hook, which `--no-verify` skips.

Turn on "Automatically delete head branches" in the repository's general settings too; it is available on every plan. Deleting a merged branch is what makes GitHub retarget a pull request built on it to that branch's own base. With the branch left behind, the next pull request merges into it and never reaches `main`.

<!-- project:start -->

This repository's ruleset for `main` goes further than the recommendation, and has no bypass actors:

| Setting                | Value                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| Required status checks | `Verify`, `Browser tests`, and `Generated files`, from the GitHub Actions app |
| Merge queue            | Required, merging with a merge commit, grouped so all entries must pass       |
| Pull request required  | Yes, with every review thread resolved, and merge commits only                |
| Force pushes, deletion | Refused                                                                       |

The merge queue is what lets pull requests check only what they changed ([Triggers and selection](#triggers-and-selection)). `Browser tests` is the `browser-result` job's name, so the rule names no engine. The Actions setting that refuses an action referenced by anything but a full SHA is on, and "Automatically delete head branches" is on.

<!-- project:end -->

## Other workflows

The template's CI verifies; it does not deploy, release or publish. A project that does adds a workflow of its own and documents it here.

<!-- project:start -->

### Deployment checks

Three checks report on pull requests without living in this repository. The main site (`codenhub.dev`), the documentation site, and the demo site each deploy through their own Cloudflare Workers Builds project, connected to the repository from the Cloudflare dashboard; `apps/www/wrangler.jsonc`, `apps/docs/wrangler.jsonc`, and `apps/demo/wrangler.jsonc` describe what each one serves and the rest of all three deployments is dashboard state. `docs/roadmap.md` records why that split exists.

Because the trigger is dashboard state, a build fires for every push unless that project's build watch paths exclude the change. All three lists are recorded below so the reasoning is reviewable even though the setting is not.

Three things are true of all three.

Each list excludes rather than includes, and that direction is the point. An include list that misses a path publishes a stale site and says nothing; an exclude list that misses one costs a build nobody needed. Only the second failure is visible, so both filters are built to fail that way.

Package `src/` directories are deliberately absent from all three. Most of them cannot affect any site, but each site has a handful that are build inputs to it, so excluding `src/` wholesale would ship stale output, and excluding it per package would leave a trap for the first change that adds an import or a dependency. The saving does not come close to paying for a silent staleness failure.

Watch paths apply to the production branch only. Cloudflare documents excludes as applied first, with a build triggered only if a changed path survives them and then matches an include, and documents `*` as matching across `/` — so a push touching only `docs/ci.md` should not build. Three such pushes on a pull request branch built anyway, and the merge of the same change into `main` skipped. Read these filters as governing merges, not pull requests; nothing either one lists will spare a build on a branch.

The figures below come from replaying the same window of merges into `main` through each filter, so the documentation and demo lists are comparable with each other. The main site is new and has no replay window yet.

#### The main site

The `codenhub` project, serving `apps/www/dist`. `apps/www` is the entry point a visitor reaches first, so it takes the shortest project name; the documentation project moved to `codenhub-docs` when this one was added. These are the paths its Build watch paths setting excludes:

```
.github/*,.githooks/*,docs/*,apps/docs/*,apps/demo/*,AGENTS.md,CLAUDE.md,CONTRIBUTING.md,README.md,LICENSE,.oxlintrc.json,.oxfmtrc.json,.editorconfig,.gitattributes,.gitignore,packages/*/README.md,packages/*/LICENSE,packages/*/llms.txt,packages/*/llms-full.txt,packages/*/docs/*,packages/*/tests/*,packages/*/dev/*,packages/*/debug/*,packages/*/demo/*.ts,packages/*/demo/*.css,packages/*/demo/*.html,packages/*/demo/public/*
```

In a production build the main site reads its package content from the same release-tag snapshot as the documentation site, not the working tree: manifests, public docs paths (keys only, for slugs and changelog presence), `llms.txt` presence, each `README.md` and the `README.<locale>.md` translations of it, declared logos, recorded bundle sizes in `size.json`, and the release history in `releases.json`. The one thing it still reads from the working tree is `packages/*/demo/package.json`, to decide which packages link to a demo. Excludes have no negation, so instead of `packages/*/demo/*` the list names the file types a demo is built from (`*.ts`, `*.css`, `*.html`, and `public/`), and a demo's `package.json` survives them: any change to it, including adding or removing a demo, rebuilds the main site, while edits to the demo's source files do not. A demo file of another type also survives and costs an unneeded build, which is the safe direction to be wrong in. So what makes a merge relevant to the main site is its own app, `packages/*/demo/package.json`, and the `src/` build inputs it shares with the other sites: `@codenhub/app-shell`, `@codenhub/styles`, `@codenhub/icons`, and `@codenhub/tools`. Package manifests in the working tree no longer change what it shows, with one exception: a `listed: false` there keeps out a released package whose tag has no `codenhub` metadata (see "Publish-scoped content"). Everything else changes with a publish, through the deploy hook described there. The list above also excludes package `docs/`, `README.md`, `LICENSE`, and `llms*.txt` wholesale: the main site reads public docs paths, `llms.txt`, and `README.md` only from the snapshot, so working-tree changes to them cannot change it, and it reads `LICENSE` not at all. A translated `README.<locale>.md` is read only from the snapshot too, so it could join the excludes. Both other apps are excluded too. `packages/*/package.json` must stay watched because of that exception; it can join the excludes once the pre-migration fallback in `docs/specs/packages-metadata.md` is removed. `packages/*/size.json` is not excluded either, although the main site reads it only from the snapshot: it changes only in a release cut, whose commit also changes the watched `package.json`, so excluding it would save no build until `package.json` is excluded too.

#### The documentation site

The `codenhub-docs` project, serving `apps/docs/dist`. These are the paths its Build watch paths setting excludes:

```
.github/*,.githooks/*,docs/*,apps/demo/*,apps/www/*,AGENTS.md,CLAUDE.md,CONTRIBUTING.md,README.md,LICENSE,.oxlintrc.json,.oxfmtrc.json,.editorconfig,.gitattributes,.gitignore,packages/*/docs/internal/*,packages/*/tests/*,packages/*/dev/*,packages/*/debug/*,packages/*/demo/*
```

Each entry is excluded because the site provably cannot read it. The site's content comes from `packages/` alone: `apps/docs/astro.config.ts` points the documentation integration at that root, and `src/lib/catalog.ts` globs `packages/**/package.json` and public `packages/**/docs/**/*.md` from it. Root `docs/`, `README.md`, and `CONTRIBUTING.md` are repository governance, not site content. `docs/internal/**` is already outside the catalog glob. The `dev`, `debug`, and `demo` workspaces are `private: true`, and private manifests are filtered out of the public package summaries. `apps/demo/*` and `apps/www/*` are the other apps, which nothing here reads.

The `src/` rule above bites hardest here: `@codenhub/tools`, `@codenhub/styles`, and `@codenhub/kbd` are build inputs to this site — the integration imports `@codenhub/tools/documentation`. Over the replay window, excluding every package `src/` would have skipped only 2 more builds.

#### Publish-scoped content

A push to `main` says nothing about whether a package's new documentation has actually reached npm — two packages can be mid-flight together, one released and one not, and the watch-path filter above cannot tell them apart. So a production build does not read package content from the working tree at all. Before it, a parallel tree is written from release tags by `buildPublishedSnapshot` in `@codenhub/tools/release`, which both sites use: `apps/docs/src/lib/published-docs-snapshot-integration.ts` writes `apps/docs/.codenhub-published-docs/packages/` for the documentation site, keeping the packages that declare `codenhub.docs`, and `apps/www/src/lib/release-snapshot-integration.ts` writes `apps/www/.codenhub-published/` for the main site, keeping every released public package, including ones with no `codenhub` metadata; for those alone, a `listed: false` in the working tree keeps the package out, because their tag cannot say so (`docs/specs/packages-metadata.md`, "Pre-migration manifests"). The builder also writes `releases.json` beside `packages/`, the version history of every released package. The readers of package content use that tree instead: `src/lib/catalog.ts` in each app for pages, manifests, and the package list, and `src/lib/documentation-integration.ts` for `LICENSE`, `NOTICE`, `llms.txt`, `llms-full.txt`, and non-Markdown `docs/` assets, including the npm-pack validation it runs on them.

Each package in that tree is its own directory at its own newest stable `<name>@<version>` tag, resolved by `@codenhub/tools/release`. The documentation site also materializes the archived versions `docs/specs/packages-docs-versions.md` keeps, each from its own tag. Which ones it keeps comes from `codenhub.docs.versions` in the working-tree manifest, the second exception beside `listed: false` to reading package data only from tags; that spec records why. A pre-release tag such as `@codenhub/error@0.3.1-beta.1` is skipped, because it publishes under the `next` dist-tag and the site documents what `npm install` resolves by default; a package with only pre-release tags is absent, as if unpublished. The tree is written out by `materializeTreeAtRef`, which stages the tagged tree into a throwaway git index and checks it out from there — byte-for-byte, binary files included, without touching the repository's index or working tree. It is then pruned to what the site publishes or validates: `package.json`, `README.md`, each `README.<locale>.md` in a locale `docs/specs/packages-translations.md` lists, `LICENSE`, `NOTICE`, `llms.txt`, `llms-full.txt`, `size.json`, a declared logo, and public `docs/`, `docs/<locale>/` translations included. Source, tests, and configs are removed because the tree sits inside this app, where Vitest, `tsc`, and Vite would otherwise pick them up. Public docs cannot link outside that set (`invalid-docs-escape`), so nothing the site renders loses a link target; a README or `llms.txt` that linked into `src/` would fail the build with `missing-target`, and none does today.

A package reaches the site only when both hold: it has a release tag, and its manifest **at that tag** declares `codenhub.docs`. There is no fallback to the working tree. A package with no tag is absent, not shown live — falling back is how unreleased documentation used to reach the site, since most packages published before the tag workflow existed and had no tag to gate them. The opt-in is read from the released manifest because everything else is: a package joins the site in the release that ships its docs.

A failure is never treated as "nothing published there". A failed tag fetch, an unreadable tag, a package no longer at the location its tag put it, or a tag holding a different package at that location all fail the build rather than drop the package, because a released package missing from the site is a defect to report, not a state to ship. A package that moves directories therefore needs a release from its new location before the site can build again. An archived version is the one exception: content at its tag that the site cannot build drops that version with a warning instead of failing the build, while a tag that cannot be fetched or read still fails it (`docs/specs/packages-docs-versions.md`, "Building archived versions").

This only happens in a production build, never `astro dev`, so editing a package's docs locally still hot-reloads against the working tree. The switch is `readsPublishedSnapshot`, which mirrors `import.meta.env.PROD` — the signal `catalog.ts` chooses its glob roots on — rather than the Astro command alone: an `astro build` started under Vitest, as `src/layouts/docs-layout.test.ts` does, runs with `NODE_ENV=test`, reads the working tree for its pages, and must read it for resources too.

Because content is now scoped to what each package has actually published, the event that should refresh the site is a publish, not a merge — `.github/workflows/publish.yml` calls the `codenhub-docs` and `codenhub` projects' Cloudflare deploy hooks once `hub publish` succeeds, so a release reaches both sites without waiting for the next incidental push to `main` to trip the watch-path filter above. The push-triggered build still runs on top of that and re-derives the same tag-scoped snapshot every time, so it can never show more than what has actually published; it stays the only trigger for site content that is not published package content, such as `apps/docs`'s hand-authored shell pages and `apps/www`'s own pages and code.

One limitation this accepts: a documentation-only fix to an already-published package — a typo, a clarification, nothing behavior-affecting — is scoped to that package's `docs/` the same as everything else, so it does not reach the site until the package's next release either. Neither trigger rescues it, because both read the same tag-scoped snapshot. Revisit this if that turns out to matter in practice; it has not been separated out here to keep this a docs-only, single-purpose change.

Expect the filter to skip roughly a sixth of merges, not most of them. Over the window it skips 16 of 108, because the other 92 touch a surface the site publishes and genuinely need the rebuild they get. This repository is docs-first and `pnpm generate` rewrites `llms-full.txt` whenever a document changes, so most commits reach a published surface whatever else they touch. Path filtering cannot change that, which is why the larger saving came from not building branches at all.

`apps/demo/*` and `apps/www/*` are correct but not yet load-bearing: over the replay window no merge touched either without also touching something else this list excludes, so adding them skipped no build that was not already skipped. They start paying once the other apps accumulate changes of their own.

#### The demo site

The `codenhub-demo` project, serving `apps/demo/dist`. `apps/demo/docs/internal/architecture.md` owns how that output is built; this is what triggers the build. These are the paths its Build watch paths setting excludes:

```
.github/*,.githooks/*,docs/*,apps/docs/*,apps/www/*,AGENTS.md,CLAUDE.md,CONTRIBUTING.md,README.md,LICENSE,.oxlintrc.json,.oxfmtrc.json,.editorconfig,.gitattributes,.gitignore,packages/*/README.md,packages/*/LICENSE,packages/*/llms.txt,packages/*/llms-full.txt,packages/*/docs/*,packages/*/tests/*,packages/*/dev/*,packages/*/debug/*
```

It is close to the inverse of the documentation list. `packages/*/demo/*` moves from excluded to the thing that should trigger a build — it is what this site serves — and `apps/docs/*` and `apps/www/*` join the excludes, since a change to either of the other apps cannot reach this one.

The rest of the difference is that this site reads no Markdown at all. `apps/demo/src/lib/catalog.ts` globs `packages/*/demo/package.json` and `demo-integration.ts` copies each demo's `dist/`; nothing else in a package is an input. So where the documentation list has to keep public `packages/*/docs/` and exclude only `docs/internal/`, this one excludes package `docs/` wholesale, along with each package's `README.md`, `LICENSE`, `llms.txt`, and `llms-full.txt`.

That last pair is what makes this filter worth more than the other. `pnpm generate` rewrites `llms-full.txt` whenever a package document changes, which is exactly why the documentation filter cannot skip much; here those files are provably unread. Over the same window the demo filter skips 28 of 108 merges, roughly a quarter, against the documentation filter's sixth.

The `src/` rule applies here through dependencies rather than imports: `@codenhub/icons`, `@codenhub/styles`, and `@codenhub/tools` are build inputs, and `apps/demo/package.json` names each demo package it aggregates with a hand-maintained `workspace:*` line. Excluding the `src/` of packages absent from that list would mean the day someone adds a demo and forgets this file, the site quietly stops rebuilding. The architecture doc already makes that manifest a hand-maintained list; it should not also be a hand-maintained build trigger.

### Previews

All three Cloudflare projects build the production branch only; builds for non-production branches are off. That is where the build minutes went — a pull request pushed six times built the site six times, and watch paths would not have stopped any of them. Pull requests are now checked by the workflow above and nothing else.

A preview is therefore something a maintainer asks for:

```sh
pnpm hub preview:deploy www
pnpm hub preview:deploy docs
pnpm hub preview:deploy demo
```

That builds the app and uploads it as a new Worker version without deploying it, printing a preview URL. It runs from the maintainer's machine against their own `wrangler` login, so it consumes no build minutes and needs no credentials in this repository, which keeps the split that the rest of this section describes. `docs/tooling.md` documents the command and its alias flag.

Previewing the merge rather than a working tree is the one thing it does not do. A version uploaded from a laptop is built from whatever is checked out there.

### Publishing

`.github/workflows/publish.yml` publishes one package to npm. It is the only workflow that changes anything outside this repository, and everything about it is shaped by that.

It triggers on a tag matching `@codenhub/*@*` and on nothing else. The tag names the package and the version — `@codenhub/error@0.3.0` — and that pairing is the authorization: `docs/specs/packages-lifecycle.md` requires the version in the tag to equal the version in the manifest at the tagged commit, and `hub publish` refuses the run when they disagree. A merge never publishes. A merge is a decision to change `main`, not a decision to release, and keeping them apart is what makes a version bump revertible right up until someone tags it.

The `publish` job's body is one command:

```sh
pnpm hub publish --from-tag="$GITHUB_REF_NAME" --skip=test:browser
```

That command verifies the package, runs the publish preflight `hub release` reports, and publishes only when every precondition is `ready`. It is the same command a maintainer can run locally, which is the rule the section above states: a step only CI can run is a step nobody can reproduce before pushing. `docs/tooling.md` documents its flags.

`--skip=test:browser` is there for the reason the `verify` job skips it too: the `browser` matrix owns those suites, `browser-result` is a required check on `main`, and this job installs no browser engines. Without the skip, `hub verify` here fails to launch WebKit — the runner is missing its system libraries — and blocks a release the merge gate already cleared. The tagged commit still runs the rest of `verify` plus the preflight, and a tag is expected to point at a merged commit that passed the matrix.

#### The GitHub release

A second job, `release`, cuts a GitHub release from the same tag once `publish` succeeds, so the Releases tab and its Atom feed carry the history npm already has. Its notes are the version's `docs/changelog/<version>.md` page when the package keeps a changelog, and GitHub's generated notes otherwise; a pre-release version is marked as one. It runs `gh release create` directly rather than through `hub`, because it touches GitHub metadata rather than the package.

It is a separate job on purpose. `gh release create` needs `contents: write`, and the `publish` job runs the entire build and lifecycle toolchain — repository-controlled code that should never share a step with a push credential. So `publish` stays `contents: read` with `persist-credentials: false`, and only `release`, which checks out the repository and runs nothing from it, holds the write scope. Before creating the release it re-fetches the tag and refuses to continue if it no longer points at the commit that was published, since a tag can be force-moved by anyone with write access. The release never undoes the publish before it: the version is already on npm, and a missing release entry is re-creatable by hand with the same command.

#### Credentials

None for publishing itself. The `publish` job holds `id-token: write` and authenticates through npm trusted publishing, which exchanges that OIDC token for a credential valid for the length of the publish. No npm token exists in this repository or in its Actions secrets, which is the same split the deployments above keep — the repository carries the build, never the key. The workflow's default permission is `contents: read`; `contents: write` is the `release` job's alone.

Two secrets do exist, and neither is for publishing: `CLOUDFLARE_DOCS_DEPLOY_HOOK_URL` and `CLOUDFLARE_WWW_DEPLOY_HOOK_URL` are the `codenhub-docs` and `codenhub` projects' Cloudflare deploy hooks, called once `hub publish` succeeds (see "Publish-scoped content" above). Each can only trigger a rebuild of its one project — it cannot read or change anything — so neither carries the weight the rest of this section is protecting against, but each is a line in this ledger and is recorded here rather than left to be discovered in the workflow file. A missing or unreachable hook only warns; it never fails the job, since the version is already on npm by the time this step runs.

Provenance comes with that exchange rather than from a flag. `--provenance` is deliberately not passed: the registry already attests a trusted-publishing release, and the flag is rejected outside a supported CI provider, so passing it would buy nothing here and break `hub publish` on a maintainer's machine.

Trusted publishing needs npm 11.5.1 or newer. The pinned Node ships one well past that, so the workflow asserts the version rather than installing one — an npm that cannot do the exchange should fail by name, not as an authentication error inside `npm publish`.

#### The two things this workflow cannot do

A package's **first** release cannot go through it. npm has no trusted publisher to configure for a name that does not exist yet, so the first version of a package is published by a maintainer running `hub publish <package>` against their own `npm login`, and the trusted publisher is configured afterwards. Every release after the first goes through the workflow.

The first release still ends in the workflow, though, because it still needs its tag. `hub publish <package>` refuses to run until `<name>@<version>` names the commit being published, and the maintainer pushes that tag once npm has the version. The workflow then runs on it, finds the version already on npm, and succeeds without publishing, so the GitHub release is created and the documentation site rebuilds exactly as they do for a workflow publish.

A tag push runs this workflow, and `hub publish`, as they were at the tagged commit, so that no-op exists only for tags on commits that carry it. A tag added to an older commit, to record a version published before tags were kept, runs whatever that commit had: nothing at all before this workflow existed, and a refused publish between then and the no-op. Such a tag still does its real job — the documentation site reads it on its next build — but it does not trigger that build, and a refused run it starts can be cancelled.

A tag can be pushed by anyone with write access, from any commit. The job therefore runs in the `npm` environment, which is where a required reviewer is configured. Until one is, the environment exists with no protection rules and the workflow runs unimpeded; the environment is what gives that decision somewhere to live.

### Not covered yet

Nothing the repository would own is missing any more. The three deployments run from Cloudflare dashboard state, their previews from a maintainer's machine, and publishing from a tag through trusted publishing. None of them carries a credential here, which is the property to preserve when any of them changes.

<!-- project:end -->
