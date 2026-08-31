---
status: APPROVED
last_updated: 2026-08-30
scope: repo-wide package progress tracking
---

# Roadmap

## Purpose

Track high-level progress and milestone status for foundation and utility packages.

## Current focus

### @codenhub/styles

- [x] Three-axis styling model: intent, presentation, and aesthetic
- [x] Machine-checked contract in `registry.json`, enforced by the test suite
- [x] Shipped aesthetics: `.neobrutalism`, `.glass`, `.pixel`, `.chunky-tile`
- [x] Consumer-focused reformulation of the public documentation
- [ ] `0.1.0` release

`packages/styles/docs/internal/roadmap.md` owns the release conditions and the
deferred work; this entry tracks only where the package sits.

### @codenhub/docs

- [ ] Polish UI/UX and code in general
- [x] Add fuzzy search

### @codenhub/icons

- [x] Icon registry, SVG scanner module & CSS mask generator
- [x] PostCSS & Vite build plugins (`/postcss`, `/vite`)
- [x] Add simple mask-image helper for maximum compatibility with other packages
- [x] Registry improvement and stabilization
- [x] Registry population
- [x] Dynamic icon bundle optimization
- [x] Add a `style` (or `default`) export condition to `exports["."]` so
      `@import "@codenhub/icons"` resolves inside `@tailwindcss/vite`. Ships a
      static `dist/style.css` with the base `.ic` rules for pipelines that
      resolve the import themselves (`@tailwindcss/vite`, a plain `<link>`); the
      Vite and PostCSS plugins still replace the import with the full scanned
      set when they are present.
- [ ] Playground and demo polish
- [ ] Searchable icon catalog in the documentation site
- [ ] First-party family owning the semantic names

### @codenhub/i18n

- [x] Runtime-neutral translation core
- [x] Browser & locale-path routing subpath exports (`/browser`, `/routing`)
- [ ] Pluralization & ICU formatting extensions

### @codenhub/toaster

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
- [x] Firefox browser-suite slowness, found and fixed. It was not the engine
      and not the dev server: Playwright builds a browser context per test, and
      a fresh context cost Firefox about 2.6s against Chromium’s 0.3s. Sharing
      one context per worker took `packages/styles` from 285s to 84s on
      Firefox, 57s to 44s on Chromium, and 75s to 71s on WebKit. The convention
      is in `docs/specs/tests.md`; `packages/router`, `packages/theme`, and
      `packages/toaster` still use per-test contexts and were left alone, the
      theme suite deliberately so, since it persists preferences itself.

### @codenhub/demo

- [x] `apps/demo` shell and build pipeline aggregating every package's
      `demo/` output into `dist/demo/<package>/` — general contract in
      `docs/specs/packages-demo.md`, this app's own architecture in
      `apps/demo/docs/internal/architecture.md`
- [ ] Second Cloudflare Workers Builds project, connected from the dashboard
      like `apps/docs`'s, with its own watch-path excludes, so the app above
      is actually deployed
- [x] Migrate `apps/docs` and `packages/icons/demo` off hand-duplicated
      `favicon.ico`/`logo-*.svg` onto the shared `assets/` build-time copy
      step `docs/specs/packages-demo.md` defines

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
- `@codenhub/styles` will be the first package to publish under the delivery work
  listed above, and none of it is in place yet: `0.1.0` goes out as a manual
  `npm publish` from a maintainer's machine, which `docs/specs/packages-lifecycle.md`
  allows and which the trusted-publishing item is meant to replace.
- Continuous delivery is deferred until package adoption justifies it. `hub release` already
  covers the publish preflight, and trusted publishing only pays off once publishing runs from
  CI rather than from a maintainer's machine.
- `docs/specs/packages-lifecycle.md` keeps `npm publish` a human action. Delivery work must stay
  compatible with that: a maintainer-triggered workflow, never publish-on-merge.
