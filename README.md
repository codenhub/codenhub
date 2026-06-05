# CodenHub

Shared packages, apps, and project standards for CodenHub.

This repository is docs-first: durable decisions live in `.docs/` and code should follow approved documentation.

## Workspace

- `packages/helpers`: TypeScript helpers for errors, validation, and result-style control flow.
- `packages/theme`: browser theme preference helper.
- `packages/ui-kit`: UI scripts and styles.
- `packages/vite-plugins`: Vite plugins.
- `apps/debug`: local debug workspace.

## Commands

Use pnpm from the repository root:

```sh
pnpm build
pnpm format:check
pnpm format:fix
pnpm lint:check
pnpm lint:fix
pnpm test
pnpm typecheck
```

Before publishing or merging package behavior changes, run at least:

```sh
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm test
```

## Documentation

Read these before changing package behavior, public APIs, or project conventions:

- `.docs/docs-guidelines.md`: documentation structure, status model, and exception rules.
- `.docs/code-guidelines.md`: coding conventions and enforceable quality rules.
- `.docs/specs/packages-readme.md`: README requirements for public packages.
- `.docs/specs/packages-lifecycle.md`: package metadata, scripts, exports, build, publish, and versioning rules.

### Packages

Every `private: false` package under `packages/*` MUST have a `README.md` that follows `.docs/specs/packages-readme.md`.

Package READMEs should document public usage, supported imports, examples, runtime requirements, and limitations. Internal implementation notes belong in code comments only when local context is needed, or in package-level `.docs/` when durable package knowledge is needed.
