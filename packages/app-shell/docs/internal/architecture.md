---
status: APPROVED
last_updated: 2026-09-08
scope: "@codenhub/app-shell: what it provides to the three deploy surfaces and the contract each host must satisfy."
---

# Architecture

`@codenhub/app-shell` is the shared chrome for `apps/www`, `apps/docs`, and `apps/demo`. It exists so the header, theme switch, footer, skip link, and SEO files read identically across the three subdomains without each app carrying its own copy.

## What it ships

Through `exports`, as source:

- `./layouts/base-layout.astro` — the `<html>` document: head, inline theme bootstrap, skip link, `<SiteHeader>`, page `<slot />`, `<SiteFooter>`, and the theme-switch + footer-year script.
- `./components/site-header.astro`, `./components/site-footer.astro`, `./components/theme-toggle.astro` — used by the layout; exported so an app can compose them directly if it needs to.
- `./site-config` — the `SiteConfig` type each app fills in.
- `./seo` — `buildRobotsTxt(baseUrl)` and `buildSitemapXml(baseUrl, routePaths)`.
- `./styles.css` — the chrome stylesheet.

There is no build step and no `dist/`. The package is private, so the lifecycle spec's published-package rules do not apply.

## Styling model

`styles.css` is written entirely against `@codenhub/styles` design tokens (`--color-*`, `--radius-*`, `--elevation-*`, `--motion-*`), which both the Tailwind (`/tw`) and native (`/native`) builds emit with the same names. It uses its own `shell-` prefixed class names and restyles no bare element and no styles-package utility, so it composes on top of either foundation without ordering hazards. `apps/docs` keeps `/tw`; `apps/www` and `apps/demo` use `/native`.

## Header

The header is one standard layout every surface shares, not a set of parts each app assembles. On the left: the brand/logo (linking to `homeHref`, the surface's own root by default) followed by the cross-surface text links — **Hub** (`wwwUrl`), **Documentation** (`docsUrl`), **Demo** (`demoUrl`). On the right: the `actions` slot for genuine per-surface extras, then the **GitHub** mark, the **npm** mark (`npmUrl`), and the theme switch.

Each link renders only when its `SiteConfig` URL is set, so a surface opts a link in or out purely by whether it carries that URL — there is no per-link prop. Every left link points at another origin, so all three open in a new tab and carry an outbound arrow. The `actions` slot is for things the standard set cannot express: `apps/docs` puts its search trigger there. `apps/www` and `apps/demo` pass nothing.

Below `40rem` the three groups can no longer share a line. The links stay on the brand's row (scrolling sideways if they overrun) and the actions drop to a full-width row below, so the rendered order still matches the DOM order — brand, links, actions — and keyboard focus follows it. The header grows to hold the extra row (`--shell-header-height` is a minimum, not a fixed height); a surface that keys layout off the header height — `apps/docs` does, for `scroll-padding-top` — raises its own value at that breakpoint.

## Layout width

The header and footer size their content to `--shell-max-width` (default `80rem`) with `--shell-gutter` (`1.5rem`) of inline padding. `styles.css` also exports `.shell-content` — the same `max-width` + gutter + centering — for a page to wrap its `<main>` matter in, so the three columns line up at the same edges. A surface that needs a different measure overrides `--shell-max-width` (and, if it wants a responsive gutter, `--shell-gutter`) at its own `:root`; the chrome and every `.shell-content` follow. `apps/docs` does this, widening all three to `--container-wide` on the same `--layout-gutter` its documentation grid already uses.

## Icons

Chrome icons are `@codenhub/icons` classes (`ic-lucide-*`) in **CSS mode**. GitHub and npm are brand marks, not UI icons, and stay inline `<svg>` in the components.

CSS mode is required because the icons Vite plugin skips `node_modules` in both its `transform` and its scan, and a pnpm workspace package resolves under `node_modules`. In CSS mode the plugin instead generates mask rules from a `content` glob, and those rules apply to any `<i class="ic-…">` element regardless of which file authored it. SVG mode would leave the shell's icons unrendered.

## Host contract

An app consuming the shell must:

1. Register `@codenhub/icons/vite` in `astro.config.ts` with `mode: "css"`, the `lucide` family, and a `content` entry covering this package's components, e.g. `path.join(packagesRoot, "app-shell/src/**/*.astro")`.
2. `@import "@codenhub/app-shell/styles.css";` in its global stylesheet, after its `@codenhub/styles` import.
3. Import `@codenhub/styles` — either `/tw` or `/native` — so the tokens `styles.css` reads are defined.
4. Give its `<main>` `id="main-content"` for the skip link, and wrap its content in `.shell-content` (or match `--shell-max-width` and `--shell-gutter` itself) so the page lines up with the header and footer.
5. Place the brand assets the header references at `/assets/logo/logo-dark.svg` and `/assets/logo/logo-light.svg` via `codenhub.assets` (`docs/specs/packages-demo.md`).

`base-layout.astro` imports `virtual:icons.css` itself, so the generated stylesheet reaches the page even though Astro never runs `transformIndexHtml` for its own pages. In CSS mode that stylesheet already carries the base rules (the `1em` box, the `ic-xs`–`ic-xl` size classes) alongside the generated masks, so a host must **not** also `@import "@codenhub/icons"` — that only ships the base a second time, and the copy that loses the cascade is the one `styles.css` needs to win. A host that keeps its own `@codenhub/icons` mode (as `apps/docs` and `apps/demo` may) still adds the `content` entry so the shell's classes reach whichever stylesheet that mode generates.

## Theme

One `localStorage` key, `codenhub-theme`, shared by name across the surfaces (each origin has its own storage). The inline bootstrap sets `data-theme` before first paint; the deferred script wires the switch, mirrors the active theme onto its `role="switch"` `aria-checked`, and writes the key. The switch itself is a sliding pill (`theme-toggle.astro`) whose knob carries the icon of the theme in effect. A surface that wants a theme package later swaps the two scripts in `base-layout.astro` and nothing else.
