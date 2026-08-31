# Agent instructions

This repository is docs-first. Before making non-trivial changes, read and follow the relevant source-of-truth documents in `docs/`, especially `docs/code-guidelines.md` and `docs/docs-guidelines.md`.

## Repository map

A pnpm workspace of publishable packages, the apps that exercise them, and the documentation that governs both.

| Path                | Holds                                                           |
| ------------------- | --------------------------------------------------------------- |
| `packages/`         | Libraries and primitives, most of them published                |
| `packages/plugins/` | Framework plugins, nested by host: `tauri/`, `vite/`            |
| `packages/tools/`   | The `hub` CLI behind every root script                          |
| `apps/`             | `docs` publishes the site, `debug` is a private scratch app     |
| `docs/`             | Durable repository documentation; `docs/specs/` holds the specs |
| `assets/`           | Repository-wide fonts, logos, and icons                         |

`README.md` lists every package and what it is for. Read it before touching a package you have not worked in.

## Priority

Follow instructions in this order:

1. User request.
2. `AGENTS.md` and `CLAUDE.md`.
3. APPROVED or IMPLEMENTED documents in `docs/`.
4. Existing code.

If APPROVED or IMPLEMENTED docs conflict with code, treat code as legacy unless the doc is clearly outdated.

## Working agreement

Do not assume. When a request has two readings that lead to different work, ask before starting; a reading picked silently is one nobody can review, because it never appears in the diff.

Ask at the point the answer is needed, not at the end. Do everything that does not depend on it first, then stop and ask, even mid-implementation. A wrong assumption found at the end costs more than a question asked in the middle.

Close by listing the judgment calls you made and the assumptions you worked under, so each can be confirmed or reversed. A decision recorded in the final message is reviewable; the same decision left implicit is not.

Report what happened. A failing check, a skipped step, or a partially finished task is stated plainly, with the output that shows it. Never describe work as done when it is not.

## Commands

Run `pnpm verify` after changes from the repository root. It runs formatting, linting, building, type checking, tests, browser tests, and compliance checks in that order and stops at the first failure:

```sh
pnpm verify error
pnpm verify --changed
pnpm verify
```

Run an individual step only when you need it alone. Use `pnpm verify --skip=test:browser` when a change cannot affect the browser suites.

After changing a package README or any file under a package's `docs/`, run `pnpm generate` to rewrite the files derived from them; never edit a generated file by hand.

Every root script accepts the same targets: a package name, a workspace directory, a path, a glob, or nothing to select the whole workspace.

```sh
pnpm test error
pnpm test packages/error/src/bucket.test.ts
pnpm typecheck packages/plugins/vite/icons
pnpm lint:fix packages/error/src
pnpm test --changed
```

Run scripts from the repository root. Do not change into a package directory, and prefer these targets over `pnpm --filter`: filtering skips the build ordering that package scripts no longer perform themselves.

Always pass a target when working on a package. Every command narrows to one, including `check` and `generate`, so there is no reason to run the workspace to exercise a single package. Run the unfiltered form only for final verification before delivering a change, and for commands that are repo-wide by nature.

See `docs/tooling.md` for the full command surface, selector rules, and options.

## Workflow

`CONTRIBUTING.md` governs how a change lands, and it binds agents exactly as it binds people. In short:

- Work on a branch named `<type>/<slug>`. Never commit to `main` without being asked to, for that commit, in the moment.
- Write Conventional Commits, one intent per commit.
- Co-author the model that wrote the change, not the harness it ran in: `Co-authored-by: Claude Opus 5 <noreply@anthropic.com>`.
- Run `pnpm verify --changed` before opening a pull request.
- Ask before pushing a branch or opening a pull request. Both are outward-facing, and neither is yours to start.

Read `CONTRIBUTING.md` before your first commit in a session. The summary above is a reminder for an agent that has already read it, not a substitute.

## Change rules

- Prefer small, targeted changes.
- Do not refactor outside the requested scope.
- Update docs in the same change when behavior, public APIs, package exports, conventions, or lifecycle rules change.
- Follow `docs/code-guidelines.md` for code style, architecture, TypeScript, testing, and source documentation requirements.
- Follow `docs/tooling.md` when changing root scripts, package scripts, or repository tooling.
- Follow `docs/ci.md` when changing the workflows, the pinned toolchain, or anything CI runs.
- Follow `docs/docs-guidelines.md` when creating, updating, interpreting, or making exceptions to durable documentation.
- Follow `docs/specs/packages-documentation.md` for package consumer and maintainer documentation.
- Follow `docs/specs/tests.md` when adding or changing tests, test config, or coverage.
- Follow `docs/specs/errors.md` when a package exposes errors to consumers.
- Follow `docs/specs/packages-development.md` when adding a package playground, dev, or debug workflow.
- Follow `docs/specs/roadmaps.md` when writing a roadmap; `docs/roadmap.md` is the repository-level one.
- Follow `docs/assets.md` when changing anything under root `assets/`.
- Keep package README files and public docs aligned with `package.json` `exports`.
- Do not add dependencies unless simple in-house code is worse.
- Record an exception in `docs/specs/packages-exceptions.md` rather than weakening a rule; a `pnpm check` finding is waived only from that register.
- Do not commit secrets, build artifacts, or unrelated changes.

## Public packages

For `private: false` workspace packages:

- Follow `docs/specs/packages-lifecycle.md`.
- Follow `docs/specs/packages-documentation.md`.
- Keep `README.md` compliant with `docs/specs/packages-readme.md`.
- Document breaking changes in README, public docs, and LLM files.
- Keep public exports explicit and documented.
- Add or update JSDoc/TSDoc for every public symbol exposed through package `exports`; source docs and public package docs must describe the same consumer-facing behavior.
