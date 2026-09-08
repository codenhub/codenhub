---
status: APPROVED
last_updated: 2026-09-08
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
- [x] Support `mode: "svg"` in an Astro host. `.astro` joined `MARKUP_FILE`, so the `transform` hook rewrites it; the plugin is `enforce: "pre"` and therefore sees `.astro` as its own source, ahead of Astro's compiler. Because the file is JavaScript above the fence and markup below it, each half is rewritten under its own escaping rule rather than the file taking one. `.md` and `.mdx` are still not rewritten — see Notes
- [x] Give an inlined icon a size. Both fixes shipped, because they answer different cases. `renderSvg` now emits `width="1em" height="1em"`, so an icon inlined with no stylesheet behind it renders at text size rather than 0×0; and `generateBaseCss` grew a geometry-only `svg[class^="ic-"]` rule reading `--ic-size`, so wherever `@import "@codenhub/icons"` is present the inlined `<svg>` honours `--ic-size` and the size axis exactly as an `<i>` does. `apps/demo` dropped its stand-in sizing rules and moved onto the axis; `[data-sort-icon][hidden]` stayed, being unrelated to sizing
- [x] Add a size axis, `ic-xs` through `ic-xl`, resolving to rem values (`0.75`, `0.875`, `1`, `1.25`, `1.5`). Each class is one line in `generateBaseCss` setting only `--ic-size`, which every form already reads, so it composes with the stroke modifier and needs no knowledge of its element; the unclassed default stays `1em`. Grammar: the sibling class won over the `ic-heart/lg` modifier — a size is not baked into the artwork, so a per-icon rule would duplicate the data URI per size and would not compose with a stroke modifier. The collision it opens is closed by reserving `xs`/`sm`/`md`/`lg`/`xl` as icon names and prefixes, enforced in the data generator and an integration test — see Notes
- [x] Narrow the base rules to the `<i>` and `.ic` element forms. The `::before`, `::after`, and form-control forms are gone, and with them the `:not(i, input, select, textarea, .ic)` carve-out and the `after`/`bg` reserved words. An icon is now an element that carries an icon class — the one shape that also works in `mode: "svg"` — so the two modes share a model and the bug surface from the element-type distinctions is smaller. An icon beside a label is a real `<i>` inside the control; a `background-image` icon comes from `getIconMaskUrl` / `getIconCssProps`, which stay in the JS API
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
- [x] Versioning and changelog workflow. Changesets was weighed and not adopted: it brings its own versioning model, its own file format, and a release-PR bot, next to a `hub release` that already knows this workspace. `hub release --cut=<version|major|minor|patch>` instead raises the version and scaffolds the `docs/specs/packages-changelog.md` entry, and a `changelog` check rule reports a version with no page or an unlinked one — so `--cut` makes the entry easy to write and the rule makes it impossible to skip. The scaffold is deliberately unfinished and nothing is committed or tagged: what changed for a consumer is the one part of a release no tool can derive
- [ ] Repository governance files, none of which exist today: a `CODEOWNERS` naming who reviews what, a pull request template, and a `SECURITY.md`. The first two are conveniences; `SECURITY.md` became a gap the moment publishing moved to trusted publishing, because a provenance-attested package invites someone to look for where to report a problem and this repository answers nowhere — see Notes
- [ ] Backfill package demos. `apps/demo` aggregates `packages/*/demo/`, and only `icons` and `styles` have one, so the deployed surface shows two of thirteen public packages
- [ ] Documentation MCP server
- [x] Firefox browser-suite slowness, found and fixed. It was not the engine and not the dev server: Playwright builds a browser context per test, and a fresh context cost Firefox about 2.6s against Chromium’s 0.3s. Sharing one context per worker took `packages/styles` from 285s to 84s on Firefox, 57s to 44s on Chromium, and 75s to 71s on WebKit. The convention is in `docs/specs/tests.md`; `packages/router`, `packages/theme`, and `packages/toaster` still use per-test contexts and were left alone, the theme suite deliberately so, since it persists preferences itself.

### @codenhub/demo

- [x] `apps/demo` shell and build pipeline aggregating every package's `demo/` output into `dist/demo/<package>/` — general contract in `docs/specs/packages-demo.md`, this app's own architecture in `apps/demo/docs/internal/architecture.md`
- [x] Second Cloudflare Workers Builds project, `codenhub-demo`, connected from the dashboard like `apps/docs`'s and serving the aggregated demo surface. `docs/ci.md` records the project's build watch-path excludes beside `apps/docs`'s, and `apps/demo/*` was added to the documentation project's list in the same change — a demo-only change had been rebuilding the documentation Worker for nothing. Everything else about the deployment is dashboard state the repository deliberately does not carry
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
- Repository governance files were weighed together and are deliberately one entry rather than three. `CODEOWNERS` and a pull request template only pay off once more than one person reviews here, and `CONTRIBUTING.md` already carries what a template would repeat; adding either now would mean maintaining a second copy of the same rules. `SECURITY.md` is the one with a real trigger behind it: packages published with provenance are packages someone may audit, and a reporter who finds something has nowhere to send it. Dependabot is deliberately absent from the list — `docs/ci.md` states that action pins are updated by hand and accepts that cost, so automating them is a decision to revisit there rather than a gap to close here.
- `@codenhub/icons` reaches an HTML page only through `transformIndexHtml`, which Astro never runs for its own pages. In CSS mode that meant the generated stylesheet was never injected, which an explicit `virtual:icons.css` import now solves and `docs/frameworks/astro.md` documents. Svg mode no longer needs that hook at all, because it rewrites `.astro` through `transform` instead. What remains is `.md` and `.mdx`, which neither path covers: an icon class in one of those is a bare `<i>` in svg mode, which renders as nothing rather than as an empty box. An Astro integration working on the emitted HTML at `astro:build:done` would cover them, at the cost of a new public entrypoint and of missing anything rendered per request, and it is not obviously worth that yet.
- The size axis grammar was decided as a sibling class (`ic-lg`), not the `ic-heart/lg` modifier. The modifier cannot collide, but a size is not baked into the artwork the way stroke width is, so a per-icon rule would carry a duplicate data URI for every icon×size pair, and it would not compose with a stroke modifier as `parseIconClass` is written. The sibling class is instead five static lines in `generateBaseCss`, each setting `--ic-size`, so every delivery path that ships the base rules — `dist/style.css`, the Vite and PostCSS injected base, `dist/tw/index.css`, a plain `@import` — carries one identical definition and no adapter has to learn the tokens. Its one cost is the collision: `ic-sm` would otherwise be readable as the icon named `sm`. That is closed by reserving `xs`/`sm`/`md`/`lg`/`xl` in the data generator's `RESERVED_PREFIXES` (now its only entries, since `after`/`bg` went with the pseudo forms), adding an icon-name check in `build-family.ts`, and asserting in `family-data.test.ts` that no bundled family ships one.
- An `ic-` class already survived onto an inlined SVG and was inert there: the rewriter keeps any class it did not consume as the icon, and the rule reading `--ic-uri`/`--ic-mask` targets `i[class^="ic-"]` and `.ic`, which an `<svg>` does not match. A size class needed no new plumbing to reach the element, only something that reads `--ic-size` on it, which is now the `svg[class^="ic-"]` geometry rule in the base stylesheet. A bare `ic` is still the exception: the rewriter drops it, so it is not available as a hook.
- The package narrowed to the `<i>` and `.ic` element forms. The `::before` form let `<button class="ic-save">Save</button>` carry a glyph without a child element, which is why every pseudo rule had to exclude `<i>`, `.ic`, and the form controls; the form-control form painted an icon as a `background-image` because an `<input>` has no `::before`. Both are gone. The deciding reason was mode parity: `mode: "svg"` only ever rewrote `<i>` tags, so "any element with an `ic-` class becomes an icon" was already a CSS-mode-only promise. An icon beside a label is now a real `<i>` inside the control, composing with a layout gap; `getIconMaskUrl` / `getIconCssProps` remain for a hand-placed `background-image`. Compatibility was not a design input — nothing outside this repo consumes the package.
- Two things an inlined icon loses have no fix in the package and are documented in `docs/delivery/vite.md` instead. `[hidden] { display: none }` is a user-agent rule for HTML elements, so it does not hide an element in the SVG namespace; and a guard written `instanceof HTMLElement` stops matching, which is what silently stopped `apps/demo`'s sort toggle from swapping its icons. Both were found by switching that app over, and neither is helped by the entries above.
- An icon class that resolves in no registered family produces no rule in CSS mode. CSS mode reports nothing in any host; the unresolved-class warning belongs to svg mode alone, and even there it covers only the files that mode rewrites. `ic-warning` sat broken in `apps/demo` with a green build for that reason, because Lucide, its default prefix, has no `warning`. Giving CSS mode an equivalent warning is worth doing and is not yet tracked as its own entry, because where it would be raised from is the open question: the scan sees classes one module at a time and has no point at which it knows the set is complete.
- Unlisted packages (`router`, `store`, `theme`, `plugins`, `ui-kit`) are currently internal, WIP, deprecated, or evaluated separately.
- `docs/specs/packages-lifecycle.md` splits a release into the half a person does and the half CI does: a maintainer authorizes by pushing a `<package name>@<version>` tag, and the workflow performs the publish. Publish-on-merge stays forbidden, and the reason is stated there — a merge is a decision to change `main`, not a decision to release, and a version bump has to stay revertible until someone tags it.
- Six public packages have never been published: `components`, `i18n`, `kbd`, `toaster`, `tauri-plugin-webview`, `tauri-plugin-window`. Each needs one manual `hub publish` from a maintainer's machine before its trusted publisher can be configured on npm; the twelve already on the registry can move to the workflow as they are.
- Generated API reference: the generator, the `reference` check, and the `codenhub.docs.reference` opt-in have landed against `docs/specs/packages-reference.md`, proven on `@codenhub/error`; page `description` and `@since` "added in" metadata have since been added on top. `apps/docs` publishes any package's `docs/reference/` automatically through the same catalog loader as the rest of its docs, so opting a package in also puts its reference on the site; there is no separate switch. Reference pages there title the browser tab by import specifier and show their `description`/`since` as a deck just below the H1; extending that deck treatment to hand-authored pages, and surfacing the changelog `date` field the catalog also drops, are for the `apps/docs` design pass. Next: opt in a handful of packages with different shapes — `icons`, `kbd`, `router`, `validation` — to find where the generated signature and prose text falls short (inferred return types the `.d.ts` renders as `import("…")` noise, sparse TSDoc, generics-heavy signatures, class inheritance) and improve the generator against those findings. Only then flip to default-on with a `codenhub.docs.reference: false` opt-out, in a `docs/specs/packages-documentation.md` change. A `prose: false` signature-only manifest can go wider earlier. Default-on stays deferred until per-package TSDoc quality is known and the workspace-wide migration is worth doing.
- `apps/docs` navigation rework: PARTLY DONE. Direction (1) landed — the package sidebar splits into a Guides / Reference / Changelog tab strip (`apps/docs/src/lib/document-section.ts`, `buildPackageSidebar` in `apps/docs/src/lib/package-navigation.ts`). Each tab is a navigate-on-click link to its section's entry page; the active tab is derived from the current page; a one-section package shows no strip. Within a tab the tree is still `buildNavigationTree` / `orderDocumentSections`, so `reference/registries/` keeps grouping and `orderDocumentSections` stays the one ordering the sidebar and `llms-full.txt` share; the Reference tab then relabels a folder from its `index.md` page's import subpath (`reframeReferenceSubpaths`), so `/registries/browser` reads as `/browser` under a `/registries` group. Changelog is wired against `docs/specs/packages-changelog.md` but dormant — no package publishes `docs/changelog/` yet. Still open: a clearer scheme for what individual sidebar entries are named (direction 2, deeper nesting, was weighed and rejected — deep trees are their own navigation cost); per-symbol reference anchors; search weighting; the deck treatment for hand-authored pages and the changelog `date` field.
- Documentation versioning and localization are the same shape: a content dimension (version, then locale) threaded through routing (`apps/docs/src/pages/[...path].astro`), the catalog loader (`apps/docs/src/lib/catalog.ts`), and the single search index. Neither is near-term — versioning waits on real breaking changes once there are external consumers, localization waits on versioning — but the version-by-locale shape should be designed once, before either is built, so current `apps/docs` decisions do not foreclose it. Open questions for that design: snapshot-on-publish vs. build-from-git-tags, and the URL scheme (`/icons/0.2/…` vs. `/icons/latest/…`).
