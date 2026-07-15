---
status: APPROVED
last_updated: 2026-07-15
scope: `@codenhub/styles` package test strategy.
---

# Styles test strategy

## Goal

Validate `@codenhub/styles` before publishing changes across both supported consumer paths:

- Ready-to-import compiled CSS.
- Tailwind CSS build-time source CSS.

Keep tests package-local and focused on visual confidence.

## Structure

```text
packages/styles/
  playground/
    index.html
    shared/
    components/
    layout/
    native/
    typography/
  dev/
    package.json
    vite.config.ts
  debug/
    package.json
    vite.config.ts
  tests/
    components.spec.ts
    environment.spec.ts
    layout.spec.ts
    native.spec.ts
    playground.spec.ts
    theme.spec.ts
    typography.spec.ts
    exit-reporter.ts
    test-utils.ts
```

## `playground/`

Shared manual and automated preview routes. The root index links to focused component, layout, native, and typography pages; common playground assets live under `shared/`.

## `dev/`

Vite application running against live package source CSS in `src/` for fast iteration.
Starts on http://localhost:5183.

## `debug/`

Vite application running against built package CSS in `dist/` for pre-ship debugging.
Starts on http://localhost:5184.

## `tests/`

Automated cross-browser testing for visual and computed-style confidence. Playwright runs against the `debug` Vite server, which exposes both compiled and Tailwind-source playground environments.

- Focused specs execute component, environment, layout, native, route, theme, and typography assertions.
- `test-utils.ts`: Shared Playwright test setup and helpers.
- `exit-reporter.ts`: Custom Playwright reporter to work around Windows process hang.

## Scripts

Default package checks:

```json
{
  "test": "pnpm typecheck && pnpm build && pnpm test:visual",
  "test:visual": "playwright test",
  "dev": "pnpm build && pnpm --filter=@codenhub/styles-dev dev",
  "debug": "pnpm build && pnpm --filter=@codenhub/styles-debug dev"
}
```
