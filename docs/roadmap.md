---
status: APPROVED
last_updated: 2026-08-07
scope: repo-wide package progress tracking
---

# Roadmap

## Purpose

Track high-level progress and milestone status for foundation and utility packages.

## Current focus

### @codenhub

- [x] Enable collocated demo app for each package
- [x] Workspace-aware root scripts with flexible targets (`docs/tooling.md`)
- [x] `hub check`: package lifecycle and documentation compliance
- [x] `hub generate`: `llms-full.txt` and root README package list
- [x] Share the `apps/docs` documentation model with `hub`
- [x] Organize dependencies, remove unused, ensure all packages are self-contained
- [x] `hub verify`, `hub clean`, `hub new`, `hub release`, and a pre-commit hook
- [ ] Pin the workspace toolchain so local and CI runs resolve the same Node and pnpm
- [ ] Separate unit and browser test scripts, with a managed Playwright browser install
- [ ] Repo-wide CI on pull requests: `pnpm verify --changed` and a generated-file drift gate
- [ ] Ship license files for every public package and the repository root

### @codenhub/docs

- [ ] Polish UI/UX and code in general
- [ ] Add fuzzy search

### @codenhub/styles

- [x] Core CSS design tokens & Tailwind v4 integration
- [x] Base component classes (`button`, `form`, `surface`, `feedback`, `loader`)
- [x] Use `@codenhub/icons` for basic icons after the helper is ready
- [ ] Aesthetic themes (glassmorphism, brutalism, glitch...) + refactor/improve semantics(flat, soft, ghost, outline...)

### @codenhub/icons

- [x] Icon registry, SVG scanner module & CSS mask generator
- [x] PostCSS & Vite build plugins (`/postcss`, `/vite`)
- [x] Add simple mask-image helper for maximum compatibility with other packages
- [ ] Playground and demo polish
- [ ] Registry improvement and stabilization
- [ ] Registry population
- [ ] Dynamic icon bundle optimization

### @codenhub/i18n

- [x] Runtime-neutral translation core
- [x] Browser & locale-path routing subpath exports (`/browser`, `/routing`)
- [ ] Pluralization & ICU formatting extensions

### @codenhub/toast

- [x] Instance-based toast & native dialog manager
- [x] Playwright integration tests & default stylesheet (`/styles`)
- [ ] Toast stacking / position container controls
- [ ] Better interactions and animations (shadcn-like)

### @codenhub/validation

- [x] Zero-dependency primitive coercion & validation helpers
- [ ] Form schema validation adapters
- [ ] Custom validator pipeline extensions

### @codenhub/skills

- [x] AI agent skills collection & `codenhub-skills` CLI installer
- [ ] npm publishing validation & clean machine `npx`/`pnpm dlx` setup
- [ ] Additional core skill templates

## Planned

### @codenhub

- [ ] Publish public packages from CI with npm trusted publishing (OIDC) and provenance
- [ ] Versioning and changelog workflow, weighing Changesets against `hub release`
- [ ] Deploy `apps/docs` to Cloudflare Pages with pull-request previews
- [ ] Documentation MCP server

### @codenhub/kbd

- [x] Global & target-scoped keyboard shortcut registry
- [ ] Better playground using internal packages
- [ ] Key combo recording / remapping helper

### @codenhub/error

- [x] Typed error normalization & result helpers (`Result<T>`)
- [x] Registries (`/registries`, `/registries/browser`, `/registries/supabase`)
- [ ] Ship canonical translation map for built-in registry message keys
- [ ] Better playground using internal packages
- [ ] Framework error boundary adapters

### @codenhub/components

- [x] Native Web Component wrapper core & framework adapters (`/react`, `/svelte`, `/astro`)
- [ ] Property/event declaration API stabilization
- [ ] Expanded web component UI library

### Future / New Packages

- `@codenhub/a11y`: Focus management, ARIA primitives, accessibility utilities
- `@codenhub/ui`: High-level UI layout & composite primitives

## Notes & exclusions

- Unlisted packages (`router`, `store`, `theme`, `plugins`, `ui-kit`) are currently internal, WIP, deprecated, or evaluated separately.
- Continuous delivery is deferred until package adoption justifies it. `hub release` already
  covers the publish preflight, and trusted publishing only pays off once publishing runs from
  CI rather than from a maintainer's machine.
- `docs/specs/packages-lifecycle.md` keeps `npm publish` a human action. Delivery work must stay
  compatible with that: a maintainer-triggered workflow, never publish-on-merge.
