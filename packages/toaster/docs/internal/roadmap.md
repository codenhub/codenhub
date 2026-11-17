---
status: DRAFT
last_updated: 2026-11-16
scope: `@codenhub/toaster` direction.
---

# Roadmap

## Purpose

Durable direction for `@codenhub/toaster`. The repo-wide roadmap is `docs/roadmap.md`.

## Size budget

A bundle that calls only `toast("…")` may cost at most **9.5 KB gzipped** (9,500 bytes). `tests/integration/tree-shaking.test.ts` enforces the ceiling on every test run, bundling with tsdown and gzipping at Node's default level, which lands within 1% of the `toast` export in `size.json`.

- **Why 9.5 KB**: it is reachable by trimming the core without giving up behavior the package keeps. The ceiling sits at the target rather than at the measured size so that a fix or small feature does not need a budget change; it stops a regression of more than about 400 bytes.
- **Why not 8 KB**: getting to about 8 KB also needs dropping focus restoration on dismiss and the auto-dismiss pause in background tabs, accessibility and behavior the package keeps.
- **Why a test, not the publish check**: `hub publish` compares `size.json` with a fresh measurement but has no limits, and a per-package limit there would be new tooling surface. A test fails where the regression is made, not at release.

## Later / Possible

- **Stacking and position controls** for the container. An idea from use, with no design yet; deferred until a consumer needs it.
- **Richer interactions and animation.** Same: no design yet, and no current need.
- **A composable API**, standalone functions or opt-in features, so a consumer bundles only the toast kinds it calls. This is a breaking redesign, worth it only if the budget stops being reachable by trimming the core.

## Not Planned

- **A single argument form** (only `toast(message, options)` or only `toast(options)`). Estimated to save about 150 gzipped bytes, which the budget does not need. Both forms are what consumers of toast libraries expect: the string form for the common case, and the object form for toasts built from data or carrying a title without a message. Removing either breaks every caller who uses it for no gain they would notice.

## Notes

- A bare import bundles to nothing, so the side-effect declarations work.
- Every toast kind is a method of one manager object, which tree shaking cannot split, so `createToaster`, `toast("hi")`, and `toast.success("hi")` each cost the whole `toast` entrypoint; `size.json` records how much.
- Trims that keep behavior are mostly spent. What remains is behavior or API changes, estimated in gzipped bytes: shorter error messages (~300–400), removing the FLIP stack shift (~250), a single argument form (~150), no focus restoration on dismiss (~120), and no auto-dismiss pause in background tabs (~100).
