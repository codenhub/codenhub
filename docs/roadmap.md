---
status: DRAFT
last_updated: 2026-08-03
scope: repo-wide package progress tracking
---

# Roadmap

## Purpose
Track high-level progress and milestone status for foundation and utility packages.

## Current focus

### @codenhub/styles
- [x] Core CSS design tokens & Tailwind v4 integration
- [x] Base component classes (`button`, `form`, `surface`, `feedback`, `loader`)
- [ ] Aesthetic themes (glassmorphism, brutalism, glitch)

### @codenhub/icons
- [x] Icon registry, SVG scanner module & CSS mask generator
- [x] PostCSS & Vite build plugins (`/postcss`, `/vite`)
- [ ] Dynamic icon bundle optimization

### @codenhub/i18n
- [x] Runtime-neutral translation core
- [x] Browser & locale-path routing subpath exports (`/browser`, `/routing`)
- [ ] Pluralization & ICU formatting extensions

### @codenhub/toast
- [x] Instance-based toast & native dialog manager
- [x] Playwright integration tests & default stylesheet (`/styles`)
- [ ] Toast stacking / position container controls
- [ ] Custom animation presets

### @codenhub/validation
- [x] Zero-dependency primitive coercion & validation helpers
- [ ] Form schema validation adapters
- [ ] Custom validator pipeline extensions

### @codenhub/skills
- [x] AI agent skills collection & `codenhub-skills` CLI installer
- [ ] npm publishing validation & clean machine `npx`/`pnpm dlx` setup
- [ ] Additional core skill templates

---

## Planned

### @codenhub/kbd
- [x] Global & target-scoped keyboard shortcut registry
- [ ] Key combo recording / remapping helper

### @codenhub/error
- [x] Typed error normalization & result helpers (`Result<T, E>`)
- [x] Registries (`/registries`, `/registries/browser`, `/registries/supabase`)
- [ ] Framework error boundary adapters

### @codenhub/components
- [x] Native Web Component wrapper core & framework adapters (`/react`, `/svelte`, `/astro`)
- [ ] Property/event declaration API stabilization
- [ ] Expanded web component UI library

### Future / New Packages
- `@codenhub/a11y`: Focus management, ARIA primitives, accessibility utilities
- `@codenhub/ui`: High-level UI layout & composite primitives

---

## Notes & exclusions
- Unlisted packages (`router`, `store`, `theme`, `plugins`, `ui-kit`) are currently internal, WIP, deprecated, or evaluated separately.
