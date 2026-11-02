---
status: DRAFT
last_updated: 2026-11-01
scope: `@codenhub/toaster` direction.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/toaster`. The repo-wide roadmap is `docs/roadmap.md`.

## Current Focus

- **A size budget**, stated as what a minimal use such as `toast("…")` may cost gzipped. `size.json` now records each export alone and the bundle's bytes by source file (`docs/specs/packages-lifecycle.md`, "Bundle size"), and the build writes a hidden source map so that breakdown reaches `src`; both appear from the first release cut after 0.3.0.

## Planned

- **Dialogs that toast-only consumers do not pay for.** Dialogs reach every consumer through `toast.dialog`, so a bundler cannot drop them. Moving them to their own export or subpath is a breaking change to `toast.dialog` and to the `dialog` export from `.`.
- **A trimmed toast core.** The toast lifecycle and DOM code carry most of the weight. Audit which parts earn their bytes against the budget: FLIP stack animation, runtime token style injection, the HTML sanitizer, and the many argument forms.
- **Stacking and position controls** for the container.
- **Richer interactions and animation.**

## Later / Possible

- **A composable API**, standalone functions or opt-in features, so a consumer bundles only the toast kinds it calls. This is a breaking redesign, worth it only if the budget cannot be met by moving dialogs and trimming the core.

## Notes

- Measured on 2026-11-01 at 0.3.0, from `dist` with esbuild, minified and gzipped at level 9: a bare import bundles to nothing, so the side-effect declarations work; `createToaster`, `toast("hi")`, and `toast.success("hi")` each cost the whole entrypoint, about 47.0 KB minified and 12.8 KB gzipped. All toast kinds are methods of one manager object, which tree shaking cannot split. By source file, minified: `toast-base` 12.4 KB, `dom` 9.4 KB, `core` 7.6 KB, the four `modal*` files 7.3 KB together, `options` 4.6 KB, `tokens` 2.6 KB, `toast-helpers` 1.8 KB, `announcer` 1.2 KB. The stylesheet adds about 3.8 KB gzipped.
