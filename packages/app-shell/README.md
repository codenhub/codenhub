# @codenhub/app-shell

Shared chrome, theme handling, and SEO helpers for the CodenHub deploy surfaces (`apps/www`, `apps/docs`, `apps/demo`).

This package is private and repository-local. It is not published and ships its `.astro` components and TypeScript as source through `exports` — there is no build step.

It owns one thing: the parts of the three surfaces a visitor should not be able to tell apart — the sticky header with the brand, the standard cross-surface links (Hub, Documentation, Demo) and the GitHub/npm marks, the light/dark switch and its persistence, the footer, the skip link, the deprecated/experimental status badge, the package-grid search-and-sort behavior, and the `robots.txt` / `sitemap.xml` bodies. Each surface fills in a `SiteConfig` and opts a header link in or out purely by whether it sets that URL. Each keeps its own styling foundation (`@codenhub/styles/tw` for `apps/docs`, `/native` for the others); the shell layers over either because it is styled entirely with `@codenhub/styles` design tokens. The nav-link and theme logic behind the header are also exported as pure functions (`./nav`, `./theme`), so a non-Astro host can hand-author its own markup and still share the same behavior rather than reimplementing it.

See [`docs/internal/architecture.md`](docs/internal/architecture.md) for the consumer contract every host has to satisfy.

## Development

```sh
pnpm test packages/app-shell
pnpm typecheck packages/app-shell
```
