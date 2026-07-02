# Styles Test Strategy

**Status:** APPROVED
**Last updated:** 2026-07-02
**Scope:** `@codenhub/styles` package test strategy.

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
    index.css
  dev/
    package.json
    vite.config.ts
    entry.css
  debug/
    package.json
    vite.config.ts
    entry.css
  tests/
    styles.spec.ts
    exit-reporter.ts
```

## `playground/`

Shared manual and automated preview page. Contains:

- `index.html`: The HTML fixture showing all components and styles.
- `index.css`: Playground-only layout scaffolding.

## `dev/`

Vite application running against live package source CSS in `src/` for fast iteration.
Starts on http://localhost:5173.

## `debug/`

Vite application running against built package CSS in `dist/` for pre-ship debugging.
Starts on http://localhost:5174.

## `tests/`

Automated cross-browser testing for visual and computed-style confidence. Runs via Playwright against the local `dev` and `debug` Vite servers.

- `styles.spec.ts`: Playwright test file executing visual and layout assertions.
- `exit-reporter.ts`: Custom Playwright reporter to work around Windows process hang.

## Scripts

Default package checks:

```json
{
  "test": "pnpm typecheck && pnpm build && pnpm test:visual",
  "test:visual": "playwright test",
  "dev": "pnpm --filter=@codenhub/styles-dev dev",
  "debug": "pnpm build && pnpm --filter=@codenhub/styles-debug dev"
}
```
