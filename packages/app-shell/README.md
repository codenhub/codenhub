# @codenhub/app-shell

Shared chrome, theme handling, and SEO helpers for the CodenHub deploy surfaces (`apps/www`, `apps/docs`, `apps/demo`).

This package is private and repository-local. It is not published and ships its `.astro` components and TypeScript as source through `exports` — there is no build step.

It owns one thing: the parts of the three surfaces a visitor should not be able to tell apart — the sticky header with the brand and actions, the light/dark toggle and its persistence, the footer, the skip link, and the `robots.txt` / `sitemap.xml` bodies. Each surface keeps its own styling foundation (`@codenhub/styles/tw` for `apps/docs`, `/native` for the others); the shell layers over either because it is styled entirely with `@codenhub/styles` design tokens.

See [`docs/internal/architecture.md`](docs/internal/architecture.md) for the consumer contract every host has to satisfy.

## Development

```sh
pnpm test packages/app-shell
pnpm typecheck packages/app-shell
```
