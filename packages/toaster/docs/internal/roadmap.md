---
status: DRAFT
last_updated: 2026-11-02
scope: `@codenhub/toaster` direction.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/toaster`. The repo-wide roadmap is `docs/roadmap.md`.

## Size budget

A bundle that calls only `toast("…")` may cost at most **9.5 KB gzipped** (9,500 bytes). `tests/integration/tree-shaking.test.ts` enforces the ceiling on every test run, bundling with tsdown and gzipping at Node's default level, which lands within 1% of the `toast` export in `size.json`. It measured 9,086 bytes on 2026-11-02.

- **Why 9.5 KB**: it was the target while the core was trimmed from 10.9 KB, and the trims reached it without giving up behavior the package keeps. The ceiling sits at the target rather than at the measured size so that a fix or small feature does not need a budget change; it stops a regression of more than about 400 bytes.
- **Why not 8 KB**: the first target, about 8 KB, did not weigh what reaching it takes. Measured against the remaining options on 2026-11-02, getting to 8 KB also needed dropping focus restoration on dismiss and the auto-dismiss pause in background tabs, accessibility and behavior the package keeps.
- **Why a test, not the publish check**: `hub publish` compares `size.json` with a fresh measurement but has no limits, and a per-package limit there would be new tooling surface. A test fails where the regression is made, not at release.

## Later / Possible

- **Stacking and position controls** for the container. An idea from use, with no design yet; deferred until a consumer needs it.
- **Richer interactions and animation.** Same: no design yet, and no current need.
- **A composable API**, standalone functions or opt-in features, so a consumer bundles only the toast kinds it calls. This is a breaking redesign, worth it only if the budget stops being reachable by trimming the core.

## Not Planned

- **A single argument form** (only `toast(message, options)` or only `toast(options)`). Estimated to save about 150 gzipped bytes, which the budget no longer needs. Both forms are what consumers of toast libraries expect: the string form for the common case, and the object form for toasts built from data or carrying a title without a message. Removing either breaks every caller who uses it for no gain they would notice.

## Notes

- Measured on 2026-11-01 at 0.3.0, from `dist` with esbuild, minified and gzipped at level 9: a bare import bundles to nothing, so the side-effect declarations work; `createToaster`, `toast("hi")`, and `toast.success("hi")` each cost the whole entrypoint, about 47.0 KB minified and 12.8 KB gzipped. All toast kinds are methods of one manager object, which tree shaking cannot split. By source file, minified: `toast-base` 12.4 KB, `dom` 9.4 KB, `core` 7.6 KB, the four `modal*` files 7.3 KB together, `options` 4.6 KB, `tokens` 2.6 KB, `toast-helpers` 1.8 KB, `announcer` 1.2 KB. The stylesheet adds about 3.8 KB gzipped.
- Measured on 2026-11-02, after dialogs moved to `@codenhub/toaster/dialog`, from `dist` with tsdown, minified and gzipped at the default level: `toast("hi")` 40.2 KB and 10.9 KB, `createToaster()` the same, `dialog.confirm("x")` alone 12.0 KB and 4.2 KB, and both together 49.1 KB and 13.4 KB.
- Measured on 2026-11-02, after a trim that changed no behavior (shared factory paths, token property names computed from their keys, shared icon and DOM-part builders, removed dead code), with the repo's rolldown measurement: the `toast` export 35.2 KB minified and 10.4 KB gzipped, down from 40.2 KB and 10.9 KB. Trims that keep behavior are mostly spent. The rest of the way to the target is behavior or API changes, estimated in gzipped bytes: shorter error messages (~300–400), removing the FLIP stack shift (~250), a single argument form (~150), no focus restoration on dismiss (~120), and no auto-dismiss pause in background tabs (~100).
- Measured on 2026-11-02, with the repo's rolldown measurement, after string custom content became plain text (no HTML sanitizer) and then the runtime `tokens` and `nonce` options were dropped for plain `--toast-color-*` CSS custom properties: the `toast` export 33.8 KB minified and 9.9 KB gzipped after the first, and 31.1 KB and 9.05 KB after both, down from 35.2 KB and 10.4 KB; the `dialog` export 8.9 KB and 3.3 KB, down from 11.1 KB and 4.1 KB. The sanitizer removal saved about 450 gzipped bytes, as estimated; the token removal about 870, against an estimate of 450–500.
