---
status: APPROVED
last_updated: 2026-10-29
scope: "@codenhub/app-shell: what it provides to the three deploy surfaces and the contract each host must satisfy."
---

# Architecture

`@codenhub/app-shell` is the shared chrome for `apps/www`, `apps/docs`, and `apps/demo`. It exists so the header, theme switch, footer, skip link, and SEO files read identically across the three subdomains without each app carrying its own copy.

## What it ships

Through `exports`, as source:

- `./layouts/base-layout.astro` — the `<html>` document: head, inline theme bootstrap, skip link, `<SiteHeader>`, page `<slot />`, `<SiteFooter>`, and the theme-switch + footer-year script.
- `./components/site-header.astro`, `./components/site-footer.astro`, `./components/theme-toggle.astro` — used by the layout; exported so an app can compose them directly if it needs to.
- `./components/status-badge.astro` — the deprecated/experimental package badge; `compact` draws the icon alone, with the label as its accessible name and native tooltip, for space-tight places such as the index cards. Used by `apps/www` on its package list and pages, and by `apps/docs` in its package navigation; not used by `packages/*/demo`, since a package demo never lists other packages.
- `./package-grid` — `initPackageGrid()`, the search-filter and name-sort behavior for a package grid. Wired by `apps/www`'s package list, the only index since `apps/docs` and `apps/demo` redirect their root to it.
- `./components/search-palette.astro` — the documentation search: a header trigger, a `Ctrl`/`⌘ K` shortcut through `@codenhub/kbd`, and a modal that fetches the index from its `indexUrl` prop on first open and resolves each result's route against that URL. `apps/docs` passes its own `/search-index.json`; `apps/www` passes the documentation site's absolute URL, which `apps/docs/public/_headers` allows cross-origin. A failed load is not cached, so the next keystroke retries it.
- `./search` — `searchDocumentation(entries, query)` and the `SearchEntry` type the palette reads. `apps/docs` builds the index from its own catalog with that type; the fuzzy matching and highlight helpers stay internal to this package.
- `./nav` — `resolveNavLinks(siteConfig)`, the header's cross-surface link list. Pure: takes a `SiteConfig`, returns link/label pairs, touches nothing. `site-header.astro` calls it internally; a non-Astro host calls it too, and renders the result in its own markup — see `docs/internal/vanilla-host-markup.md`.
- `./theme` — `resolveInitialTheme`, `nextTheme`, `themeToggleAria`, and the shared `THEME_STORAGE_KEY` constant. Pure functions with no DOM or storage access; every consumer, `base-layout.astro` included, writes its own few lines of glue calling them. See "Theme" below and `docs/internal/vanilla-host-markup.md`.
- `./copy-feedback` — `createCopyController()`, the clipboard write and feedback behind every copy button: the `data-copy-state` (`copied`/`failed`), label, and status announcement, their 2000 ms reset to the button's own resting `aria-label` and `title`, and the rule that only the latest click on a given button shows its result. Each app owns its button markup, icons, and click wiring; `apps/docs` uses it for code blocks, `apps/www` for its copy buttons.
- `./remark-alerts` — `remarkAlerts`, the remark plugin that renders a GitHub-style alert blockquote, such as `> [!NOTE]` on a line of its own (also `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`), as `<aside class="markdown-alert alert {intent}">` with a `.markdown-alert-title` and `.markdown-alert-icon`. It also accepts the alert's text on the marker's line, as in `> [!WARNING] Experimental.`, which GitHub shows as a plain quote: some published READMEs use that form ([#395](https://github.com/codenhub/codenhub/issues/395)), and the sites render the published copies. `apps/docs` registers it for its pages and `apps/www` for package READMEs; each styles that markup in its own stylesheet.
- `./site-config` — the `SiteConfig` type each app fills in.
- `./seo` — `buildRobotsTxt(baseUrl)` and `buildSitemapXml(baseUrl, routePaths)`.
- `./styles.css` — the chrome stylesheet.

There is no build step and no `dist/`. The package is private, so the lifecycle spec's published-package rules do not apply.

## Styling model

`styles.css` is written entirely against `@codenhub/styles` design tokens (`--color-*`, `--radius-*`, `--elevation-*`, `--motion-*`), which both the Tailwind (`/tw`) and native (`/native`) builds emit with the same names. It uses its own `shell-` prefixed class names and restyles no bare element and no styles-package utility, so it composes on top of either foundation without ordering hazards. `apps/docs` keeps `/tw`; `apps/www` and `apps/demo` use `/native`.

## Header

The header is one standard layout every surface shares, not a set of parts each app assembles. On the left: the brand/logo (linking to `homeHref`, the surface's own root by default), then any `localLinks` the surface passes, then the cross-surface text links — **CodenHub** (`wwwUrl`), **Documentation** (`docsUrl`), **Demo** (`demoUrl`). Documentation and Demo point at the current package's docs or demo, never at a site root: `apps/docs` and `apps/demo` have no root page of their own, so a page outside any package leaves them unset. On the right: the `actions` slot for genuine per-surface extras, then the **GitHub** mark, the **npm** mark (`npmUrl`), and the theme switch.

Each cross-surface link renders only when its `SiteConfig` URL is set, so a surface opts a link in or out purely by whether it carries that URL — there is no per-link prop. Those links point at another origin, so all three open in a new tab and carry an outbound arrow. `localLinks` is the one exception: links within the surface itself, such as `apps/www`'s **Packages**, which open in the same tab, carry no arrow, and, when the surface sets `current: true` on one, mark it with `aria-current`: `"page"` on that exact page, `"true"` on the pages below it, so a package page does not announce **Packages** as the page itself. They come first because they are the surface's own navigation, and the outbound links read as leaving it. The `actions` slot is for things the standard set cannot express: `apps/docs` and `apps/www` put the search trigger there. `apps/demo` passes nothing.

Below `40rem` the three groups can no longer share a line. The links stay on the brand's row (scrolling sideways if they overrun) and the actions drop to a full-width row below, so the rendered order still matches the DOM order — brand, links, actions — and keyboard focus follows it. A header with no links at all has nothing to share the brand's row with, so its actions stay on that row instead. The header grows to hold the extra row (`--shell-header-height` is a minimum, not a fixed height); a surface that keys layout off the header height — `apps/docs` does, for `scroll-padding-top` — raises its own value at that breakpoint.

## Layout width

The header and footer size their content to `--shell-max-width` (default `80rem`) with `--shell-gutter` (`1.5rem`) of inline padding. `styles.css` also exports `.shell-content` — the same `max-width` + gutter + centering — for a page to wrap its `<main>` matter in, so the three columns line up at the same edges. A surface that needs a different measure overrides `--shell-max-width` (and, if it wants a responsive gutter, `--shell-gutter`) at its own `:root`; the chrome and every `.shell-content` follow. `apps/docs` does this, widening all three to `--container-wide` on the same `--layout-gutter` its documentation grid already uses. `packages/styles/demo` does the same in reverse, pinning both to the `@codenhub/styles` tokens (`--container-max`, `--layout-gutter`) its reused playground fixtures already use, so the header and footer keep lining up with that content instead of drifting to a hand-picked width.

`packages/styles/demo`'s theming also needs one bridge: `shared/playground.js` toggles a `.dark` class (the `@codenhub/styles` package's own dark-mode trigger), but `styles.css` is plain CSS and only reacts to the `data-theme="dark"` attribute the Astro hosts set. A non-Astro host on a different theming convention keeps `data-theme` mirrored onto its root element itself (`packages/styles/demo/chrome.ts`'s `syncPill()` does this) — otherwise the shell's logo swap, knob position, and icon toggling never activate.

## Icons

Chrome icons are `@codenhub/icons` classes in **CSS mode**: `ic-lucide-*` for UI icons, and `ic-simple-icons-github` and `ic-simple-icons-npm` for the brand marks. The marks were inline `<svg>` until `@codenhub/icons` 0.3.0 shipped the `simple-icons` family; they set `--ic-color: currentcolor`, since GitHub's brand color is near-black and would vanish on the dark theme. The vanilla hosts still hand-author inline `<svg>` marks, and `.shell-action-brand` sizes both forms.

CSS mode is required because the icons Vite plugin skips `node_modules` in both its `transform` and its scan, and a pnpm workspace package resolves under `node_modules`. In CSS mode the plugin instead generates mask rules from a `content` glob, and those rules apply to any `<i class="ic-…">` element regardless of which file authored it. SVG mode would leave the shell's icons unrendered.

`packages/icons/demo` and `packages/styles/demo` also consume `./styles.css` directly, as non-Astro Vite hosts — the shell's markup is plain HTML/CSS, so nothing here requires Astro specifically. See the Host contract below for the build-time integration steps, and `docs/internal/vanilla-host-markup.md` for the literal markup those two hosts hand-author to match, since neither has a `base-layout.astro` to render it for them.

## Host contract

Any host consuming the shell — Astro or not — must:

1. Register `@codenhub/icons/vite` in its Vite (or Astro) config with `mode: "css"`, the `lucide` and `simple-icons` families, and a `content` entry covering this package's components, e.g. `path.join(packagesRoot, "app-shell/src/**/*.astro")`.
2. Import the generated `virtual:icons.css` module somewhere it actually loads. `base-layout.astro` does this itself, since Astro never runs `transformIndexHtml` for its own pages; a non-Astro host (`packages/icons/demo`, `packages/styles/demo`) has no such layout, so it imports `virtual:icons.css` from its own JS entry point instead. In CSS mode that stylesheet carries the base rules (the `1em` box, the `ic-xs`–`ic-xl` size classes) alongside the generated masks — skip it and every shell icon renders `0×0`. A host must **not** also `@import "@codenhub/icons"` — that only ships the base a second time, and the copy that loses the cascade is the one `styles.css` needs to win. A host that keeps its own `@codenhub/icons` mode (as `apps/docs` and `apps/demo` may) still adds the `content` entry so the shell's classes reach whichever stylesheet that mode generates.
3. `@import "@codenhub/app-shell/styles.css";` in its global stylesheet, after its `@codenhub/styles` import.
4. Import `@codenhub/styles` — either `/tw` or `/native` — so the tokens `styles.css` reads are defined.
5. Give its `<main>` `id="main-content"` for the skip link, and wrap its content in `.shell-content` (or match `--shell-max-width` and `--shell-gutter` itself) so the page lines up with the header and footer.
6. Place the brand assets the header references at `/assets/logo/logo-dark.svg` and `/assets/logo/logo-light.svg` via `codenhub.assets` (`docs/specs/packages-demo.md`).
7. If the host's own theming convention doesn't already set `data-theme="dark"|"light"` on the root element, mirror it there (see the dark-mode bridge under "Layout width" above) — `styles.css`'s dark-mode rules only key off that attribute.
8. Hand-author the header/footer/theme-toggle markup per `docs/internal/vanilla-host-markup.md`, and wire theme behavior and nav links using `./theme` and `./nav` — see "Theme" below.

## Theme

One `localStorage` key, `codenhub-theme` (`THEME_STORAGE_KEY` from `./theme`), shared by name across the surfaces (each origin has its own storage). The inline bootstrap sets `data-theme` before first paint; the deferred script wires the switch, mirrors the active theme onto its `role="switch"` `aria-checked`, and writes the key — both using `./theme`'s `resolveInitialTheme`/`nextTheme`/`themeToggleAria`, which compute values only and never touch `document`, `window`, or `localStorage` themselves. `base-layout.astro` writes that glue for Astro hosts; a non-Astro host writes the same kind of glue itself, against its own elements (`docs/internal/vanilla-host-markup.md`). The switch itself is a sliding pill (`theme-toggle.astro`) whose knob carries the icon of the theme in effect. A surface that wants a theme package later swaps the two scripts in `base-layout.astro` and nothing else.
