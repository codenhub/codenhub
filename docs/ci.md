---
status: IMPLEMENTED
last_updated: 2026-11-16
scope: Continuous integration workflows and the checks that report on pull requests.
---

# Continuous integration

`.github/workflows/ci.yml` verifies every pull request and every merge-queue check. It runs the same script a contributor runs locally, `pnpm verify`, so a green run means `verify` passed rather than that some CI-only approximation of it did. [Workspace](workspace.md) says what each script guarantees.

## Toolchain

Local and CI runs resolve the same versions, each declared once, and CI reads those same declarations rather than repeating a version. A version is raised in one place, and a machine that cannot satisfy it is told at install time instead of failing later in a way nobody can reproduce. [Workspace](workspace.md#toolchain) lists where each version is declared.

Setup, the toolchain and an install from the lockfile, lives in the composite action `.github/actions/setup`, so every job that needs the project sets it up the same way. A lockfile that disagrees with the manifests fails the install rather than being rewritten in CI.

## The workflow

The workflow runs `Verify` without the browser suites, which run in jobs of their own; [Jobs](#jobs) lists every job and what it runs.

By default there is no change-based selection: every run checks the whole workspace. A check that skips part of the workspace on a pull request lets that part reach `main` unverified, and a selection has to be maintained and can be wrong in ways a green run hides. A project whose full run grows too slow to wait for adds selection then, under three rules:

- **The whole workspace is checked before the merge lands.** A merge queue does that: it runs the full check on the merge result and drops a pull request that fails it. A push run on `main` only reports afterwards, once the failure is already there. Without a queue, pull requests go green on their own packages while their merges fail on `main`, in packages those pull requests never touched.
- **A change to `.github/` runs everything.** A workflow or the setup action belongs to no package, so a selection by changed package selects nothing, and the run passes without exercising the change it was opened for.
- **The run asserts the ref it compares against.** A selection that compares against the base branch needs that ref in the checkout (`fetch-depth: 0`), and the job checks the ref exists before selecting: a tool that falls back to working-tree changes when the ref is missing would, in CI, check nothing and report success.

`Working tree is clean` fails when a check has left a tracked or untracked file changed. A check that writes has changed what it was checking, so it is reported rather than passing.

Runs for the same pull request cancel each other, because only the newest push is worth a verdict. A merge-queue run never cancels: it is the authoritative check of the commit that lands. This repository requires a merge queue, so the workflow has no `push` trigger: the queue lands the exact commit it checked, so a push run would only repeat a passed check. The workflow's token is read-only (`permissions: contents: read`); a job that needs more asks for it on that job alone.

### Triggers and selection

This repository's full run grew too slow to wait for, so it selects, under the three rules above:

| Event          | Selection                                                                           |
| -------------- | ----------------------------------------------------------------------------------- |
| `pull_request` | `--changed=origin/<base branch>`, or the whole workspace when it changes `.github/` |
| `merge_group`  | The whole workspace, with no selector                                               |

A pull request checks what it changed, which is what makes the run fast enough to wait for. The merge queue checks everything, so nothing lands unverified because it happened to sit outside a changed package. Both are needed: neither alone both stays fast and stays honest. Requiring the queue is repository settings, in the ruleset for `main` ([below](#branch-protection)); the `merge_group` trigger is what lets the required checks report in it.

CI does not run on a `push` to `main`. The queue lands the exact commit it tested, so its passing checks are already attached to the commit on `main`, and the ruleset lets nobody bypass the queue. Rejected: keeping a `push` run as the record of the landed commit, because that run repeats a check on an identical commit: the queue tests a commit, `main` moves to that same commit, and CI runs the full workspace on it again, a third run per pull request where two are enough. The trigger has to come back if the ruleset ever gains a bypass actor or stops requiring the queue, because a commit could then reach `main` without a full run.

The `.github/` rule is how a browser-install fix once went green on its pull request and failed on its merge. Both selecting jobs, `verify` and `browser`, assert the base ref exists before running: `--changed` degrades to working-tree changes when its ref is missing, which locally means "check what I am editing" and in CI would mean checking nothing and reporting success.

The verification sequence builds declarations before `hub check` inspects them. Its `undocumented-export/missing-jsdoc` errors fail the `Verify` job when a selected package exposes a top-level typed export without JSDoc/TSDoc. The scope and remaining review responsibilities are defined in [`docs/guidelines/code.md`](guidelines/code.md).

CI runs the repository on one Node.js version, the one `.nvmrc` pins. While `.node-floor` exists, the `floor` job also runs the suites of the published packages that keep the previous line's floor, on the version that file names, so their `engines.node` still names a line CI tests. [`docs/specs/packages-lifecycle.md`](specs/packages-lifecycle.md), "Node.js support", owns that rule and what moving `.nvmrc` to a new major requires.

The scripts the workflow runs are `hub` commands: `hub verify`, `hub generate --dry-run`, and `hub browsers` all run locally, and [tooling](tooling.md) describes them.

### Jobs

The jobs run in parallel except that `browser` and `drift` wait for `playwright`, which takes seconds, and `browser-result` waits on `browser`, so a stale generated file is reported without waiting for the slowest test suite.

| Job              | Runs                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verify`         | `pnpm verify --skip=test:browser <selector>`                                                                                                                                   |
| `playwright`     | Reads the `playwright-core` version from `pnpm-lock.yaml` and names the Playwright image for it                                                                                |
| `browser`        | In that image: `pnpm hub browsers <selector> -- <engine>`, then `pnpm test:browser <selector> -- --project='*<engine>*'`, then an assertion that the working tree is unchanged |
| `drift`          | `pnpm generate --dry-run`, then an assertion that the working tree is unchanged                                                                                                |
| `browser-result` | Nothing; it passes only when every `browser` job passed                                                                                                                        |
| `floor`          | Switches to the Node.js `.node-floor` names, then `pnpm test <packages on the floor> <selector>`                                                                               |

`verify` skips the browser step because the `browser` job owns it. Running it in both would double the slowest part of the run for no extra signal.

`browser` is a matrix of one job per engine — `chromium`, `firefox`, `webkit` — so with the five single ones the workflow runs eight in total. The browser suites are by far the slowest thing in a run and the three engines share nothing, so splitting them trades runner minutes, which are cheap, for wall-clock time, which is what anyone waits on. Firefox charges far more for a fresh browser context than the other engines do, so a suite that takes a fresh context for every test runs several times slower there, a fixture problem rather than an engine one; `packages/styles` shares a context per worker for that reason, which keeps the engines close. Whichever engine is the slowest, the matrix is what keeps it off everybody else’s critical path.

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

`floor` exists while a published package keeps the floor of the Node.js line before the one `.nvmrc` pins, as [`docs/specs/packages-lifecycle.md`](specs/packages-lifecycle.md), "Node.js support", allows. It installs on the pinned version, because the root `engines` refuses any other, then switches to the version in `.node-floor` and runs the unit and integration suites of every public package whose `engines.node` names that major, with the same selection as `verify`. The list is read from the manifests, so a package that raises its floor leaves the job in the same change; with no package left, the job runs nothing, and the change that deletes `.node-floor` deletes the job. Prerequisite builds run on the floor too. Browser suites do not: they test the browsers, not Node.js. It is a required check, because a floor no required check tests is a claim nothing holds.

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

This repository's ruleset for `main` goes further than the recommendation, and has no bypass actors:

| Setting                | Value                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Required status checks | `Verify`, `Browser tests`, `Generated files`, and `Node.js floor`, from the GitHub Actions app |
| Merge queue            | Required, merging with a merge commit, grouped so all entries must pass                        |
| Pull request required  | Yes, with every review thread resolved, and merge commits only                                 |
| Force pushes, deletion | Refused                                                                                        |

The merge queue is what lets pull requests check only what they changed ([Triggers and selection](#triggers-and-selection)). `Browser tests` is the `browser-result` job's name, so the rule names no engine. The Actions setting that refuses an action referenced by anything but a full SHA is on, and "Automatically delete head branches" is on.

## Other workflows

The workflow above verifies; it does not deploy, release or publish. A project that does adds a workflow of its own and documents it here. One of the workflows below verifies too, and is separate only for its trigger.

### Tailwind versions

`.github/workflows/tailwind.yml` is a matrix of two jobs, one per Tailwind version, for the one package whose output a consumer's own Tailwind compiles. `@codenhub/styles/tw` has to work anywhere in the Tailwind range its guide documents, `packages/styles/docs/integrating/tailwind.md`, but the workspace builds and tests with the single version its catalog pins, so a feature newer than the floor, or a change in a newer 4.x, would pass every job of `ci.yml`. Each job installs `tailwindcss`, which a consumer brings, at the floor read from that guide's ``(`>=x.y.z <5`)``, so raising the floor there moves the job with it, or at the newest 4.x, then runs the package's integration suite, which compiles `/tw` as a consumer does. `@tailwindcss/cli` moves to the same version, though no consumer needs it: the integration suite compiles through it, and a CLI of another version would bring its own `tailwindcss`. The package's own build keeps the catalog's `@tailwindcss/node`, as a published `dist/` does. The range is read from the guide because the package declares no `tailwindcss` peer: an optional one still takes part in npm's resolution, so a project on Tailwind 3 failed `npm install` with `ERESOLVE` even when it only linked the compiled CSS.

It is a workflow of its own for its `paths` filter. A pull request starts it only when it changes `packages/styles/` or `.github/`, so a pull request to any other package starts no job here; `paths` does not apply to a merge group, so the queue always runs both. Rejected: keeping the two jobs in `ci.yml`, where a filter would cover every job, so each one checks out the repository and installs the workspace before a step compares the changed paths and skips the suite, about 30 seconds a job on every pull request that skips it, in a repository where most pull requests touch another package. Rejected too: a job in `ci.yml` that compares the paths and gates the two through `needs`. It still starts a job on every pull request, and it keeps a comparison in shell where GitHub has one.

The three rules of [The workflow](#the-workflow) hold. The queue runs the suite on every merge result, a change to `.github/` runs it, and GitHub evaluates the filter against the pull request's own diff, so no ref has to be present in a checkout. The workspace-wide files `--changed` widens on, such as the lockfile, are not in the filter: they would start both jobs on every dependency update, and the queue runs them before such a change lands.

It is not a required check: a new Tailwind release can fail it on a pull request that changed nothing about Tailwind, and that is a finding to file rather than a reason to block the merge. That is also what lets a filter skip it, since a required check that never reports leaves a pull request waiting.

### Deployments

The main site (`codenhub.dev`), the documentation site, and the demo site each deploy through their own Cloudflare Workers Builds project, connected to the repository from the Cloudflare dashboard: `codenhub` serves `apps/www/dist`, `codenhub-docs` serves `apps/docs/dist`, and `codenhub-demo` serves `apps/demo/dist`. `apps/www` is the entry point a visitor reaches first, so it takes the shortest project name, and the documentation site takes `codenhub-docs`. `apps/*/wrangler.jsonc` describe what each one serves, and the rest of each deployment is dashboard state. `docs/roadmap.md` records why that split exists.

A push starts no build. Each project's Build watch paths setting excludes `*`, because Workers Builds has no setting that turns production builds off and keeps deploy hooks. Two triggers start builds instead, both through the projects' deploy hooks:

- `.github/workflows/deploy.yml` runs on every push to `main`. `hub deploy:affected --changed=<the commit the push started from>` names the sites the push can change, and the workflow calls only their hooks. Run by hand (`workflow_dispatch`), it rebuilds all three, which is the recovery for a hook that failed and the trigger for a change made outside this repository, such as the brand assets.
- `.github/workflows/publish.yml` calls the `codenhub` and `codenhub-docs` hooks once `hub publish` succeeds, because a release changes what those two sites show without changing their inputs ("Publish-scoped content" below).

A deploy hook builds the head of `main` when Cloudflare starts the build, not the commit that called it, and Cloudflare returns a build that is still queued rather than starting a second one. A build that started before a later push still finishes and deploys the commit it started from, but the later push's hook starts a build after it, so the last deploy is always the head of `main`. Runs of `deploy.yml` therefore need no concurrency group. A group would be wrong: GitHub cancels the pending run it replaces, and that run may be the only trigger for a site the newer push did not change.

Watch-path exclusion has two documented exceptions: Cloudflare still builds a push that changes no files, and one with 20 or more commits or 3,000 or more changed files. Either costs one build too many, nothing worse.

#### Which sites a push changes

`hub deploy:affected` reads `DEPLOYED_SITES` in `packages/tools/src/deploy/affected-sites.ts`. A changed path affects a site when it is:

- in the site's app, or in a workspace package the app depends on, directly or transitively, read from the manifests' `workspace:*` dependencies;
- one of the root files every build reads: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `tsconfig.json`, `.nvmrc`, and `.npmrc`; or
- a path outside the dependency graph that the site also reads from the working tree: every `packages/**/package.json` for the main and documentation sites, every `packages/*/demo/package.json` for the demo site.

Within the app and its dependencies, files no site build reads from the working tree are ignored: at a package's root, `README.md` and its `README.<locale>.md` translations, `LICENSE`, `NOTICE`, `llms.txt`, `llms-full.txt`, `AGENTS.md`, the Vitest and Playwright configs, `tsconfig.test.json`, and the `docs/`, `tests/`, `bench/`, and `playground/` directories; and `*.test.ts` anywhere. Package prose is read only from the release-tag snapshot, which a push does not change. A package nested in a dependency, such as `packages/styles/demo`, is a package of its own and counts only if the site depends on it.

Rejected: a hand-kept list of excluded paths per project. Such a list keeps every package's `src/` watched, because excluding the `src/` of packages that are not build inputs means a list that the first new import or dependency makes wrong, and a wrong exclude list ships a stale site without a word. Keeping every `src/` watched rebuilds each site for changes to packages it never builds against, and many merges change no site at all. The graph cannot drift that way: an app that gains a dependency gains its trigger in the same change. What stays hand-kept is the short ignore list above and each site's extra reads, which change only when a site starts reading a new kind of working-tree file; such a change adds the pattern to `DEPLOYED_SITES` too.

Most of the builds the graph still starts come from changes to `@codenhub/tools`, `@codenhub/styles`, and `@codenhub/app-shell`, which every site builds against.

#### The main site

In a production build the main site reads its package content from the same release-tag snapshot as the documentation site, not the working tree: manifests, public docs paths (keys only, for slugs and changelog presence), `llms.txt` presence, each `README.md` and its `README.<locale>.md` translations, declared logos, recorded bundle sizes in `size.json`, and the release history in `releases.json`. From the working tree it reads `packages/*/demo/package.json`, to decide which packages link to a demo, and package manifests for one exception: a `listed: false` there keeps out a released package whose tag has no `codenhub` metadata (see "Publish-scoped content"). That exception is why the site reads every package manifest; the read narrows to demo manifests once the pre-migration fallback in `docs/specs/packages-metadata.md` is removed. Beyond its own app, it builds against `@codenhub/app-shell`, `@codenhub/i18n`, `@codenhub/icons`, `@codenhub/styles`, and `@codenhub/tools`, and what they depend on.

#### The documentation site

A production build reads package content only from the release-tag snapshot that "Publish-scoped content" describes, so package `docs/`, READMEs, `LICENSE`, `NOTICE`, and `llms*.txt` in the working tree cannot change it; editing them reaches the site with the package's next release, through the publish deploy hook. Apart from source, the build reads two things from the working tree: `packages/*/package.json`, for the `codenhub.docs.versions` the snapshot keeps, and `packages/*/demo/package.json`, whose presence `src/lib/catalog.ts` uses to decide whether a package links to its demo. The `dev`, `debug`, and `demo` workspaces are `private: true` and filtered out of the public package summaries. Beyond its own app, it builds against `@codenhub/app-shell`, `@codenhub/icons`, `@codenhub/styles`, and `@codenhub/tools`, and what they depend on; the integration imports `@codenhub/tools/documentation`.

#### Publish-scoped content

A push to `main` says nothing about whether a package's new documentation has actually reached npm — two packages can be mid-flight together, one released and one not, and nothing in the push tells them apart. So a production build does not read package content from the working tree at all. Before it, a parallel tree is written from release tags by `buildPublishedSnapshot` in `@codenhub/tools/release`, which both sites use: `apps/docs/src/lib/published-docs-snapshot-integration.ts` writes `apps/docs/.codenhub-published-docs/packages/` for the documentation site, keeping the packages that declare `codenhub.docs`, and `apps/www/src/lib/release-snapshot-integration.ts` writes `apps/www/.codenhub-published/` for the main site, keeping every released public package, including ones with no `codenhub` metadata; for those alone, a `listed: false` in the working tree keeps the package out, because their tag cannot say so (`docs/specs/packages-metadata.md`, "Pre-migration manifests"). The builder also writes `releases.json` beside `packages/`, the version history of every released package. The readers of package content use that tree instead: `src/lib/catalog.ts` in each app for pages, manifests, and the package list, and `src/lib/documentation-integration.ts` for `LICENSE`, `NOTICE`, `llms.txt`, `llms-full.txt`, and non-Markdown `docs/` assets, including the npm-pack validation it runs on them.

Each package in that tree is its own directory at its own newest stable `<name>@<version>` tag, resolved by `@codenhub/tools/release`. The documentation site also materializes the archived versions `docs/specs/packages-docs-versions.md` keeps, each from its own tag. Which ones it keeps comes from `codenhub.docs.versions` in the working-tree manifest, the second exception beside `listed: false` to reading package data only from tags; that spec records why. A pre-release tag such as `@codenhub/error@0.3.1-beta.1` is skipped, because it publishes under the `next` dist-tag and the site documents what `npm install` resolves by default; a package with only pre-release tags is absent, as if unpublished. The tree is written out by `materializeTreeAtRef`, which stages the tagged tree into a throwaway git index and checks it out from there — byte-for-byte, binary files included, without touching the repository's index or working tree. It is then pruned to what the site publishes or validates: `package.json`, `README.md`, each `README.<locale>.md` in a locale `docs/specs/packages-translations.md` lists, `LICENSE`, `NOTICE`, `llms.txt`, `llms-full.txt`, `size.json`, a declared logo, and public `docs/`, `docs/<locale>/` translations included. Source, tests, and configs are removed because the tree sits inside this app, where Vitest, `tsc`, and Vite would otherwise pick them up. Public docs cannot link outside that set (`invalid-docs-escape`), so nothing the site renders loses a link target; a README or `llms.txt` that linked into `src/` would fail the build with `missing-target`, and none does today.

A package reaches the site only when both hold: it has a release tag, and its manifest **at that tag** declares `codenhub.docs`. There is no fallback to the working tree. A package with no tag is absent, not shown live — falling back would let the unreleased documentation of a package that was never tagged reach the site. The opt-in is read from the released manifest because everything else is: a package joins the site in the release that ships its docs.

A failure is never treated as "nothing published there". A failed tag fetch, an unreadable tag, a package no longer at the location its tag put it, or a tag holding a different package at that location all fail the build rather than drop the package, because a released package missing from the site is a defect to report, not a state to ship. A package that moves directories therefore needs a release from its new location before the site can build again. An archived version is the one exception: content at its tag that the site cannot build drops that version with a warning instead of failing the build, while a tag that cannot be fetched or read still fails it (`docs/specs/packages-docs-versions.md`, "Building archived versions").

This only happens in a production build, never `astro dev`, so editing a package's docs locally still hot-reloads against the working tree. The switch is `readsPublishedSnapshot`, which mirrors `import.meta.env.PROD` — the signal `catalog.ts` chooses its glob roots on — rather than the Astro command alone: an `astro build` started under Vitest, as `src/layouts/docs-layout.test.ts` does, runs with `NODE_ENV=test`, reads the working tree for its pages, and must read it for resources too.

Because content is scoped to what each package has actually published, the event that refreshes it is a publish, not a merge — `.github/workflows/publish.yml` calls the `codenhub-docs` and `codenhub` projects' deploy hooks once `hub publish` succeeds, so a release reaches both sites without waiting for a push that changes them. A push-triggered build re-derives the same tag-scoped snapshot every time, so it can never show more than what has actually published; it stays the only trigger for site content that is not published package content, such as `apps/docs`'s hand-authored shell pages and `apps/www`'s own pages and code.

One limitation this accepts: a documentation-only fix to an already-published package — a typo, a clarification, nothing behavior-affecting — is scoped to that package's `docs/` the same as everything else, so it does not reach the site until the package's next release either. Neither trigger rescues it, because both read the same tag-scoped snapshot. Revisit this if that turns out to matter in practice; it has not been separated out here to keep this a docs-only, single-purpose change.

#### The demo site

`apps/demo/docs/internal/architecture.md` owns how the demo site's output is built. It reads no Markdown and no release-tag snapshot. `apps/demo/src/lib/catalog.ts` discovers demos by globbing `packages/*/demo/package.json`, and `demo-integration.ts` copies each demo's `dist/`, failing the build when one is missing. Its build inputs beyond its own app are the demo packages `apps/demo/package.json` names, the packages they demonstrate, and `@codenhub/app-shell`, `@codenhub/icons`, `@codenhub/styles`, and `@codenhub/tools`. A new demo that `apps/demo/package.json` does not name yet still triggers a build through its manifest, and that build fails on the missing `dist/` rather than leaving the demo out without a word.

### Previews

All three Cloudflare projects build the production branch only; builds for non-production branches are off. That is where the build minutes went — a pull request pushed six times built the site six times. Pull requests are now checked by the workflow above and nothing else.

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

Three secrets do exist, and none is for publishing: `CLOUDFLARE_WWW_DEPLOY_HOOK_URL`, `CLOUDFLARE_DOCS_DEPLOY_HOOK_URL`, and `CLOUDFLARE_DEMO_DEPLOY_HOOK_URL` are the `codenhub`, `codenhub-docs`, and `codenhub-demo` projects' Cloudflare deploy hooks. `deploy.yml` calls each one for a push that changes its site, and this workflow calls the first two once `hub publish` succeeds (see "Deployments" above). Each can only trigger a rebuild of its one project — it cannot read or change anything — so none carries the weight the rest of this section is protecting against, but each is a line in this ledger and is recorded here rather than left to be discovered in a workflow file. Here a missing or unreachable hook only warns and never fails the job, since the version is already on npm by the time this step runs; in `deploy.yml` it fails the run, since no push builds a site by itself.

Provenance comes with that exchange rather than from a flag. `--provenance` is deliberately not passed: the registry already attests a trusted-publishing release, and the flag is rejected outside a supported CI provider, so passing it would buy nothing here and break `hub publish` on a maintainer's machine.

Trusted publishing needs npm 11.5.1 or newer. The pinned Node ships one well past that, so the workflow asserts the version rather than installing one — an npm that cannot do the exchange should fail by name, not as an authentication error inside `npm publish`.

#### The two things this workflow cannot do

A package's **first** release cannot go through it. npm has no trusted publisher to configure for a name that does not exist yet, so the first version of a package is published by a maintainer running `hub publish <package>` against their own `npm login`, and the trusted publisher is configured afterwards. Every release after the first goes through the workflow.

The first release still ends in the workflow, though, because it still needs its tag. `hub publish <package>` refuses to run until `<name>@<version>` names the commit being published, and the maintainer pushes that tag once npm has the version. The workflow then runs on it, finds the version already on npm, and succeeds without publishing, so the GitHub release is created and the documentation site rebuilds exactly as they do for a workflow publish.

A tag push runs this workflow, and `hub publish`, as they were at the tagged commit, so that no-op exists only for tags on commits that carry it. A tag added to an older commit, to record a version published before tags were kept, runs whatever that commit had: nothing at all before this workflow existed, and a refused publish between then and the no-op. Such a tag still does its real job — the documentation site reads it on its next build — but it does not trigger that build, and a refused run it starts can be cancelled.

A tag can be pushed by anyone with write access, from any commit. The job therefore runs in the `npm` environment, which is where a required reviewer is configured. Until one is, the environment exists with no protection rules and the workflow runs unimpeded; the environment is what gives that decision somewhere to live.

### Not covered yet

Nothing the repository would own is missing any more. The three deployments build from Cloudflare dashboard state when a deploy hook asks, their previews from a maintainer's machine, and publishing from a tag through trusted publishing. None of them carries a credential here beyond the deploy hooks, which can only start a build; that is the property to preserve when any of them changes.
