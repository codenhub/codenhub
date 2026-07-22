---
status: APPROVED
last_updated: 2026-07-22
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
    browser/
      accessibility.spec.ts
      components.spec.ts
      environment.spec.ts
      layout.spec.ts
      native.spec.ts
      playground.spec.ts
      test-utils.ts
      theme.spec.ts
      typography.spec.ts
    integration/
      exports.test.ts
```

## `playground/`

Shared manual and automated preview routes. The root index links to focused component, layout, native, and typography pages; common playground assets live under `shared/`.

## `dev/`

Vite application running against live package source CSS in `src/` for fast iteration.
Starts on http://localhost:5183.

## `debug/`

Vite application running against built package CSS in `dist/` for pre-ship debugging.
Starts on http://localhost:5184.

## `tests/browser/`

Automated cross-browser testing for visual and computed-style confidence.
One-shot runs use the `debug` server and built public exports; UI/source-mode
runs use the `dev` server and live `src/` aliases for synchronized iteration.

- Focused specs execute accessibility, component, environment, layout, native,
  route, theme, and typography assertions.
- `test-utils.ts`: Shared Playwright test setup and helpers.

## `tests/integration/`

Node-based Vitest checks validate every published target and process each
Tailwind entrypoint independently against representative public selectors.

## Scripts

Default package checks:

```json
{
  "test": "pnpm typecheck && pnpm test:integration && pnpm test:visual:run",
  "test:coverage": "pnpm test",
  "test:integration": "vitest run",
  "test:visual": "pnpm build && pnpm test:visual:run",
  "test:visual:run": "playwright test",
  "test:visual:watch": "playwright test --ui",
  "test:watch": "vitest --watch",
  "dev": "pnpm --filter=@codenhub/styles-dev dev",
  "debug": "pnpm build && pnpm --filter=@codenhub/styles-debug dev"
}
```

Because this package has no instrumentable JavaScript or TypeScript, `test:coverage` runs the real package test suite without producing a coverage report. This permanent package exception is recorded in `docs/specs/packages-exceptions.md`.
