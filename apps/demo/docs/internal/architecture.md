---
status: APPROVED
last_updated: 2026-08-27
scope: apps/demo's own architecture — this app's implementation of the contract in docs/specs/packages-demo.md.
---

# Architecture

Nothing in this document is implemented yet. `docs/roadmap.md` tracks it
under `@codenhub/demo`, and `docs/ci.md` names it in "Not covered yet" until
the Cloudflare project exists.

`apps/demo` is the current implementation of the demo aggregator described in
`docs/specs/packages-demo.md`. That document owns the general contract; this
one owns how this specific app satisfies it.

## Shell

`apps/demo` is an Astro app, matching `apps/docs` rather than introducing a
second meta-framework. Its own surface is small — an index linking to every
demo — so this is about reusing tooling already paid for in this repository,
not about needing Astro's features specifically. `@codenhub/components` is
not stable enough to build on yet, so the shell does not depend on it;
revisit this once that package settles.

## Build

At build time, `apps/demo`:

1. Discovers every `packages/*/demo/package.json` the same way
   `apps/docs/src/lib/catalog.ts` discovers package documentation, so a new
   package's demo is picked up without changing `apps/demo` itself.
2. Depends on each discovered demo as `workspace:*`, so `hub`'s
   dependency-level build ordering (`docs/tooling.md`, "Execution order")
   builds every demo, and the package it demonstrates, before `apps/demo`
   builds.
3. Copies each demo's `dist/` into `apps/demo/dist/demo/<package>/` and
   generates the index page linking to them.

## CI and deployment

Pull request verification needs no new configuration: `packages/*/demo` is
already a `pnpm-workspace.yaml` glob, so `--changed` already covers it, and
`apps/demo` will be too once it exists.

Deployment is a second Cloudflare Workers Builds project, connected to the
repository from the dashboard exactly like `apps/docs`'s, with its own
`apps/demo/wrangler.jsonc`. `docs/ci.md` explains why that split keeps
delivery plumbing out of the repository; the same reasoning applies here.

Its build watch-path excludes are the inverse of `apps/docs`'s list in
`docs/ci.md`: `packages/*/demo/*` moves from excluded to the thing that
should trigger a build, and `apps/docs/*` is added to the exclude list,
since a docs-only change should not rebuild the demo Worker. Everything
else — `docs/*`, `apps/debug/*`, repository governance files, lint/format
configs — stays excluded for the same reasons `docs/ci.md` gives for
`apps/docs`.

Previews reuse the existing mechanism: `pnpm hub preview:deploy demo`, once
`apps/demo` registers `preview`/`preview:deploy` scripts the way `apps/docs`
already does (`docs/tooling.md`, "Hosted previews"). No new `hub` capability
is needed.
