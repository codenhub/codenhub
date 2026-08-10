---
status: APPROVED
last_updated: 2026-08-09
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
    buttons/
    components/
    forms/
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
      aesthetics.spec.ts
      buttons.spec.ts
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

Shared manual and automated preview routes. The root index links to focused
pages; common playground assets live under `shared/`.

Each fixture exists once. A component belongs to exactly one page, and the
header's aesthetic selector puts the aesthetic class on the preview root, so
every page can be read under every aesthetic rather than a separate page
restating a subset of the components under each one. The aesthetic tests drive
that selector and read the same fixtures as everything else, which is what keeps
them from drifting apart.

Variant grids render from the spec in `shared/matrix.js` rather than being spelled
out in markup: a component crossed with every intent, presentation, and state is
a few hundred nodes, and a new intent has to reach all of them at once. Cells are
addressable as `<component>-<presentation>-<intent>[-<state>]`, and the `none`
intent is a cell with no intent class, which is not the same as `.neutral`.

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
  "test": "vitest run",
  "test:browser": "playwright test",
  "test:browser:watch": "playwright test --ui",
  "test:coverage": "pnpm test",
  "test:watch": "vitest --watch",
  "dev": "pnpm --filter=@codenhub/styles-dev dev",
  "debug": "pnpm build && pnpm --filter=@codenhub/styles-debug dev"
}
```

`test` covers `tests/integration/` only, and the browser suite runs under
`test:browser`, which `docs/specs/tests.md` requires so a unit run needs no
browser. Run both from the repository root:

```sh
pnpm test styles
pnpm test:browser styles
pnpm test:browser:watch styles
```

`pnpm test:browser` installs the browsers it needs first, and building the
package before the browser run is the root tooling's job rather than a step
chained into these scripts.

Because this package has no instrumentable JavaScript or TypeScript, `test:coverage` runs the real integration suite without producing a coverage report. This permanent package exception is recorded in `docs/specs/packages-exceptions.md`.
