# CodenHub

Shared packages, apps, and project standards for and by [coden.agency](https://coden.agency).

## Packages

<!-- generated: packages start -->

### Applications

- `apps/debug`: Private local debug workspace to run, test, and verify packages in integration.
- `apps/docs`: Documentation site that publishes every package README, public docs, and assets.

### Libraries & Primitives

- `packages/components`: Lightweight, native Web Components wrapper for fast-loading SPA UIs.
- `packages/error`: Typed error normalization, result helpers, and opt-in registry presets for TypeScript apps.
- `packages/i18n`: Runtime-neutral translations with optional browser and locale-path integrations.
- `packages/icons`: Icon registry, CSS mask generator, and scanner module for Codenhub icon system.
- `packages/kbd`: Page-wide and target-scoped keyboard shortcut event binding registry.
- `packages/router`: Small browser router for TypeScript apps.
- `packages/skills`: Curated collection of AI agent skills with a built-in installer.
- `packages/store`: Typed localStorage-backed state stores for browser TypeScript apps.
- `packages/styles`: CSS-only Codenhub design tokens, base styles, and composable UI helper classes.
- `packages/theme`: Zero-dependency browser theme preference helper for TypeScript apps.
- `packages/toast`: Instance-based browser toast and native dialog manager with accessible semantic, loading, and custom notifications.
- `packages/ui-kit`: Browser UI utilities for feedback, internationalization, themes, toasts, and global styles.
- `packages/validation`: Zero-dependency validation and primitive coercion helpers for TypeScript apps.

### Tooling

- `packages/tools`: Workspace-aware repository tooling behind the root pnpm scripts.

### Plugins

- `packages/plugins/tauri/webview`: TypeScript plugin for spawning and controlling Tauri v2 WebViews.
- `packages/plugins/tauri/window`: TypeScript plugin for controlling Tauri v2 window state, chrome, and placement.
- `packages/plugins/vite/add-loader`: Vite plugin that injects a full-screen page-loader overlay into every HTML entry point.
- `packages/plugins/vite/defer-css`: Vite plugin that defers loading of CSS stylesheets to prevent render blocking.
- `packages/plugins/vite/icons`: Vite plugin that replaces inline SVG icons at build time.

<!-- generated: packages end -->

## Commands

Use pnpm from the repository root. With no target, a command covers the whole workspace:

```sh
pnpm build
pnpm check
pnpm clean
pnpm format:check
pnpm format:fix
pnpm generate
pnpm lint:check
pnpm lint:fix
pnpm test
pnpm typecheck
pnpm verify
```

`pnpm check` reports packages against the lifecycle and documentation specs, and
`pnpm generate` rewrites the files derived from them, such as each package's
`llms-full.txt` and the package list above.

Every command accepts the same targets: a package name, a workspace directory, a path, or a glob. Pass one to work on a single package from the root; omitting it covers the whole workspace and is meant for final verification.

```sh
pnpm test error
pnpm test packages/error/src/bucket.test.ts
pnpm test "packages/*/src/**/*.test.ts"
pnpm typecheck packages/plugins/vite/icons
pnpm lint:fix packages/error/src
pnpm test --changed
```

Unrecognized flags reach the underlying tool, so `pnpm test error --reporter=verbose` works. Run `pnpm hub --help` for the full surface, or `pnpm packages` to see what a target resolves to.

Before publishing or merging package behavior changes, run `pnpm verify`. It runs
formatting, linting, type checking, tests, and compliance checks in that order and
stops at the first failure, so a whole branch is one command:

```sh
pnpm verify
pnpm verify error
pnpm verify --changed
```

## Documentation

This repository is docs-first: durable decisions live in `docs/` and code should
follow approved documentation. Package-specific documentation lives with each
workspace package.

Read these before changing package behavior, public APIs, or project conventions:

- `docs/docs-guidelines.md`: repository documentation structure, status model,
  and exception rules.
- `docs/tooling.md`: root scripts, the `hub` CLI, and package script rules.
- `docs/code-guidelines.md`: coding conventions and enforceable quality rules.
- `docs/specs/packages-development.md`: optional package-local playground, dev, and debug workflow for real usage scenarios.
- `docs/specs/packages-documentation.md`: public and internal package
  documentation requirements.
- `docs/specs/packages-exceptions.md`: package-specific exception register.
- `docs/specs/packages-readme.md`: README requirements for public packages.
- `docs/specs/packages-lifecycle.md`: package metadata, scripts, exports, build, publish, and versioning rules.

Every `private: false` workspace package MUST follow
`docs/specs/packages-lifecycle.md`, `docs/specs/packages-documentation.md`, and
`docs/specs/packages-readme.md`.
