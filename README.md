# CodenHub

Shared packages, apps, and project standards for and by [coden.agency](https://coden.agency).

## Packages

### Applications

- `apps/debug`: Private local debug workspace to run, test, and verify packages in integration.

### Libraries & Primitives

- `packages/error`: Typed error normalization, result helpers, and opt-in registry presets for TypeScript apps.
- `packages/kbd`: Page-wide and target-scoped keyboard shortcut event binding registry.
- `packages/router`: Small browser router with DOM page helpers for TypeScript apps.
- `packages/store`: Typed localStorage-backed state stores for browser TypeScript apps.
- `packages/styles`: CSS-only design tokens, base styles, and composable UI helper classes.
- `packages/theme`: Zero-dependency browser theme preference helper for TypeScript apps.
- `packages/ui-kit`: UI scripts (feedback, i18n, theme, toast notifications) and styles built on primitive packages.
- `packages/validation`: Zero-dependency validation and primitive coercion helpers for TypeScript apps.

### Plugins

- `packages/plugins/vite/add-loader`: Vite plugin that injects a full-screen page-loader overlay into every HTML entry point.
- `packages/plugins/vite/defer-css`: Vite plugin that defers loading of CSS stylesheets to prevent render blocking.
- `packages/plugins/vite/icons`: Vite plugin that replaces inline SVG icons at build time.

## Commands

Use pnpm from the repository root. Run workspace-wide commands with no package filter:

```sh
pnpm build
pnpm format:check
pnpm format:fix
pnpm lint:check
pnpm lint:fix
pnpm test
pnpm typecheck
```

Format and lint scripts accept an optional root-relative path:

```sh
pnpm format:check
pnpm format:check packages/error
pnpm lint:fix packages/error/src
```

When working on one package, run package scripts with `--filter` from the repository root. Use the directory name under `packages/` as the filter value:

```sh
pnpm --filter=error build
pnpm --filter=styles test
pnpm --filter=theme typecheck
```

Before publishing or merging package behavior changes, run at least:

```sh
pnpm format:check
pnpm lint:check
pnpm typecheck
pnpm test
```

## Documentation

This repository is docs-first: durable decisions live in `docs/` and code should follow approved documentation. Package-specific documentation live in `packages/<package-name>/docs/` .

Read these before changing package behavior, public APIs, or project conventions:

- `docs/docs-guidelines.md`: documentation structure, status model, and exception rules.
- `docs/code-guidelines.md`: coding conventions and enforceable quality rules.
- `docs/specs/packages-readme.md`: README requirements for public packages.
- `docs/specs/packages-lifecycle.md`: package metadata, scripts, exports, build, publish, and versioning rules.

Every `private: false` package under `packages/*` MUST comply to `docs/specs/packages-lifecycle.md` and MUST have a `README.md` that follows `docs/specs/packages-readme.md`.
