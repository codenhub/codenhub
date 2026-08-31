---
status: APPROVED
last_updated: 2026-08-21
scope: `@codenhub/styles` package test strategy.
---

# Styles test strategy

## Goal

Validate `@codenhub/styles` before publishing changes across both supported consumer paths:

- Ready-to-import compiled CSS.
- Tailwind CSS build-time source CSS.

Keep tests package-local and focused on the contract each consumer path publishes.

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
      axes.spec.ts
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
      registry.test.ts
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

Automated browser testing runs in Chromium, Firefox, and WebKit. One-shot runs
use the `debug` server and built public exports; UI/source-mode runs use the `dev`
server and live `src/` aliases for synchronized iteration.

Rendering contracts are asserted primarily through computed styles on the
shared playground fixtures. These assertions name the behavior the package
promises, such as resolved intent colors, presentation inheritance, visible
control boundaries, focus treatment, material geometry, pseudo-element artwork,
and relative elevation. The suite also checks browser-visible semantics,
navigation, route/environment wiring, and fixture accessibility where those are
the observable contract.

- Component-focused specs cover buttons, forms, feedback, surfaces, typography,
  layout, native mappings, themes, and shared composition behavior.
- Elevation is asserted off the composited `box-shadow` rather than off
  `--ui-elevation`: the claim is that one unitless number scales the geometry an
  aesthetic supplies, which is only observable after the multiplication. Both the
  plain step and the neobrutalist slab are covered, along with the inheritance
  and the per-element opt-out.
- Form checks retain direct and inherited fill coverage for unchecked checkbox
  and radio boundaries, along with focus, forced-color, and reduced-motion
  behavior.
- Aesthetic checks retain glass behavior coverage: translucency and blur on
  cards, panels, alerts, and tooltip bubbles when transparency is allowed;
  absence of per-control blur; and opaque, unblurred degradation under reduced
  transparency.
- Chromium explicitly emulates both `prefers-reduced-transparency` branches.
  The allowed-transparency behavior also runs in Firefox and WebKit, so syntax
  and computed values are checked across all supported browser engines.
- Direct and inherited aesthetic precedence, including glass and pixel tooltip
  pseudo-elements, is verified through computed styles.
- `test-utils.ts` provides shared color parsing, comparison, contrast, and
  Playwright helpers.
- Retired token and class names (from a rename or removal) are not covered by
  a standing absence check. `docs/specs/tests.md`'s "No Permanent Absence
  Checks" rule applies here same as anywhere else in the workspace: verifying
  a retired name is gone is a migration-time concern for the pull request
  that performs the rename, not a permanent entry in this suite.

Screenshot and pixel baselines are intentionally not part of this package's
test strategy. The asserted rendering contract is narrower: token resolution,
computed composition, state and accessibility behavior, material geometry, and
related DOM behavior that can be checked deterministically across all three
browser engines. Computed styles do not prove the final paint. They can miss
clipping and compositing integration, font rendering, antialiasing, and defects
caused by interactions among properties that each compute correctly.

Screenshots would add operating-system, font, antialiasing, and media-preference
variance without making those failures reliably diagnostic. The permanent
package-specific exception to `docs/specs/tests.md` is recorded in
`docs/specs/packages-exceptions.md`, including measurable reevaluation triggers.
If one of those triggers occurs, add or change the test technique that directly
addresses the demonstrated gap; screenshot baselines are not presumed.

## `tests/integration/`

Node-based Vitest checks validate every published target. Every compiled export
contains representative public output, and every Tailwind entrypoint is
processed independently against representative public selectors. Registry tests
validate its schema and internal consistency, hold component defaults and class
claims against the stylesheets, and enforce material and intent invariants.

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
  "debug": "pnpm build && pnpm --filter=@codenhub/styles-debug dev",
  "demo": "pnpm build && pnpm --filter=@codenhub/styles-demo dev"
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
