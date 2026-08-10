---
status: APPROVED
last_updated: 2026-08-10
scope: repo-wide package progress tracking
---

# Roadmap

## Purpose

Track high-level progress and milestone status for foundation and utility packages.

## Current focus

### @codenhub/styles

- [x] Core CSS design tokens & Tailwind v4 integration
- [x] Base component classes (`button`, `form`, `surface`, `feedback`, `loader`)
- [x] Use `@codenhub/icons` for basic icons after the helper is ready
- [x] Cascading presentation tokens: `out`, `soft`, `ghost`, and `flat` set inherited appearance tokens that every component reads, so a container sets the look of its subtree and any element can still override it

### @codenhub/docs

- [ ] Polish UI/UX and code in general
- [x] Add fuzzy search

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
- [ ] Documentation MCP server

### @codenhub/styles

- [ ] Aesthetic themes (glassmorphism, brutalism, glitch...) layered on the cascading presentation tokens

### @codenhub/docs

- [ ] Localize the site and package documentation with `@codenhub/i18n`

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

- `docs/ci.md` is the entrypoint for the pinned toolchain and what runs on a pull
  request. Delivery work below builds on it rather than adding a second workflow model.
- The documentation site deploys from the Cloudflare dashboard, connected to this
  repository. `apps/docs/wrangler.jsonc` describes what to serve, and everything
  else about the deployment lives in the dashboard. That split is deliberate: the
  repository carries build configuration, not delivery plumbing, so there is no
  deploy workflow and no deployment credentials here.
- That config declares no `main`, because the site is static and the Worker serves
  its assets without running a script. `html_handling` is explicit so the
  directory-style routes Astro builds resolve with or without a trailing slash,
  and `not_found_handling` serves the built 404 page rather than rewriting an
  unknown path to a shell the site does not have. `pnpm hub preview docs` runs the
  same config locally through `wrangler dev`, which is why `compatibility_date`
  tracks a date the installed runtime supports rather than the current one.
- Unlisted packages (`router`, `store`, `theme`, `plugins`, `ui-kit`) are currently internal, WIP, deprecated, or evaluated separately.
- Continuous delivery is deferred until package adoption justifies it. `hub release` already
  covers the publish preflight, and trusted publishing only pays off once publishing runs from
  CI rather than from a maintainer's machine.
- `docs/specs/packages-lifecycle.md` keeps `npm publish` a human action. Delivery work must stay
  compatible with that: a maintainer-triggered workflow, never publish-on-merge.
