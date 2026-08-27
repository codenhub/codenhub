---
status: APPROVED
last_updated: 2026-08-27
scope: apps/demo's own architecture — this app's implementation of the contract in docs/specs/packages-demo.md.
---

# Architecture

The shell, build pipeline, and asset copy step below are implemented.
Deployment is not: `docs/roadmap.md` tracks the remaining Cloudflare project
under `@codenhub/demo`, and `docs/ci.md` names it in "Not covered yet" until
that project exists.

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

Discovering every `packages/*/demo/package.json` happens twice, in two
independent implementations, the same way `apps/docs` splits page content
(`src/lib/catalog.ts`, `import.meta.glob`) from build-time file copying
(`src/lib/documentation-integration.ts` and `resource-publisher.ts`, plain
Node `fs`). Sharing one implementation between them is not possible: a page's
frontmatter is bundled by Vite, so a discovery function it calls must resolve
paths through `import.meta.glob` rather than `import.meta.url` arithmetic,
which breaks once Vite moves the module into a build chunk. The
`astro:build:done` hook that copies each demo's output runs as plain Node
instead, outside that bundle, so it uses `readdirSync` directly.

- `src/lib/catalog.ts` globs `packages/*/demo/package.json` for the shell's
  own pages (`index.astro`, `sitemap.xml.ts`), producing each demo's `slug`
  and a display `label` derived from its manifest `name`.
- `src/lib/demo-integration.ts` re-discovers the same directories with
  `readdirSync`, at `astro:build:done`, and copies each one's `dist/` into
  `apps/demo/dist/<slug>/`. It fails the build if a discovered demo has
  no built `dist/` yet, rather than silently mounting a stale or missing
  one.

Both stay in sync automatically as demos are added or removed — neither
hand-maintains a list. The one thing that is not automatic is the
`workspace:*` dependency itself: pnpm has no wildcard dependency syntax, so
`apps/demo/package.json` declares each discovered demo package
(`@codenhub/icons-demo` today) by name. Adding a package's `demo/` therefore
still means adding one line to `apps/demo/package.json`, which is what lets
`hub`'s dependency-level build ordering (`docs/tooling.md`, "Execution
order") build that demo, and the package it demonstrates, before `apps/demo`
builds.

## Dev mode

`astro:build:done` only fires on `astro build`, so the copy step above has no
dev-mode equivalent — `astro dev` cannot serve output that does not exist
yet. `src/lib/demo-dev-server.ts` and `src/lib/dev-proxy-integration.ts` give
`pnpm dev` its own path to the same result: at `astro:config:setup`, when the
Astro command is `dev`, the integration discovers the same
`packages/*/demo` directories, starts each one's own `dev` script with its
Vite `--base` flag set to `/<slug>/`, reads the port it reports listening on
from its stdout, and registers a Vite dev-server proxy from `/<slug>` to
that port. A demo keeps its own dev server's hot reload; the aggregator only
routes to it. A demo whose dev server fails to start is skipped with a
warning rather than failing `apps/demo`'s own dev server — that demo's path
serves a 404 until its dev server can start, the same as before this
integration existed.

## CI and deployment

Pull request verification needs no new configuration: `packages/*/demo` and
`apps/demo` are both already `pnpm-workspace.yaml` globs, so `--changed`
already covers them.

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

Previews reuse the existing mechanism: `apps/demo` registers `preview` and
`preview:deploy` scripts the same way `apps/docs` does, so
`pnpm hub preview:deploy demo` already works once a maintainer has their own
`wrangler` login (`docs/tooling.md`, "Hosted previews"). No new `hub`
capability was needed.
