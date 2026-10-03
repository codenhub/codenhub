# Contributing

This document defines the contributor workflow, from a working tree through validation, review, and release. It applies to maintainers, contributors, and AI agents.

[Repository documentation](docs/README.md) maps the technical guidelines, specifications, and references. [Repository tooling](docs/tooling.md) describes the commands below. [Agent instructions](AGENTS.md) contain agent-specific behavior and context guidance.

## Setup

The toolchain is pinned and an install outside it fails rather than warns:

```sh
nvm use
pnpm install
```

`pnpm install` also points git at `.githooks/` through `core.hooksPath`, so the hooks described below start working after the first install and not before. `docs/ci.md` covers why the versions are pinned where they are.

## Changes

- Keep each change within its requested scope and preserve unrelated work.
- Applicable coding standards, specifications, and APPROVED or IMPLEMENTED documentation govern the change. Existing code may lag those contracts; conflicts and exceptions are resolved under the documentation guidelines.
- Update affected documentation alongside changes to behavior, public APIs, exports, conventions, or lifecycle rules. Each technical contract has one owning document; references identify that owner rather than repeat its requirements.
- Do not commit secrets, build artifacts, or unrelated changes.

## Issues

Defects and requests are tracked as GitHub issues, opened through the bug and feature forms. A vulnerability is the exception: report it privately as `SECURITY.md` describes.

Each issue carries one label from each group that applies:

| Group       | Labels                                      | Says                                             |
| ----------- | ------------------------------------------- | ------------------------------------------------ |
| `type:`     | `bug`, `feature`, `docs`, `chore`           | What kind of work it is                          |
| `pkg:`      | one per workspace package, by unscoped name | Which package it is in                           |
| `app:`      | one per app, by directory name              | Which app it is in                               |
| `status:`   | `needs-triage`, `blocked`                   | Why it is not moving, when it is not             |
| `found-in:` | `repo`, `external`                          | Whether it surfaced in this repository or an app |

`.github/labels.json` holds the fixed groups; the `pkg:` and `app:` labels are derived from the workspace. `pnpm hub labels` creates or updates all of them on GitHub, and is run after adding a package or editing the list. `docs/tooling.md` describes the command.

### A defect found mid-task

A defect in a package, hit while working on something else, is filed and worked around, not fixed on the spot. Fixing it in place mixes two subjects in one branch, for the reason the [commit](#atomic-commits) and [pull request](#pull-requests) rules already reject, and for a published package it also means a release in the middle of unrelated work.

File it with what triage needs, from the terminal:

```sh
gh issue create --title "error: <what is wrong>" --label "type:bug,pkg:error,found-in:repo" --body "<what happened, what was expected, and the workaround>"
```

Then mark the workaround where it lives, naming the issue in full so the reference reads the same in this repository and in an app outside it:

```ts
// Workaround for codenhub/codenhub#123: <what it works around>.
```

Once the fix is released, searching for `codenhub/codenhub#123` finds every workaround to remove. A defect with no workaround blocks the task; say so, and the fix goes first, in its own pull request.

Opening an issue is outward-facing. An agent drafts it and asks before filing, as it does before pushing.

### Trying a fix before its release

A fix merged to `main` reaches an app outside this repository only once the package is released, and a release cannot be taken back. When the app that found the defect should confirm the fix first, there are two ways to put it in the app's hands.

To confirm one fix in one app, install a tarball. It leaves nothing behind on npm:

```sh
pnpm hub build error
cd packages/error && pnpm pack
```

The app then installs the `.tgz` file by path, and goes back to a released version once one carries the fix.

To let more than one app, or more than one person, try it, release a pre-release. It is an ordinary release with a SemVer suffix, cut and tagged the way "Releasing" below describes:

```sh
pnpm hub release error --cut=0.3.1-beta.1
```

A pre-release publishes under the `next` dist-tag, so `npm install` without a version keeps resolving the current stable release, and the documentation site keeps showing it. An app opts in with `pnpm add @codenhub/error@next` or the exact version. Each pre-release still uses up its version number on npm, and a package that keeps a changelog gets a page for it. The stable release that follows is cut with its explicit version, `--cut=0.3.1`.

## Branches

Work happens on a branch. Do not commit to `main`.

`main` is the branch CI verifies in full and the branch the documentation site deploys from, so a commit that lands there directly is one nobody reviewed and one that publishes on its own. A pre-push hook refuses to push to it.

The exception is real but narrow: it takes an explicit request from a maintainer, in the moment, for that specific commit. An agent must ask and be told yes. Neither a general instruction to "just fix it" nor a previous approval carries over to the next commit.

Name the branch `<type>/<slug>`, where `<type>` is the commit type of the work and `<slug>` is kebab-case:

```
feat/docs-manual-previews
docs/ci-deployment-watch-paths
fix/build-dependency-order
chore/docs-wrangler-config
```

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

The area the change lands in, and optional. For a workspace package it is the package name without the `@codenhub/` prefix — `styles`, `tools`, `router`. For a nested package it is the path under `packages/` — `plugins/vite`. For an app it is the directory name — `docs`. Repository-level areas use their own name, such as `ci`.

### Subject

Imperative mood, lowercase, no trailing period: "add", not "added" or "Adds". Aim for 50 characters and stay under 72, which the hook enforces.

Describe what the change does for someone reading the log later, not which files moved. `fix(tools): build workspace dependencies before their dependents` says what broke and what now happens; `fix(tools): update registry.ts` says nothing a diff would not.

Append `!` after the scope for a breaking change, and say what breaks in the body. `docs/specs/packages-lifecycle.md` governs the version that follows.

### Body

Optional. Write one when the reason for the change is not obvious from the subject, and use it for why over what — the diff already carries the what.

### Atomic commits

One commit does one thing. A reviewer should be able to read the subject and know what is in the commit before opening it.

Split by intent, not by file count. Moving a function and changing its behavior are two commits even when they touch one file; renaming a symbol across twenty files is one commit. If a subject needs "and" to be accurate, that is usually two commits.

Formatting churn, unrelated fixes, and drive-by refactors are their own commits or their own pull request. Never bundle them into a behavior change: they make the real change unreviewable.

### Co-authorship

A commit an AI agent wrote or substantially shaped MUST carry a `Co-authored-by` trailer naming the **model**, not the tool or harness it ran in:

```
Co-authored-by: Claude Opus 5 <noreply@anthropic.com>
```

`Claude Opus 5`, not `Claude Code`; the model is what produced the change, and it is what someone auditing the history needs to know. A harness name records which client a person happened to open, which explains nothing about the commit. Use the model vendor's no-reply address when it publishes one.

The human directing the work stays the commit author. The trailer is an addition to authorship, never a replacement for it.

## Validation

Run scripts from the repository root. Root tooling owns dependency build ordering, so use its selectors rather than `pnpm --filter` or commands run from a package directory. Narrow development checks to the affected package or paths; [tooling](docs/tooling.md#targets) documents selector resolution and options.

Run `pnpm verify` after changes. A targeted run covers the affected package during development; the final verification before delivery covers the workspace. `--skip=test:browser` is appropriate when the change cannot affect browser suites; report any skipped steps.

Before opening a pull request, also verify the branch selection:

```sh
pnpm verify --changed
```

Regenerate derived files if the change touched a package README or anything under a package's `docs/`, and commit the result — CI fails on drift rather than fixing it:

```sh
pnpm generate <target>
```

## Pull requests

Every change reaches `main` through a pull request. CI verifies what the branch changed; the merge into `main` verifies the whole workspace.

Pushing a branch and opening a pull request are outward-facing actions. An agent asks first and does neither on its own initiative.

Keep a pull request to one subject. A branch that fixes a bug and also restructures a doc is two pull requests, for the same reason a commit that does both is two commits.

A pull request that resolves an issue says `Fixes #123` in its description, so merging it closes the issue. Merging is not releasing: a fix to a published package reaches consumers with that package's next release, whose changelog entry links the issue (`docs/specs/packages-changelog.md`).

## Releasing

Releasing a package is a maintainer action, and it is separate from merging. Merging changes `main`; releasing puts a version on npm, where it can be deprecated but never replaced.

Check the package is ready, then push the tag that authorizes the release:

```sh
pnpm hub release error
git tag "@codenhub/error@0.3.0"
git push origin "@codenhub/error@0.3.0"
```

The tag must name the version already in the package manifest on `main`; `.github/workflows/publish.yml` refuses the run otherwise. Bump the version and write its changelog entry in an ordinary pull request first, then tag the merge commit.

Once npm has the version, raise the package's entry in the `pnpm-workspace.yaml` catalog to it, in another ordinary pull request, if other packages install it from there. `hub check` warns about an entry that trails the latest release; `docs/specs/packages-lifecycle.md` explains why public packages install each other from releases.

A package's first release is the exception and is published from a maintainer's machine, because npm cannot configure a trusted publisher for a name that does not exist yet. It is tagged all the same, and tagged first — `hub publish` refuses to run without the tag on the commit being published — then the tag is pushed once npm has the version:

```sh
git tag "@codenhub/kbd@0.1.0"
pnpm hub publish kbd
git push origin "@codenhub/kbd@0.1.0"
```

`docs/specs/packages-lifecycle.md` owns the rules and `docs/ci.md` the workflow.

Pushing a release tag is an outward-facing action. An agent asks first and never pushes one on its own initiative.

## Hooks

Three hooks run locally, all from `.githooks/`:

| Hook         | Checks                                                       |
| ------------ | ------------------------------------------------------------ |
| `pre-commit` | Formats and lints the staged files, re-staging what it fixed |
| `commit-msg` | The subject line shape described above                       |
| `pre-push`   | Refuses a direct push to `main`                              |

`--no-verify` bypasses them. It is for the commit that genuinely has to land unfixed, and an agent that reaches for it MUST say so in the same breath rather than quietly routing around a failing check. `docs/tooling.md` describes what each hook does and why it does no more than that.
