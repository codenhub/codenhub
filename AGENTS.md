# Agent instructions

This repository is docs-first. Before making non-trivial changes, read and follow the relevant source-of-truth documents in `docs/`, especially `docs/code-guidelines.md` and `docs/docs-guidelines.md`.

## Priority

Follow instructions in this order:

1. User request.
2. `AGENTS.md` and `CLAUDE.md`.
3. APPROVED or IMPLEMENTED documents in `docs/`.
4. Existing code.

If APPROVED or IMPLEMENTED docs conflict with code, treat code as legacy unless the doc is clearly outdated.

## Commands

Run relevant checks after changes from the repository root:

```sh
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm test
```

Every root script accepts the same targets: a package name, a workspace
directory, a path, a glob, or nothing to select the whole workspace.

```sh
pnpm test error
pnpm test packages/error/src/bucket.test.ts
pnpm typecheck packages/plugins/vite/icons
pnpm lint:fix packages/error/src
pnpm test --changed
```

Run scripts from the repository root. Do not change into a package directory, and
prefer these targets over `pnpm --filter`: filtering skips the build ordering that
package scripts no longer perform themselves.

Use narrow targets when a full workspace check is unnecessary, but full workspace
checks are preferred before final delivery when practical.

Package runs are killed after 600 seconds, so a hanging browser-test worker no
longer blocks a workspace run. Use `--timeout=<seconds>` or `--no-timeout` to
change that.

See `docs/tooling.md` for the full command surface, selector rules, and options.

## Change rules

- Prefer small, targeted changes.
- Do not refactor outside the requested scope.
- Update docs in the same change when behavior, public APIs, package exports, conventions, or lifecycle rules change.
- Follow `docs/code-guidelines.md` for code style, architecture, TypeScript, testing, and source documentation requirements.
- Follow `docs/tooling.md` when changing root scripts, package scripts, or repository tooling.
- Follow `docs/docs-guidelines.md` when creating, updating, interpreting, or making exceptions to durable documentation.
- Follow `docs/specs/packages-documentation.md` for package consumer and
  maintainer documentation.
- Keep package README files and public docs aligned with `package.json`
  `exports`.
- Do not add dependencies unless simple in-house code is worse.
- Do not commit secrets, build artifacts, or unrelated changes.

## Public packages

For `private: false` workspace packages:

- Follow `docs/specs/packages-lifecycle.md`.
- Follow `docs/specs/packages-documentation.md`.
- Keep `README.md` compliant with `docs/specs/packages-readme.md`.
- Document breaking changes in README, public docs, and LLM files.
- Keep public exports explicit and documented.
- Add or update JSDoc/TSDoc for every public symbol exposed through package
  `exports`; source docs and public package docs must describe the same
  consumer-facing behavior.
