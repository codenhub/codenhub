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

| Path                                                        | Owner                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| `{DEMO_BASE_URL}/`                                          | the aggregator's own shell: its index page, `robots.txt`, `sitemap.xml`     |
| `{DEMO_BASE_URL}/favicon.ico`, `{DEMO_BASE_URL}/assets/...` | `codenhub.assets` entries placed at build time, see "Assets boundary" below |
| `{DEMO_BASE_URL}/demo/<package>/`                           | that package's own `demo/` build output, mounted verbatim                   |

`robots.txt` and `sitemap.xml` belong to the aggregator's own root, not to
any individual package demo, because the aggregator is the only place that
knows the full set of mounted `/demo/<package>/` paths a sitemap needs to
list.

## Assets boundary

`assets/` (`docs/assets.md`) is Coden brand identity: logos, favicons,
fonts. It only catalogs what each file is and how it is meant to be used —
it says nothing about where a consumer places it, because a web app, a
demo, and a future non-web consumer each have their own placement
conventions.

A package that needs one or more of these files declares exactly which
ones, and exactly where, in its own `package.json`:

```json
"codenhub": {
  "assets": [
    { "from": "favicon/favicon.ico", "to": "public/favicon.ico" },
    { "from": "logo/logo-dark.svg", "to": "public/assets/logo/logo-dark.svg" }
  ]
}
```

`from` is a path relative to root `assets/`; `to` is relative to the
package's own directory and is entirely that package's decision — `hub`
never assumes or derives it. `pnpm hub assets` (`docs/tooling.md`) is the
one shared implementation every consumer reuses: it copies each declared
`from` to its `to`, and removes a destination once its entry is dropped, so
a consumer only ever ships the specific files it actually references rather
than a verbatim copy of the whole `assets/` tree. `hub check` validates
that every declared `from` still exists. `assets/` stays the only place the
files are committed; `codenhub.assets` destinations are build output and
stay out of git.

A package's own `demo/public/` is for content specific to that one demo and
nothing else: a fixture, a sample image the demo needs to illustrate the
package's own behavior. The test is whether deleting that demo would leave
another surface wanting the file — if so, it belongs in `assets/`, not in
that demo's `public/`.

Placing `favicon.ico` at a deployed surface's own serving root (`to:
"public/favicon.ico"` for an Astro or Vite app) is what every consumer in
this repository does for the default favicon: browsers probe `/favicon.ico`
at the origin root by default, so no page needs a `<link rel="icon">` for
it. A page only declares one explicitly when it needs a specific
non-default size from `assets/favicon/`.
