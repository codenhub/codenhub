---
status: APPROVED
last_updated: 2026-09-14
scope: "The literal markup shape a non-Astro host must replicate to consume @codenhub/app-shell/styles.css and its exported behavior directly."
---

# Vanilla host markup

`packages/icons/demo` and `packages/styles/demo` are not Astro apps, so they cannot render `site-header.astro`/`site-footer.astro`/`theme-toggle.astro` directly — they hand-author HTML that carries the same `shell-*` classes those components render, then wire behavior with `@codenhub/app-shell/nav` and `@codenhub/app-shell/theme` (`docs/internal/architecture.md`).

This doc is the source of truth those two demos (or any future non-Astro host) are checked against. A host with no special need matches it exactly. A host with a genuine one — `packages/styles/demo`'s extra `.demo-routes` row under the header, for instance — may deviate, but the deviation and its reason belong in that host's own code as a comment, not as silent drift. There is no automated check for this; it is enforced by code review against this doc.

## Header

```html
<header class="shell-header">
  <div class="shell-header-content">
    <a class="shell-brand" href="{homeHref}" aria-label="{title} home">
      <img class="shell-brand-logo shell-brand-logo-on-light" src="/assets/logo/logo-dark.svg" alt="" aria-hidden="true" width="984" height="255" />
      <img class="shell-brand-logo shell-brand-logo-on-dark" src="/assets/logo/logo-light.svg" alt="" aria-hidden="true" width="984" height="255" />
    </a>

    <nav class="shell-nav" aria-label="Sites">
      <!-- One per link from `resolveNavLinks()` (`@codenhub/app-shell/nav`); omit the whole <nav> if it resolves to none. -->
      <a class="shell-nav-link" href="{link.href}" target="_blank" rel="noopener noreferrer">
        {link.label}
        <i aria-hidden="true" class="ic-lucide-arrow-up-right shell-nav-link-arrow"></i>
      </a>
    </nav>

    <div class="shell-actions">
      <!-- Slot for a host's own extras, if any, before the standard marks. -->
      <a class="shell-action" href="{githubUrl}" target="_blank" rel="noopener noreferrer" aria-label="{title} on GitHub">
        <svg aria-hidden="true" class="shell-action-brand" viewBox="0 0 16 16">
          <path d="M8 0C3.58 0 0 3.64 0 8.13c0 3.59 2.29 6.64 5.47 7.71.4.08.55-.17.55-.39 0-.19-.01-.83-.01-1.51-2.01.38-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.53-.01-.54.63-.01 1.08.59 1.23.83.72 1.23 1.87.88 2.33.67.07-.53.28-.88.51-1.08-1.78-.21-3.64-.91-3.64-4.02 0-.89.31-1.62.82-2.19-.08-.2-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.48 7.48 0 0 1 8 3.91c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.96.08 2.16.51.57.82 1.29.82 2.19 0 3.12-1.87 3.81-3.65 4.02.29.25.54.74.54 1.51 0 1.09-.01 1.97-.01 2.24 0 .22.15.47.55.39A8.12 8.12 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z"></path>
        </svg>
      </a>
      <a class="shell-action" href="{npmUrl}" target="_blank" rel="noopener noreferrer" aria-label="{title} on npm">
        <svg aria-hidden="true" class="shell-action-brand" viewBox="0 0 24 24">
          <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
        </svg>
      </a>

      <button type="button" role="switch" aria-checked="false" aria-label="Switch theme" class="shell-theme-switch" data-theme-toggle>
        <span class="shell-theme-switch-track">
          <span class="shell-theme-switch-knob">
            <i aria-hidden="true" class="ic-lucide-moon shell-theme-icon shell-theme-icon-moon"></i>
            <i aria-hidden="true" class="ic-lucide-sun shell-theme-icon shell-theme-icon-sun"></i>
          </span>
        </span>
      </button>
    </div>
  </div>
</header>
```

`data-theme-toggle` is the attribute app-shell's own behavior wiring keys off (see "Behavior" below); a vanilla host may look its toggle up by `id` instead in its own glue code — the pure functions don't care how a host finds its element, only that it passes one in.

## Footer

```html
<footer class="shell-footer">
  <div class="shell-footer-content">
    <p>&copy; <span data-footer-year>{currentYear}</span> Coden</p>
    <p>Built by <a href="https://coden.agency/" target="_blank" rel="noopener noreferrer">coden</a>.</p>
  </div>
</footer>
```

`data-footer-year` is the real attribute — not an `id` — and is what a host's own footer-year glue should target.

## Behavior

`@codenhub/app-shell/theme` (`resolveInitialTheme`, `nextTheme`, `themeToggleAria`, `THEME_STORAGE_KEY`) and `@codenhub/app-shell/nav` (`resolveNavLinks`) are pure functions: no DOM or storage access, no required element shape. A host writes its own few lines of glue — read `localStorage`, call the function, apply the result to its own elements. See `base-layout.astro`'s own `<script>` for the canonical shape of that glue; every host, Astro included, writes the same kind of glue rather than a shared version existing to call.

## Package-demo `SiteConfig`

A package demo (`packages/*/demo`) is not one of the three top-level surfaces, so it uses a narrower `SiteConfig` shape than `apps/www`/`apps/docs`/`apps/demo`:

| Field                     | Top-level surface                      | Package demo                           |
| ------------------------- | -------------------------------------- | -------------------------------------- |
| `wwwUrl`                  | `https://codenhub.dev`                 | `https://codenhub.dev`                 |
| `docsUrl`                 | `https://docs.codenhub.dev`            | `https://docs.codenhub.dev`            |
| `demoUrl`                 | `https://demo.codenhub.dev`            | _(unset)_                              |
| `homeHref` (brand link)   | `/` (default)                          | `https://demo.codenhub.dev`            |
| `githubUrl` (action mark) | `https://github.com/codenhub/codenhub` | `https://github.com/codenhub/codenhub` |
| `npmUrl` (action mark)    | `https://www.npmjs.com/org/codenhub`   | `https://www.npmjs.com/org/codenhub`   |

Leaving `demoUrl` unset makes `resolveNavLinks()` drop the self-referential "Demo" link with no special-casing — a package demo is already inside the demo surface. `homeHref` is passed explicitly, since the default (`/`) would just reload the same package page instead of returning to the demo index. The action-row GitHub/npm marks point at the same generic entrypoints every top-level surface uses, not a URL scoped to the individual package — `apps/www`'s package catalog cards are the one place package-scoped GitHub/npm/docs links exist today, and that is a separate, unrelated feature this doc does not change.
