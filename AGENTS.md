# Agent instructions

This repository is docs-first. Before making non-trivial changes, read the relevant source-of-truth documents in `.docs/`.

## Priority

Follow instructions in this order:

1. User request.
2. `AGENTS.md` and `CLAUDE.md`.
3. APPROVED or IMPLEMENTED documents in `.docs/`.
4. Existing code.

If APPROVED or IMPLEMENTED docs conflict with code, treat code as legacy unless the doc is clearly outdated.

## Commands

Run relevant checks after changes:

```sh
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm test
```

Use package-level commands when a full workspace check is unnecessary, but full workspace checks are preferred before final delivery when practical.

## Change rules

- Prefer small, targeted changes.
- Do not refactor outside the requested scope.
- Update docs in the same change when behavior, public APIs, package exports, conventions, or lifecycle rules change.
- Keep package README files aligned with `package.json` `exports`.
- Do not add dependencies unless simple in-house code is worse.
- Do not commit secrets, build artifacts, or unrelated changes.

## Public packages

For `private: false` packages under `packages/*`:

- Follow `.docs/specs/packages-lifecycle.md`.
- Keep `README.md` compliant with `.docs/specs/packages-readme.md`.
- Document breaking changes in README and relevant `.docs/` files.
- Keep public exports explicit and documented.
