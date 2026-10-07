# CodenHub

Shared packages, apps, and project standards for and by [coden.agency](https://coden.agency).

## Packages

<!-- generated: packages start -->

### Applications

- `apps/demo`: Deployed app aggregating every package's demo/ output into one surface.
- `apps/docs`: Documentation site that publishes every package README, public docs, and assets.
- `apps/www`: Site index for CodenHub: the package list and the entry point to docs, demos, and source.

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
- `packages/toaster`: Instance-based browser toast and native dialog manager with accessible semantic, loading, and custom notifications.
- `packages/ui-kit`: Browser UI utilities for feedback, internationalization, themes, toasts, and global styles.
- `packages/validation`: Zero-dependency validation of untrusted input for TypeScript: formats that return what a parser read, a bounded cost for input that fails, issues that never hold a value of the input, and tree-shakable validators.

### Tooling

- `packages/app-shell`: Shared chrome, theme handling, and SEO helpers for the CodenHub deploy surfaces.
- `packages/tools`: Workspace-aware repository tooling behind the root pnpm scripts.

### Plugins

- `packages/plugins/tauri/webview`: TypeScript plugin for spawning and controlling Tauri v2 WebViews.
- `packages/plugins/tauri/window`: TypeScript plugin for controlling Tauri v2 window state, chrome, and placement.
- `packages/plugins/vite/add-loader`: Vite plugin that injects a full-screen page-loader overlay into every HTML entry point.
- `packages/plugins/vite/defer-css`: Vite plugin that defers loading of CSS stylesheets to prevent render blocking.
- `packages/plugins/vite/icons`: Vite plugin that replaces inline SVG icons at build time.

<!-- generated: packages end -->

## Repository

A pnpm workspace of packages, applications, and shared project standards:

- `packages/`: libraries and primitives, including framework plugins under `packages/plugins/` and the `hub` CLI under `packages/tools/`.
- `apps/`: the documentation site, package demo aggregator, and site index.
- `docs/`: repository-wide technical contracts, guidelines, and references.
- `assets/`: shared fonts, logos, and icons.
- Each package's `README.md` and `docs/`: consumer documentation and package-local maintainer knowledge.

## Tooling

Root pnpm scripts use `hub`, the workspace-aware CLI in `@codenhub/tools`. It provides building, formatting, linting, type checking, unit and browser testing, compliance checks, and documentation generation. Commands accept package names, workspace directories, paths, globs, and changed-package selections.

`pnpm hub --help` describes the command surface, and `pnpm packages` lists workspace packages. [Repository tooling](docs/tooling.md) documents selectors, options, execution, and reporting. The toolchain versions are declared in `.nvmrc` and `package.json`.

## Documentation

- [Contributing](CONTRIBUTING.md): setup, contributor workflow, validation, branches, commits, and releases.
- [Agent instructions](AGENTS.md): agent behavior, communication, and context discipline.
- [Repository documentation](docs/README.md): the map of technical guidelines, specifications, and repository references.
