---
status: APPROVED
last_updated: 2026-09-07
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

`packages/styles/docs/internal/roadmap.md` owns the release conditions and the deferred work; this entry tracks only where the package sits.

### @codenhub/docs

- [ ] Polish UI/UX and code in general
- [x] Add fuzzy search
- [x] Frontmatter-driven sidebar order (`order`) and folder section labels (`group`), one ordering shared by the sidebar and `llms-full.txt` — `docs/specs/packages-documentation.md`

### @codenhub/icons

- [x] Icon registry, SVG scanner module & CSS mask generator
- [x] PostCSS & Vite build plugins (`/postcss`, `/vite`)
- [x] Add simple mask-image helper for maximum compatibility with other packages
- [x] Registry improvement and stabilization
- [x] Registry population
- [x] Dynamic icon bundle optimization
- [x] Add a `style` (or `default`) export condition to `exports["."]` so `@import "@codenhub/icons"` resolves inside `@tailwindcss/vite`. Ships a static `dist/style.css` with the base `.ic` rules for pipelines that resolve the import themselves (`@tailwindcss/vite`, a plain `<link>`); the Vite and PostCSS plugins still replace the import with the full scanned set when they are present.
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

- [x] Publish public packages from CI with npm trusted publishing (OIDC) and provenance. `.github/workflows/publish.yml` runs on a `<package name>@<version>` tag and publishes through `hub publish`, which refuses a tag whose version disagrees with the manifest, refuses an implicit selection, and treats an unresolved precondition as a blocker rather than a warning. No npm token exists here; provenance comes with the OIDC exchange rather than from a flag. A package's first release still goes out from a maintainer's machine, because npm cannot configure a trusted publisher for a name that does not exist yet
- [ ] Versioning and changelog workflow, weighing Changesets against `hub release`
- [ ] Documentation MCP server
- [x] Firefox browser-suite slowness, found and fixed. It was not the engine and not the dev server: Playwright builds a browser context per test, and a fresh context cost Firefox about 2.6s against Chromium’s 0.3s. Sharing one context per worker took `packages/styles` from 285s to 84s on Firefox, 57s to 44s on Chromium, and 75s to 71s on WebKit. The convention is in `docs/specs/tests.md`; `packages/router`, `packages/theme`, and `packages/toaster` still use per-test contexts and were left alone, the theme suite deliberately so, since it persists preferences itself.

### @codenhub/demo

- [x] `apps/demo` shell and build pipeline aggregating every package's `demo/` output into `dist/demo/<package>/` — general contract in `docs/specs/packages-demo.md`, this app's own architecture in `apps/demo/docs/internal/architecture.md`
- [ ] Second Cloudflare Workers Builds project, `codenhub-demo`, connected from the dashboard like `apps/docs`'s. The repository half is done: `docs/ci.md` now records the project's build watch-path excludes beside `apps/docs`'s, and `apps/demo/*` was added to the documentation project's list in the same change — a demo-only change had been rebuilding the documentation Worker for nothing. What remains is dashboard state and nothing else: connect the repository, set the build command and output directory to `apps/demo`'s, turn non-production branch builds off, and paste in the exclude list
- [x] Migrate `apps/docs` and `packages/icons/demo` off hand-duplicated `favicon.ico`/`logo-*.svg` onto the shared `assets/` build-time copy step `docs/specs/packages-demo.md` defines

### @codenhub/docs

- [x] Generated API reference per package from source TSDoc — `hub generate` writes `docs/reference/` for a package that sets `codenhub.docs.reference`, enforced by a `reference` check; `docs/specs/packages-reference.md` is IMPLEMENTED. Opt-in and live on `@codenhub/error`. Next steps in Notes.
- [x] Detect missing JSDoc/TSDoc on top-level typed package exports with the TypeScript-based `hub check` rule `undocumented-export/missing-jsdoc`, independently of generated reference opt-in.
- [x] Review and backfill workspace JSDoc/TSDoc coverage, promote `undocumented-export/missing-jsdoc` to an error enforced by local verification and PR CI, and retire the duplicate reference warning.
- [ ] Rework `apps/docs` navigation. The package sidebar now splits into a Guides / Reference / Changelog tab strip (`apps/docs/src/lib/document-section.ts`), so generated content no longer sits among the guides. Still open: a clearer scheme for what individual sidebar entries are named, per-symbol reference anchors, and search weighting — see Notes
- [x] Enrich the generated reference for readers and maintainers: a page `description` compiled from the entry module's `@packageDocumentation` summary, and `@since` "added in" metadata — a `since` frontmatter field on the entrypoint page and a `**Since**` line per symbol. "Last updated" was dropped: there is no TSDoc source for it and deriving it would pull git history into the generator's pure transform. `docs/specs/packages-reference.md` and the closed frontmatter schema in `docs/specs/packages-documentation.md` were revised to match.
- [x] Title reference entrypoint pages by import subpath — `/` for `.`, `/registries/browser` for the rest — so a package's reference reads as one consistent list instead of a marketing label beside path-style siblings. The page H1 carries the full specifier (`@codenhub/error/registries/browser`) so each page stays unambiguous on its own.
- [ ] Documentation versioning: keep docs for past package versions, not just `main` — see Notes
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

- `docs/ci.md` is the entrypoint for the pinned toolchain and what runs on a pull request. Delivery work below builds on it rather than adding a second workflow model.
- Both deployed surfaces — the documentation site and the demo site — deploy from the Cloudflare dashboard, connected to this repository. `apps/docs/wrangler.jsonc` and `apps/demo/wrangler.jsonc` describe what each one serves, and everything else about both deployments lives in the dashboard. That split is deliberate: the repository carries build configuration, not delivery plumbing, so there is no deploy workflow and no deployment credentials here.
- That config declares no `main`, because the site is static and the Worker serves its assets without running a script. `html_handling` is explicit so the directory-style routes Astro builds resolve with or without a trailing slash, and `not_found_handling` serves the built 404 page rather than rewriting an unknown path to a shell the site does not have. `pnpm hub preview docs` runs the same config locally through `wrangler dev`, which is why `compatibility_date` tracks a date the installed runtime supports rather than the current one.
- Unlisted packages (`router`, `store`, `theme`, `plugins`, `ui-kit`) are currently internal, WIP, deprecated, or evaluated separately.
- `docs/specs/packages-lifecycle.md` splits a release into the half a person does and the half CI does: a maintainer authorizes by pushing a `<package name>@<version>` tag, and the workflow performs the publish. Publish-on-merge stays forbidden, and the reason is stated there — a merge is a decision to change `main`, not a decision to release, and a version bump has to stay revertible until someone tags it.
- Six public packages have never been published: `components`, `i18n`, `kbd`, `toaster`, `tauri-plugin-webview`, `tauri-plugin-window`. Each needs one manual `hub publish` from a maintainer's machine before its trusted publisher can be configured on npm; the twelve already on the registry can move to the workflow as they are.
- Generated API reference: the generator, the `reference` check, and the `codenhub.docs.reference` opt-in have landed against `docs/specs/packages-reference.md`, proven on `@codenhub/error`; page `description` and `@since` "added in" metadata have since been added on top. `apps/docs` publishes any package's `docs/reference/` automatically through the same catalog loader as the rest of its docs, so opting a package in also puts its reference on the site; there is no separate switch. Reference pages there title the browser tab by import specifier and show their `description`/`since` as a deck just below the H1; extending that deck treatment to hand-authored pages, and surfacing the changelog `date` field the catalog also drops, are for the `apps/docs` design pass. Next: opt in a handful of packages with different shapes — `icons`, `kbd`, `router`, `validation` — to find where the generated signature and prose text falls short (inferred return types the `.d.ts` renders as `import("…")` noise, sparse TSDoc, generics-heavy signatures, class inheritance) and improve the generator against those findings. Only then flip to default-on with a `codenhub.docs.reference: false` opt-out, in a `docs/specs/packages-documentation.md` change. A `prose: false` signature-only manifest can go wider earlier. Default-on stays deferred until per-package TSDoc quality is known and the workspace-wide migration is worth doing.
- `apps/docs` navigation rework: PARTLY DONE. Direction (1) landed — the package sidebar splits into a Guides / Reference / Changelog tab strip (`apps/docs/src/lib/document-section.ts`, `buildPackageSidebar` in `apps/docs/src/lib/package-navigation.ts`). Each tab is a navigate-on-click link to its section's entry page; the active tab is derived from the current page; a one-section package shows no strip. Within a tab the tree is still `buildNavigationTree` / `orderDocumentSections`, so `reference/registries/` keeps grouping and `orderDocumentSections` stays the one ordering the sidebar and `llms-full.txt` share; the Reference tab then relabels a folder from its `index.md` page's import subpath (`reframeReferenceSubpaths`), so `/registries/browser` reads as `/browser` under a `/registries` group. Changelog is wired against `docs/specs/packages-changelog.md` but dormant — no package publishes `docs/changelog/` yet. Still open: a clearer scheme for what individual sidebar entries are named (direction 2, deeper nesting, was weighed and rejected — deep trees are their own navigation cost); per-symbol reference anchors; search weighting; the deck treatment for hand-authored pages and the changelog `date` field.
- Documentation versioning and localization are the same shape: a content dimension (version, then locale) threaded through routing (`apps/docs/src/pages/[...path].astro`), the catalog loader (`apps/docs/src/lib/catalog.ts`), and the single search index. Neither is near-term — versioning waits on real breaking changes once there are external consumers, localization waits on versioning — but the version-by-locale shape should be designed once, before either is built, so current `apps/docs` decisions do not foreclose it. Open questions for that design: snapshot-on-publish vs. build-from-git-tags, and the URL scheme (`/icons/0.2/…` vs. `/icons/latest/…`).
