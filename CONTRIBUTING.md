# Contributing

This document defines the contributor workflow, from a working tree through validation, review, and release. It applies to maintainers, contributors, and AI agents.

[Documentation](docs/README.md) maps the guidelines, specifications, and references. [Tooling](docs/tooling.md) describes the commands below. [Agent instructions](AGENTS.md) contain agent-specific behavior and context guidance.

## Setup

The toolchain is pinned, and an install outside it fails rather than warns. `.nvmrc` pins Node.js: `nvm install` reads it, downloads that version when it is missing, and switches to it. pnpm installs the version `packageManager` names.

```sh
nvm install
pnpm install
```

nvm for Windows does not read `.nvmrc`, and `nvm install` and `nvm use` without a version fail, so name it; in PowerShell, `nvm install (Get-Content .nvmrc)`, then `nvm use (Get-Content .nvmrc)`. Checked with nvm for Windows 1.2.2, and in the source of 2.0.1, whose `install` requires the version.

`pnpm install` also points git at `.githooks/` through `core.hooksPath`, so the hooks described below start working after the first install and not before. If lifecycle scripts were disabled during the install, run `git config core.hooksPath .githooks`. [Workspace](docs/workspace.md#toolchain) covers why the versions are pinned where they are.

Browser suites need Playwright's browsers, which `pnpm hub browsers` installs and `pnpm test:browser` installs on its own before it runs; [tooling](docs/tooling.md#browser-tests) has the details. A package or app starts for development through its own script, as in `pnpm hub docs dev`.

## Changes

- Keep each change within its requested scope and preserve unrelated work.
- Applicable guidelines, specifications, and APPROVED or IMPLEMENTED documentation govern the change. Existing code may lag those contracts; conflicts and exceptions are resolved under the [documentation guidelines](docs/guidelines/documentation.md).
- Update affected documentation in the same change as behavior, public API, exports, conventions, or decisions. Each contract has one owning document; references point to that owner rather than repeat its requirements.
- Do not commit secrets, `.env` files, build artifacts, or unrelated changes.

- A breaking change to a published package takes the version that [`docs/specs/packages-lifecycle.md`](docs/specs/packages-lifecycle.md) governs, and its commit says what breaks in the body.
- A change to a package README or anything under a package's `docs/` regenerates the derived files in the same change, as [Validation](#validation) describes.

## Issues

Defects and requests are tracked as GitHub issues, opened through the bug and feature forms. A vulnerability is the exception: report it privately as [`SECURITY.md`](SECURITY.md) describes.

Each issue carries one label from each group that applies:

| Group     | Labels                                        | Says                                 |
| --------- | --------------------------------------------- | ------------------------------------ |
| `type:`   | `bug`, `feature`, `security`, `docs`, `chore` | What kind of work it is              |
| `pkg:`    | one per workspace package, by unscoped name   | Which package it is in               |
| `app:`    | one per app, by directory name                | Which app it is in                   |
| `status:` | `needs-triage`, `blocked`, `upstream`         | Why it is not moving, when it is not |

`status:upstream` means the issue waits on a change in a dependency you maintain, as [below](#a-defect-found-mid-task) describes.

| Group       | Labels             | Says                                             |
| ----------- | ------------------ | ------------------------------------------------ |
| `found-in:` | `repo`, `external` | Whether it surfaced in this repository or an app |

A defect found in this repository carries `found-in:repo`, as in `--label "type:bug,pkg:error,found-in:repo"`, and the workaround names it as `codenhub/codenhub#123`, which reads the same in an app outside this repository.

`.github/labels.json` holds the list. Unless the project derives its `pkg:` and `app:` labels, as recorded below, add an entry in the change that adds the package or app. After editing the list, create or update the labels on GitHub through `gh`:

```sh
node -e 'for (const l of require("./.github/labels.json")) require("node:child_process").execFileSync("gh", ["label", "create", l.name, "--color", l.color, "--description", l.description, "--force"], { stdio: "inherit" })'
```

It never deletes a label: deleting one strips it from every issue that carries it, so a label that is no longer listed is removed by hand.

The `type:` and `status:` labels do not depend on the project, so a GitHub organization can set them as its default labels, and a new repository then starts with the labels the issue forms and Dependabot apply. Renaming a label on GitHub, rather than creating it again, keeps it on the issues that carry it.

The `pkg:` and `app:` labels are derived from the workspace rather than listed, so the sync here is `pnpm hub labels`, which creates or updates the fixed groups in `.github/labels.json` and one label per package and app. Run it after adding a package or editing the list; [tooling](docs/tooling.md#issue-labels) describes the command.

### A defect found mid-task

A defect hit while working on something else is filed and worked around, not fixed on the spot. Fixing it in place mixes two subjects in one branch, for the reason the [commit](#atomic-commits) and [pull request](#pull-requests) rules already reject, and where the fix ships as a release, it forces a release in the middle of unrelated work.

File it with what triage needs, from the terminal:

```sh
gh issue create --title "<area>: <what is wrong>" --label "type:bug,status:needs-triage" --body "<what happened, what was expected, and the workaround>"
```

Then mark the workaround where it lives, naming the issue in full as `<owner>/<repo>#<number>`, so the reference reads the same wherever it is read:

```ts
// Workaround for <owner>/<repo>#123: <what it works around>.
```

Once the fix lands, searching for `<owner>/<repo>#123` finds every workaround to remove. A defect with no workaround blocks the task; say so, and the fix goes first, in its own pull request.

A defect or gap in a dependency you also maintain is fixed upstream, not around. File it in that dependency's repository, label the local issue that waits on it `status:upstream`, and mark the workaround with the upstream issue. Once the fix is released, raise the dependency to that version and remove every workaround that names the issue.

Opening an issue is outward-facing. An agent drafts it and asks before filing, as it does before pushing.

## Branches

Work happens on a branch. Do not commit to `main`.

`main` is the branch CI verifies in full and, in a project that deploys from it, the one that deploys, so a commit that lands there directly is one nobody reviewed. A pre-push hook refuses to push to it.

The exception is real but narrow: it takes an explicit request from a maintainer, in the moment, for that specific commit. An agent must ask and be told yes. Neither a general instruction to "just fix it" nor a previous approval carries over to the next commit.

Name the branch `<type>/<slug>`, where `<type>` is the [commit type](#type) of the work and `<slug>` is kebab-case. A version in the slug keeps its dots, as in `fix/validation-0.2-audit`.

```
feat/export-command
fix/build-dependency-order
docs/ci-required-checks
chore/update-dependencies
```

Every pushed branch follows the pattern, whoever or whatever created it. A tool that names its own branches, such as `claude/agent-branch-naming-03bee5` or `codex/fix-build-order`, does not make an exception: rename the branch with `git branch -m <type>/<slug>` before its first push. The `pre-push` hook refuses any other name.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<scope>)!: <subject>

<body>

<trailers>
```

A `commit-msg` hook checks the shape of the subject line. It cannot check whether the message is honest, which is the part that matters.

### Type

One of `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.

### Scope

The area the change lands in, and optional. For a workspace package it is the package name without its npm scope; for a package nested a level deeper, such as `packages/plugins/vite`, it is the path under `packages/`, as in `plugins/vite`. For an app it is the directory name under `apps/`. Repository-level areas use their own name, such as `ci`, `deps`, or `docs`. Leave it out when the change spans several.

### Subject

Imperative mood, lowercase, no trailing period: "add", not "added" or "Adds". Aim for 50 characters and stay under 72, which the hook enforces.

Describe what the change does for someone reading the log later, not which files moved. `fix(core): build workspace dependencies before their dependents` says what broke and what now happens; `fix(core): update build.ts` says nothing a diff would not.

Append `!` after the scope for a change that breaks a contract someone relies on, such as a public API, a configuration variable, or a persisted format, and say in the body what breaks and what to do about it.

### Body

Optional. Write one when the reason for the change is not obvious from the subject, and use it for why over what — the diff already carries the what.

### Atomic commits

One commit does one thing. A reviewer should be able to read the subject and know what is in the commit before opening it.

Split by intent, not by file count. Moving a function and changing its behavior are two commits even when they touch one file; renaming a symbol across twenty files is one commit. If a subject needs "and" to be accurate, that is usually two commits.

Formatting churn, unrelated fixes, and drive-by refactors are their own commits or their own pull request. Never bundle them into a behavior change: they make the real change unreviewable.

### Co-authorship

A commit an AI agent wrote or substantially shaped MUST carry a `Co-authored-by` trailer naming the **model**, not the tool or harness it ran in:

```
Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>
```

`Claude Opus 5.5`, not `Claude Code`; the model is what produced the change, and it is what someone auditing the history needs to know. A harness name records which client a person happened to open, which explains nothing about the commit. Use the model vendor's no-reply address when it publishes one.

The human directing the work stays the commit author. The trailer is an addition to authorship, never a replacement for it.

## Validation

Run scripts from the repository root. During development, narrow checks to what changed; [tooling](docs/tooling.md) lists the commands and how to narrow them. Before delivering a change, run the gate this section names; unless it names a narrower one, that is the whole gate:

```sh
pnpm verify
```

It runs formatting, linting, the build, type checking, and tests, the same checks CI runs. Report any step that was skipped or failed.

The gate before delivery is the branch selection, not the whole workspace. Root tooling owns dependency build ordering, so use its selectors rather than `pnpm --filter` or commands run from a package directory; [tooling](docs/tooling.md#targets) documents selector resolution and options.

```sh
pnpm verify --changed
```

It selects every package the branch changed, and every package when the branch changes a workspace-wide file ([tooling](docs/tooling.md#targets) lists them). Run the whole workspace, `pnpm verify` with no selector, only when the change reaches packages that selection cannot see: a change to `packages/tools`, which every package builds and checks with, or to `.github/`. Otherwise a workspace run repeats what CI already runs in full on every merge ([CI](docs/ci.md), "Triggers and selection"), and for a change to one package's prose it costs minutes to verify packages nothing touched. `--skip=test:browser` is appropriate when the change cannot affect browser suites; report any skipped steps.

Regenerate derived files if the change touched a package README or anything under a package's `docs/`, and commit the result — CI fails on drift rather than fixing it:

```sh
pnpm generate <target>
```

## Pull requests

Every change reaches `main` through a pull request, and CI verifies it.

Pushing a branch and opening a pull request are outward-facing actions. An agent asks first and does neither on its own initiative.

Keep a pull request to one subject. A branch that fixes a bug and also restructures a doc is two pull requests, for the same reason a commit that does both is two commits.

A pull request that resolves an issue says `Fixes #123` in its description, so merging it closes the issue. Merging is not releasing: a fix reaches users with the next release.

A pull request that builds on another unmerged one targets that one's branch and names it in its description. Merge them in order, the base first. GitHub then deletes the merged branch, with the setting [CI](docs/ci.md#branch-protection) recommends, and retargets the next pull request to `main`; merged out of order or before that retarget, it lands in the other branch instead of `main`.

## Releasing

Releasing is a maintainer action, and it is separate from merging. Merging changes `main`; a release puts a version where people install or reach it, and a published version can be superseded but rarely taken back.

Bump the version and record what users need to know in an ordinary pull request first; the release itself names a commit already on `main`.

A release publishes one package to npm, where a version can be deprecated but never replaced. Check the package is ready, then push the tag that authorizes the release:

```sh
pnpm hub release error
git tag "@codenhub/error@0.3.0"
git push origin "@codenhub/error@0.3.0"
```

The tag must name the version already in the package manifest on `main`; `.github/workflows/publish.yml` refuses the run otherwise. Bump the version and write its changelog entry in an ordinary pull request first, then tag the merge commit.

Once npm has the version, raise the package's entry in the `pnpm-workspace.yaml` catalog to it, in another ordinary pull request, if other packages install it from there. `hub check` warns about an entry that trails the latest release; [`docs/specs/packages-lifecycle.md`](docs/specs/packages-lifecycle.md) explains why public packages install each other from releases.

A package's first release is the exception and is published from a maintainer's machine, because npm cannot configure a trusted publisher for a name that does not exist yet. It is tagged all the same, and tagged first — `hub publish` refuses to run without the tag on the commit being published — then the tag is pushed once npm has the version:

```sh
git tag "@codenhub/kbd@0.1.0"
pnpm hub publish kbd
git push origin "@codenhub/kbd@0.1.0"
```

[`docs/specs/packages-lifecycle.md`](docs/specs/packages-lifecycle.md) owns the rules and [CI](docs/ci.md) the workflow.

### Trying a fix before its release

A fix merged to `main` reaches an app that installs from npm only once the package is released. When the app that found the defect should confirm the fix first, there are two ways to put it in the app's hands before a stable release.

To confirm one fix in one app, install a tarball. It leaves nothing behind on npm:

```sh
pnpm hub build error
cd packages/error && pnpm pack
```

The app then installs the `.tgz` file by path, and goes back to a released version once one carries the fix.

To let more than one app, or more than one person, try it, release a pre-release. It is an ordinary release with a SemVer suffix, cut and tagged the way above describes:

```sh
pnpm hub release error --cut=0.3.1-beta.1
```

A pre-release publishes under the `next` dist-tag, so `npm install` without a version keeps resolving the current stable release, and the documentation site keeps showing it. An app opts in with `pnpm add @codenhub/error@next` or the exact version. Each pre-release still uses up its version number on npm, and a package that keeps a changelog gets a page for it. The stable release that follows is cut with its explicit version, `--cut=0.3.1`.

Pushing a release tag and deploying are outward-facing actions. An agent asks first and never does either on its own initiative.

## Hooks

Three hooks run locally, all from `.githooks/`:

| Hook         | Checks                                                       |
| ------------ | ------------------------------------------------------------ |
| `pre-commit` | Formats and lints the staged files, re-staging what it fixed |
| `commit-msg` | The subject line shape described above                       |
| `pre-push`   | Refuses a direct push to `main`, and a misnamed branch       |

`--no-verify` bypasses them: on `git commit` for the first two, on `git push` for the last. It is for the commit that genuinely has to land unfixed, and an agent that reaches for it MUST say so in the same breath rather than quietly routing around a failing check. The whole point of a hook is that skipping one is visible.

### Why each hook does that much and no more

`pre-commit` runs only the formatters and linters, the checks `.githooks/profile.sh` declares for the stack. Type checking and tests take minutes, and a hook that slow gets bypassed until it may as well not exist; `pnpm verify` is where the rest belongs. [Workspace](docs/workspace.md#git-hooks) says which tools the profile runs and how the hooks are set up.

`pre-commit` reads files from the working tree rather than from the index. For a file that is only partly staged that matters: the hook never rewrites it, because re-staging would sweep in the parts deliberately left out of the commit, and it checks the file as it sits on disk. A commit whose staged content is already clean can therefore still fail. The reverse also holds: when the file was formatted on disk after its changes were staged, the hook passes while the staged content is still unformatted, and `pnpm verify` in CI then fails it. After formatting a partly staged file, stage the formatted parts again and review the staged content with `git diff --cached`. The alternative, skipping such files, would let unformatted code through in every case rather than this one.

`commit-msg` checks the subject line and nothing else. A body is optional, and no hook can tell whether a message describes the commit honestly, so the mechanical half is automated and the rest stays with review. Merges, reverts, and `fixup!`, `squash!`, and `amend!` markers pass unchecked: git composes those subjects, and rejecting a message nobody wrote would only train people to reach for `--no-verify` out of habit, which costs the checks that do matter. The 72-character limit is where practice already sat rather than a number from a style guide: replayed over 200 earlier commits of codenhub/codenhub, it rejected six, three merely long and three joining two changes with "and", which is the split the convention asks for anyway.

`pre-push` reads the destination ref rather than the branch you are standing on, so its refusal to push to `main` holds for a push from `main`, for an explicit refspec that targets it from elsewhere, and for a `--delete`. It also refuses a branch whose name is not `<type>/<slug>`. That check sits in a hook rather than in wording alone because the name is often not a choice anyone made: an agent harness creates `claude/...` or `codex/...` before the agent has read a file, and a rule about naming a branch does not read as applying to a branch that already has a name. Deleting a remote branch passes whatever it is called, since removing a misnamed branch is the cleanup, and tags are not checked.
