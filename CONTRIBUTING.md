# Contributing

This document covers how a change gets from a working tree into `main`:
branches, commits, and pull requests. It applies to everyone, and it applies
unchanged to AI agents — an agent that cannot follow it should not be committing
here. `AGENTS.md` routes agents to it.

What a change must contain, rather than how it lands, lives elsewhere:
`docs/code-guidelines.md` for code, `docs/docs-guidelines.md` for documentation,
and `docs/tooling.md` for the commands referenced below.

## Setup

The toolchain is pinned and an install outside it fails rather than warns:

```sh
nvm use
pnpm install
```

`pnpm install` also points git at `.githooks/` through `core.hooksPath`, so the
hooks described below start working after the first install and not before.
`docs/ci.md` covers why the versions are pinned where they are.

## Branches

Work happens on a branch. Do not commit to `main`.

`main` is the branch CI verifies in full and the branch the documentation site
deploys from, so a commit that lands there directly is one nobody reviewed and
one that publishes on its own. A pre-push hook refuses to push to it.

The exception is real but narrow: it takes an explicit request from a
maintainer, in the moment, for that specific commit. An agent must ask and be
told yes. Neither a general instruction to "just fix it" nor a previous
approval carries over to the next commit.

Name the branch `<type>/<slug>`, where `<type>` is the commit type of the work
and `<slug>` is kebab-case:

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

A `commit-msg` hook checks the shape of the subject line. It cannot check
whether the message is honest, which is the part that matters.

### Type

One of `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
`revert`, `style`, `test`.

### Scope

The area the change lands in, and optional. For a workspace package it is the
package name without the `@codenhub/` prefix — `styles`, `tools`, `router`. For
a nested package it is the path under `packages/` — `plugins/vite`. For an app
it is the directory name — `docs`. Repository-level areas use their own name,
such as `ci`.

### Subject

Imperative mood, lowercase, no trailing period: "add", not "added" or "Adds".
Aim for 50 characters and stay under 72, which the hook enforces.

Describe what the change does for someone reading the log later, not which
files moved. `fix(tools): build workspace dependencies before their dependents`
says what broke and what now happens; `fix(tools): update registry.ts` says
nothing a diff would not.

Append `!` after the scope for a breaking change, and say what breaks in the
body. `docs/specs/packages-lifecycle.md` governs the version that follows.

### Body

Optional. Write one when the reason for the change is not obvious from the
subject, and use it for why over what — the diff already carries the what.

### Atomic commits

One commit does one thing. A reviewer should be able to read the subject and
know what is in the commit before opening it.

Split by intent, not by file count. Moving a function and changing its behavior
are two commits even when they touch one file; renaming a symbol across twenty
files is one commit. If a subject needs "and" to be accurate, that is usually
two commits.

Formatting churn, unrelated fixes, and drive-by refactors are their own commits
or their own pull request. Never bundle them into a behavior change: they make
the real change unreviewable.

### Co-authorship

A commit an AI agent wrote or substantially shaped MUST carry a
`Co-authored-by` trailer naming the **model**, not the tool or harness it ran
in:

```
Co-authored-by: Claude Opus 5 <noreply@anthropic.com>
```

`Claude Opus 5`, not `Claude Code`; the model is what produced the change, and
it is what someone auditing the history needs to know. A harness name records
which client a person happened to open, which explains nothing about the commit.
Use the model vendor's no-reply address when it publishes one.

The human directing the work stays the commit author. The trailer is an
addition to authorship, never a replacement for it.

## Before opening a pull request

Run the full verification for what you touched:

```sh
pnpm verify --changed
```

Regenerate derived files if the change touched a package README or anything
under a package's `docs/`, and commit the result — CI fails on drift rather
than fixing it:

```sh
pnpm generate <target>
```

## Pull requests

Every change reaches `main` through a pull request. CI verifies what the branch
changed; the merge into `main` verifies the whole workspace.

Pushing a branch and opening a pull request are outward-facing actions. An
agent asks first and does neither on its own initiative.

Keep a pull request to one subject. A branch that fixes a bug and also
restructures a doc is two pull requests, for the same reason a commit that does
both is two commits.

## Hooks

Three hooks run locally, all from `.githooks/`:

| Hook         | Checks                                                       |
| ------------ | ------------------------------------------------------------ |
| `pre-commit` | Formats and lints the staged files, re-staging what it fixed |
| `commit-msg` | The subject line shape described above                       |
| `pre-push`   | Refuses a direct push to `main`                              |

`--no-verify` bypasses them. It is for the commit that genuinely has to land
unfixed, and an agent that reaches for it MUST say so in the same breath rather
than quietly routing around a failing check. `docs/tooling.md` describes what
each hook does and why it does no more than that.
