---
status: APPROVED
last_updated: 2026-11-18
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
    app-shell/
    buttons/
    feedback/
    form/
    forms/
    layout/
    native/
    settings/
    surfaces/
    typography/
  dev/
    package.json
    vite.config.ts
  debug/
    package.json
    vite.config.ts
  demo/
    package.json
    vite.config.ts
  tests/
    browser/
      accessibility.spec.ts
      aesthetics.spec.ts
      axes.spec.ts
      box.spec.ts
      buttons.spec.ts
      components.spec.ts
      contrast.spec.ts
      environment.spec.ts
      feedback.spec.ts
      fixtures.ts
      forms.spec.ts
      layers.spec.ts
      layout.spec.ts
      native.spec.ts
      palette.spec.ts
      playground.spec.ts
      preferences.spec.ts
      solo.spec.ts
      structure.spec.ts
      surfaces.spec.ts
      test-utils.ts
      theme.spec.ts
      tw-consumer.spec.ts
      typography.spec.ts
    integration/
      adapter.test.ts
      cli.test.ts
      exports.test.ts
      purge.test.ts
      registry.test.ts
      size.test.ts
```

## `playground/`

Shared manual and automated preview routes, and the reference the package documents against. The root index links to focused pages; common playground assets live under `shared/`.

A page is split by what a component is for -- buttons, forms, feedback, surfaces, typography and content, layout, native -- because a single page holding every grid is too long to read. Each grid renders a curated subset of intents and presentations by default rather than the full cross-product: `apps/demo` mounts these same pages verbatim as the deployed public reference (see `docs/internal/roadmap.md`), so the default view is sized to read as a reference rather than an exhaustive wall, while `shared/matrix.js` can still render the complete grid a host asks for.

Each fixture exists once. A component belongs to exactly one page, and the header's aesthetic selector puts the aesthetic class on the preview root, so every page can be read under every aesthetic rather than a separate page restating a subset of the components under each one. The aesthetic tests drive that selector and read the same fixtures as everything else, which is what keeps them from drifting apart. A spec therefore follows its fixtures: `feedback.spec.ts` reads the feedback page, and `components.spec.ts` keeps only the contracts that belong to no single component and builds its own elements.

Variant grids render from the spec in `shared/matrix.js` rather than being spelled out in markup: a component crossed with every intent, presentation, and state is a few hundred nodes, and a new intent has to reach all of them at once. Cells are addressable as `<component>-<presentation>-<intent>[-<state>]`, and the `none` intent is a cell with no intent class, which is not the same as `.neutral`. A component that reads intent but not presentation declares that in the spec, so a page cannot claim a variant the component ignores. A `data-matrix` host narrows what it renders with `data-matrix-intents`/`data-matrix-presentations`/`data-matrix-states`; a host with none of those falls back to the full grid. Narrowing a host is safe only when nothing in `tests/browser/` depends on the combination being dropped -- check both fixed literal `data-testid` lookups and any test that builds one dynamically by iterating a list of intents or presentations, since both count as load-bearing.

Input types are the one axis that is not intent crossed with presentation, so they have their own renderer: `data-fields` crosses every input type with the icon and state variants that type supports, as `field-<type>-<variant>`.

A second kind of page lives alongside the matrices, under its own "Screens" heading on the root index: a screen (`app-shell/`, `form/`, and `settings/`) composes the components into a real, non-trivial layout instead of exhausting one in isolation, so the difference between a component's own registry and a real composition stays visible to a reader. Screens read under every aesthetic and both themes the same way the matrices do. A screen follows the matrices' conventions where they apply (`data-testid` on what a reader or a spec would address, `.table-wrap` around a `.data-table`, the shared nav and aesthetic/theme controls) and departs from them where a real screen requires it: `app-shell/` skips the `.sect`/`.sect-inn` centered reading column every matrix page uses, because a dense shell reads edge to edge in the real world and a fixed column would hide whether the model holds up at that width; `form/` and `settings/` keep that column, since a form or a settings page is read narrow in the real world too.

## `dev/`

Vite application running against `tw/`, the Tailwind source a `/tw` consumer compiles, for fast iteration. The server regenerates `tw/` from `src/` when it starts and whenever a stylesheet in `src/` changes, since Tailwind cannot compile `src/` and its `@compose` itself. Starts on http://localhost:5183.

## `debug/`

Vite application running against built package CSS in `dist/` for pre-ship debugging. Starts on http://localhost:5184. The browser suite starts its own on `STYLES_TEST_PORT`, 5184 unless set, and refuses a port another server already holds, so two checkouts can test at once on two ports and a run never asserts another checkout's build.

## `tests/browser/`

Automated browser testing runs in Chromium, Firefox, and WebKit. One-shot runs use the `debug` server and built public exports; UI/source-mode runs use the `dev` server, which follows `src/` through a regenerated `tw/`, for synchronized iteration.

Rendering contracts are asserted primarily through computed styles on the shared playground fixtures. These assertions name the behavior the package promises, such as resolved intent colors, presentation inheritance, visible control boundaries, focus treatment, material geometry, pseudo-element artwork, and relative elevation. The suite also checks browser-visible semantics, navigation, route/environment wiring, and fixture accessibility where those are the observable contract.

- Component-focused specs cover buttons, forms, feedback, surfaces, typography, layout, native mappings, themes, and shared composition behavior.
- `box.spec.ts` covers the `box` helper on elements no component names: the ink an aesthetic gives a box with no intent, a neutral box on and off a plate, a helper nested in a component, and the press and hover states.
- `contrast.spec.ts` holds `prefers-contrast: more` to what `docs/accessibility.md` promises, on the built files: every line the package rests below 3:1 reaches it in both themes, and glass turns opaque.
- `preferences.spec.ts` checks that `data-contrast` and `data-motion` on `<html>` draw what the media queries they stand for draw, and override the system when the two disagree, across components, aesthetics, solo classes, native elements, and the reset.
- `tw-consumer.spec.ts` compiles a page through `/tw` from its own markup with the Tailwind CLI and holds it to the same page on the compiled `dist/index.css`, by class and through `@apply`, and checks the build is tree-shaken.
- Elevation is asserted off the composited `box-shadow` rather than off `--ui-elevation`: the claim is that one unitless number scales the geometry an aesthetic supplies, which is only observable after the multiplication. Both the plain step and the neobrutalist slab are covered, along with the non-inheritance (an unclassed descendant of a raised container takes no depth) and the per-element opt-in (its own elevation class still reaches it regardless of the container around it).
- Form checks retain direct and inherited fill coverage for unchecked checkbox and radio boundaries, along with focus, forced-color, and reduced-motion behavior.
- Aesthetic checks retain glass behavior coverage: translucency and blur on cards, panels, alerts, and tooltip bubbles when transparency is allowed; absence of per-control blur; and opaque, unblurred degradation under reduced transparency.
- Chromium explicitly emulates both `prefers-reduced-transparency` branches, because it can report `reduce` from the operating system (glass then renders opaque and unblurred while Firefox and WebKit report no preference), so the suite never reads the environment's value. The allowed-transparency behavior also runs in Firefox and WebKit, so syntax and computed values are checked across all supported browser engines.
- Direct and inherited aesthetic precedence, including glass and pixel tooltip pseudo-elements, is verified through computed styles.
- Text and rings on a solid surface are measured against the flattened plate in both themes, on every intent: a hint, a group's adornments, a caption, and an inline quote at 4.5:1, a bare link's, summary's, or `[tabindex]` region's ring at 3:1, and an invalid control drawn as a `.destructive` one.
- Where only the paint answers -- whether a select shows its arrow, whether a small icon button's icon stays in sight under `.pixel`'s focus layers -- a test decodes a screenshot of the one element and counts pixels against a second shot of the same element, never against a stored baseline.
- `test-utils.ts` provides shared color parsing, comparison, contrast, and Playwright helpers.

A test reads a state, not the motion into it. Colour transitions run 200ms even under reduced motion, so a value read straight after a hover, a press, or a focus is an eased frame that depends on how fast the engine runs; reads like that were most of this suite's flaky failures and the cause of the palette's drift check failing in CI. `fixtures.ts` makes `page.goto` and `page.reload` wait for every stylesheet link, a settled paint, and every finite animation, so a page is read as it rests once loaded. A test that then reads a state calls `stopTransitions(page)` first, which ends every transition at once, checks the state took (`element.matches(":hover")`, `":active"`, or `":focus-visible"`), and reads once: no fixed wait and no polling, since an assertion that a value did not change passes on a transition's first frame whatever the rule says. A test that loads stylesheets itself with `page.setContent` calls `settleAnimations(page)`, which waits on the finite animations with `allSettled`, because one a later style change cancels rejects its `finished`.

- Retired token and class names (from a rename or removal) are not covered by a standing absence check. `docs/specs/tests.md`'s "No Permanent Absence Checks" rule applies here same as anywhere else in the workspace: verifying a retired name is gone is a migration-time concern for the pull request that performs the rename, not a permanent entry in this suite.

Screenshot and pixel baselines are intentionally not part of this package's test strategy. The asserted rendering contract is narrower: token resolution, computed composition, state and accessibility behavior, material geometry, and related DOM behavior that can be checked deterministically across all three browser engines. Computed styles do not prove the final paint. They can miss clipping and compositing integration, font rendering, antialiasing, and defects caused by interactions among properties that each compute correctly.

Screenshots would add operating-system, font, antialiasing, and media-preference variance without making those failures reliably diagnostic. The permanent package-specific exception to `docs/specs/tests.md` is recorded in `docs/specs/packages-exceptions.md`, including measurable reevaluation triggers. If one of those triggers occurs, add or change the test technique that directly addresses the demonstrated gap; screenshot baselines are not presumed.

## `tests/integration/`

Node-based Vitest checks validate every published target. Every compiled export contains representative public output, and every Tailwind entrypoint is processed independently against representative public selectors. Registry tests validate its schema and internal consistency, hold component defaults and class claims against the stylesheets, and enforce material and intent invariants.

`adapter.test.ts` holds the two paths to each other: each compiled entry that has a `/tw` counterpart, every one but `dist/palette.css`, is compiled again from it with the Tailwind installed, naming every utility it ships, and the two must emit the same rules in the same order. On the Tailwind release `src/base/` was copied from, that is byte for byte apart from Tailwind's banner and the `--tw-*` registrations, which are compared as sets. On another release, as the Tailwind workflow runs it, Tailwind's theme values and Preflight are that release's, so the package's components and utilities are compared alone, and a separate test fails when the lockfile moves the catalog's Tailwind off the release `src/base/` was copied from.

`purge.test.ts` covers the tree-shaking `chs build` runs, apart from the command: which selectors a set of used classes can match, which rules and selectors a purge drops, that the compiled stylesheets the command reads parse and write back unchanged, that purging the source to every class of the complete stylesheet gives that stylesheet, and the readable output `--no-minify` writes.

`size.test.ts` holds what a consumer downloads under ceilings, in minified bytes, each about 3% above the measurement it was set from. Gzipped lengths are recorded here but never compared, because zlib output can differ between machines. A change that grows past a ceiling raises it in the same change and says why. Measured with Tailwind 4.3.4:

| Measured                                   | Minified | Gzip   | Ceiling |
| ------------------------------------------ | -------- | ------ | ------- |
| `dist/index.css`                           | 226,140  | 18,695 | 233,000 |
| `dist/components.css`                      | 182,803  | 14,549 | 188,300 |
| `dist/native.css`                          | 338,328  | 24,833 | 348,500 |
| `dist/theme.css`                           | 12,788   | 2,574  | 13,200  |
| `dist/palette.css`                         | 25,967   | 3,103  | 26,800  |
| `dist/aesthetics/index.css`                | 48,275   | 5,191  | 49,750  |
| `dist/aesthetics/chunky-tile.css`          | 5,812    | 1,430  | 6,000   |
| `dist/aesthetics/cyber.css`                | 4,734    | 1,307  | 4,900   |
| `dist/aesthetics/glass.css`                | 14,052   | 2,340  | 14,500  |
| `dist/aesthetics/neobrutalism.css`         | 4,586    | 1,265  | 4,750   |
| `dist/aesthetics/pixel.css`                | 4,852    | 1,157  | 5,000   |
| `dist/aesthetics/sketch.css`               | 14,905   | 2,094  | 15,350  |
| `dist/purge/index.css`                     | 317,335  | 25,767 | 327,000 |
| `dist/purge/classes.json`                  | 6,855    | 1,626  | 7,100   |
| `/button/tw`, a page with `btn primary`    | 21,949   |        | 22,600  |
| `/button/tw`, a page with no package class | 9,610    |        | 9,900   |
| `/tw`, a page with `btn primary`           | 28,943   |        | 29,800  |

About 694 bytes of each of the three `/tw` rows are the nine `--tw-*` registrations `/tw` ships itself, with the fallbacks Tailwind's polyfills write for them, because Tailwind registers each only on a page that uses a utility setting it, and registers nothing a utility body sets by hand. `dist/aesthetics/index.css` carries no Tailwind banner, as it carries none of Tailwind's CSS.

The `dist/purge/` rows are under a ceiling too: `chs build` reads those files and no page serves them, but every consumer installs them, as [Build command](./cli.md) accepts.

The `/tw` rows are the package's cost over Tailwind alone on the same page, compiled with Tailwind's polyfills on as a consumer's CLI or Vite build compiles it, so a Tailwind release that changes Preflight moves no ceiling. The compiled files are also checked for Tailwind's fallbacks for browsers without `color-mix()` or `@property`, which the compiled build does not write, and a page that names no package class is checked for having no component rule.

## Scripts

Default package checks:

```json
{
  "test": "vitest run",
  "test:browser": "playwright test",
  "test:browser:watch": "playwright test --ui",
  "test:coverage": "vitest run --coverage",
  "test:watch": "vitest --watch",
  "dev": "pnpm --filter=@codenhub/styles-dev dev",
  "debug": "pnpm build && pnpm --filter=@codenhub/styles-debug dev",
  "demo": "pnpm build && pnpm --filter=@codenhub/styles-demo dev"
}
```

`test` covers `tests/integration/` only, and the browser suite runs under `test:browser`, which `docs/specs/tests.md` requires so a unit run needs no browser. Run both from the repository root:

```sh
pnpm test styles
pnpm test:browser styles
pnpm test:browser:watch styles
```

`pnpm test:browser` installs the browsers it needs first, and building the package before the browser run is the root tooling's job rather than a step chained into these scripts.

Vitest likewise reads the output built by root tooling. Its configuration must not invoke `pnpm build` through setup hooks; direct package-script runs that skip root prerequisites require an existing `dist` tree.

`test:coverage` runs the same integration suite and writes a V8 coverage report over `src/cli/`, the `chs` build command, which is the package's only code. The CSS it ships is held by the browser suite instead, since V8 cannot instrument a stylesheet; `vitest.config.ts` limits the report to `src/cli/` so the figure says something about the code it measures.
