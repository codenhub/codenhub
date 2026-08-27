---
status: APPROVED
last_updated: 2026-08-27
scope: General contract for package demos and the app that aggregates them into one deployed surface.
---

# Package demos

Some packages benefit from more than an npm publish and a local `demo/` — a
real deployed surface a consumer can open in a browser. This document defines
the general contract between a package's `demo/` and whatever aggregates
demos into one deployed app, and the assets convention any such app follows.

It does not describe a specific app's implementation. `apps/demo` is the
current aggregator; its own architecture belongs to it, not here — see
`apps/demo/docs/internal/architecture.md`.

## Why one shared aggregator

A dedicated app and Cloudflare project per package multiplies the delivery
plumbing `docs/roadmap.md` deliberately keeps out of this repository: one
dashboard project, one set of watch paths, and one build to reason about per
package instead of one for the whole workspace. `apps/docs` already proves
the pattern for documentation — it aggregates every package's docs into one
deployed site rather than one site per package — and a demo aggregator
follows the same shape.

## Per-package contract

`packages/*/demo` is the third directory role in
`docs/specs/packages-development.md`, alongside `playground`, `dev`, and
`debug`; that document owns what may live there and how it resolves the
package under inspection. An aggregator asks for exactly two things from each
one:

- a `build` script that emits static output to `dist/`
- a way to set a base path, so the built asset URLs resolve once mounted
  under a subpath instead of `/`

Nothing else is constrained. A package's `demo/` may use vanilla TypeScript
and Vite — the default, and what `packages/icons/demo` already does — or
Astro, or any other tool that satisfies those two things. An aggregator
treats each `dist/` as an opaque directory; it never inspects what produced
it.

## URL scheme

| Path                              | Owner                                                                   |
| --------------------------------- | ----------------------------------------------------------------------- |
| `{DEMO_BASE_URL}/`                | the aggregator's own shell: its index page, `robots.txt`, `sitemap.xml` |
| `{DEMO_BASE_URL}/assets/`         | copied once from repository root `assets/` at build time                |
| `{DEMO_BASE_URL}/demo/<package>/` | that package's own `demo/` build output, mounted verbatim               |

`robots.txt` and `sitemap.xml` belong to the aggregator's own root, not to
any individual package demo, because the aggregator is the only place that
knows the full set of mounted `/demo/<package>/` paths a sitemap needs to
list.

## Assets boundary

`assets/` (`docs/assets.md`) is Coden brand identity: logos, favicons,
fonts. Every deployed surface under `apps/` — not only a demo aggregator —
copies it into its own `dist/assets/` at build time rather than
hand-maintaining a duplicate. The copy still exists once per deployed
origin, since separate Cloudflare Workers on separate origins cannot share
bytes at runtime, but it stops existing once per package. `assets/` stays
the only place the files are committed.

A package's own `demo/public/` is for content specific to that one demo and
nothing else: a fixture, a sample image the demo needs to illustrate the
package's own behavior. The test is whether deleting that demo would leave
another surface wanting the file — if so, it belongs in `assets/`, not in
that demo's `public/`.

This also applies to `apps/docs`, which today hand-duplicates
`favicon.ico`/`logo-*.svg` under `apps/docs/public/` rather than building
them from `assets/`, and to `packages/icons/demo/public/`, which does the
same. Both are legacy under this rule and should migrate to the shared
build-time copy step; `docs/roadmap.md` tracks the migration.

A single `/assets/favicon.ico` is enough even though browsers also probe
`/favicon.ico` at the origin root by default: every page in this repository
declares `<link rel="icon" href="/assets/favicon.ico">` explicitly rather
than relying on the implicit root lookup, so no per-path favicon file is
ever needed.
