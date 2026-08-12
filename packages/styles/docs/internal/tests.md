---
status: APPROVED
last_updated: 2026-08-11
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
    feedback/
    forms/
    layout/
    native/
    surfaces/
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
      feedback.spec.ts
      forms.spec.ts
      layout.spec.ts
      native.spec.ts
      playground.spec.ts
      surfaces.spec.ts
      test-utils.ts
      theme.spec.ts
      typography.spec.ts
    integration/
      exports.test.ts
```

## `playground/`

Shared manual and automated preview routes, and the reference the package
documents against. The root index links to focused pages; common playground
assets live under `shared/`.

Each page is exhaustive for what it holds: every component crossed with every
intent and every presentation it reads, plus the modifiers that sit outside that
grid. A page is split by what a component is for -- buttons, forms, feedback,
surfaces, typography and content, layout, native -- because a single page holding
every grid is too long to read.

Each fixture exists once. A component belongs to exactly one page, and the
header's aesthetic selector puts the aesthetic class on the preview root, so
every page can be read under every aesthetic rather than a separate page
restating a subset of the components under each one. The aesthetic tests drive
that selector and read the same fixtures as everything else, which is what keeps
them from drifting apart. A spec therefore follows its fixtures: `feedback.spec.ts`
reads the feedback page, and `components.spec.ts` keeps only the contracts that
belong to no single component and builds its own elements.

Variant grids render from the spec in `shared/matrix.js` rather than being spelled
out in markup: a component crossed with every intent, presentation, and state is
a few hundred nodes, and a new intent has to reach all of them at once. Cells are
addressable as `<component>-<presentation>-<intent>[-<state>]`, and the `none`
intent is a cell with no intent class, which is not the same as `.neutral`. A
component that reads intent but not presentation declares that in the spec, so a
page cannot claim a variant the component ignores.

Input types are the one axis that is not intent crossed with presentation, so
they have their own renderer: `data-fields` crosses every input type with the
icon and state variants that type supports, as `field-<type>-<variant>`.

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
- Form regressions assert visible unchecked checkbox and radio boundaries for
  direct and inherited `.soft` and `.ghost` in Chromium, Firefox, and WebKit.
- Surface, feedback, and typography regressions cover every supported
  presentation on dividers, empty states, skeletons, loaders, and block quotes,
  including their width clamps, visibility floors, and filled contrast.
- Aesthetic regressions cover direct glass and pixel tooltips plus both mixed
  ancestor/direct orders, including complete pseudo-element resets.
- Glass regressions deterministically emulate both transparency preferences in
  Chromium and cover cards, panels, alerts, and tooltip bubbles in each branch.
- Form regressions assert `.hint.error` composes helper typography with
  destructive intent while bare `.error` remains an intent class.
- `test-utils.ts`: Shared Playwright test setup and helpers.
- Reviewed Chromium screenshots cover the button matrix in both themes and the
  card matrix under every shipped aesthetic. No current rendering difference
  requires a Firefox or WebKit baseline. Computed-style assertions remain the
  primary contract checks; visual snapshots catch clipping, overlap, and
  composition defects those values miss.

## `tests/integration/`

Node-based Vitest checks validate every published target. Every compiled export
contains representative public output, and every Tailwind entrypoint is
processed independently against representative public selectors.

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

Vitest likewise reads the output built by root tooling. Its configuration must
not invoke `pnpm build` through setup hooks; direct package-script runs that skip
root prerequisites require an existing `dist` tree.

Because this package has no instrumentable JavaScript or TypeScript, `test:coverage` runs the real integration suite without producing a coverage report. This permanent package exception is recorded in `docs/specs/packages-exceptions.md`.
