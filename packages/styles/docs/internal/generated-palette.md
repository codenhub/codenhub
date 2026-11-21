---
status: IMPLEMENTED
last_updated: 2026-11-21
scope: The generated, flat `./palette` output of `@codenhub/styles`' composed colors, for consumers that cannot depend on the Tailwind pipeline that produces them.
---

# Generated palette

This is the maintained contract for `./palette`. The generator and its output comply with it.

This document contains no drop-in code: the source and the generator own the implementation, while this document owns the durable naming and output rules.

## Purpose

`box.css`'s composition only exists as a Tailwind `@utility`, built by `intent.css`, `presentation.css`, and `box.css` cascading together inside `@codenhub/styles`' own build. A package that takes `@codenhub/styles` as an _optional_ peer -- `@codenhub/toaster` is the concrete case (`peerDependenciesMeta.@codenhub/styles.optional: true`) -- cannot depend on that build existing. Without a published artifact stating what `.alert.success` renders as, its only option is to retype `box`'s formula under its own variable names, which loses terms silently: a hand-copied edge blend that mixes toward the plate double-paints a translucent fill, and a hand-picked fallback hue drifts from the theme it imitates.

`./palette` is that artifact. It is computed by the real composition once, at generation time, so a consumer references a flat value instead of reimplementing `color-mix()` math, and the value is what the package renders by default. Under `prefers-contrast: more` the package draws each intent's line in its strong tone and the palette's `-edge` values do not follow; the file has no such block, since a consumer that uses it on its own decides its own contrast. See [Model](./model.md#fill-how-much-of-the-intent-color-fills-the-box) for the composition it follows.

## What is generated

`scripts/generate-palette.mjs` compiles the package's own `src/index.css` with the build that compiles `dist/`, renders the real component each ground describes for every combination in Chromium, and reads their computed styles, so the published value is the browser's own answer rather than a re-derivation of the formula. Presentation percentages and intents come from `registry.json`. `pnpm generate` writes `src/palette.css`, which is compiled to `dist/palette.css`; `--dry-run` reports drift without writing.

Every `intent x presentation` cell (7 intents, `solid`/`soft`/`ghost`) gets its `bg`, `fg`, and `edge` at rest, plus `bg` and `edge` again at hover. `fg` never changes on hover, since `box-hover` only redefines background, edge, shadow, and transform.

Ground does not need its own free-standing dimension, because most of the cross collapses:

- **`.solid` is ground-independent.** At 100% fill, the plate's `color-mix()` contributes 0% of the ground, so `bg`, `edge`, and their hover values are the same on every ground. Neutral's capped `.solid` included: its 20% rests on the page background rather than on the ground ([model](./model.md#a-capped-fill-rests-on-the-page)).
- **`fg` is ground-independent** for every presentation.
- **Only `.soft` and `.ghost`'s `bg` varies by ground.** The ground-qualified edge names are published for symmetry, and their values equal the unqualified edge because the edge fades toward `transparent` rather than toward the ground-mixed plate.

The ground set is closed, and each ground is probed on the real component that draws it rather than on a bare `box` handed the ground token: `.badge` for the unqualified cells (transparent ground; `.btn` renders the same), `.alert` for `page`, and `.kbd` for `subtle` (`.code` and `.pre` render the same; they are the components `registry.json` grounds on `--intent-subtle`). A bare `box` is not enough because the components do more than set a ground: a neutral `.alert`, `.kbd`, `.code`, or `.pre` caps its fill, and the alert grounds on `--color-foreground`, so a `box` given `--color-background` or `--intent-subtle` published L 0.884 for `--palette-neutral-soft-page-bg` where `.alert` renders 0.97. The probe adds `box-hover`, so the hover cells of `.alert` and `.kbd`, which have no hover of their own, are what the component draws when made hoverable. `.solid` and `fg` are read off the unqualified probe; `palette.spec.ts` holds every mapped component to them. `.tooltip-bubble` is not mapped to any ground: it reads `--ui-surface-ground` first, a neutral bubble fills with `--color-tooltip`, and its edge does not fade, so its values match none of the three.

Every value is resolved at generation time -- the output is always the composited color, never a `var(--color-background)` or `var(--intent-subtle)` reference. `./palette` is self-contained and never needs `./theme` loaded alongside it. A `.ghost` cell's `bg` on the unqualified ground is `transparent` itself, and on `page` or `subtle` is that component's resolved ground; they are generated for naming consistency with `.soft`.

`.solid` contributes 5 values per intent (`bg`, `fg`, `edge`, `bg-hover`, `edge-hover`); `.soft` and `.ghost` each contribute 13 (`fg` once, plus `bg`/`edge`/`bg-hover`/`edge-hover` on each of the three grounds). That is 31 values per intent, 217 per theme, plus the 3 neutral values below: 220 per theme, 440 declarations.

## Naming

`--palette-<intent>-<presentation>-<slot>`, where `<slot>` is `bg`, `fg`, or `edge`, with two extensions layered on only where they apply:

- A ground qualifier (`page` or `subtle`) inserted before the slot, present only on `.soft` and `.ghost`'s `bg` and `edge` -- never on `.solid`, and never on `fg`.
- A `-hover` suffix on `bg` and `edge` -- never on `fg`.

Examples: `--palette-success-soft-bg` (transparent ground), `--palette-success-soft-subtle-bg`, `--palette-success-soft-subtle-bg-hover`, `--palette-success-solid-fg`, `--palette-success-ghost-page-edge`. The `palette` namespace does not collide with `--color-*`, `--intent-*`, or `--ui-*`.

## Flat neutral values

`--palette-border`, `--palette-surface`, and `--palette-text` are the pre-resolved light and dark values of `--color-border`, `--color-surface`, and `--color-text`. They are not intent or presentation cells and take no intent, presentation, ground, or hover segment. An optional-peer consumer needs the neutral border, surface, and text colors too; without them it would have to compile Tailwind's neutral OKLCH ramp and resolve `light-dark()` in a browser just to obtain three constants. Additional flat neutral tokens need a concrete consumer rather than speculative expansion.

## Dark mode

Each value is one `light-dark(light, dark)` pair, declared on `:root`, or the bare value where both schemes read the same. A custom property holding `light-dark()` is not resolved where it is declared but where it is used, against that element's computed `color-scheme`, so the palette follows the system's setting, every theme selector `theme.css` defines, and a nested region, exactly as the package's own `--color-*` tokens do. A consumer that uses the palette without the package switches themes by setting `color-scheme`, the platform's own switch, on the root or on a region.

This replaces, on 2026-11-21 and before 0.11.0 shipped, a light block on `:root` and the light selectors with a dark block under the dark ones and no `prefers-color-scheme` arm. That design assumed a standalone consumer switches themes with a class, and did not weigh the default theme: under a dark system setting with no selector, the package renders dark while the palette stayed light, so `--palette-neutral-solid-bg` was light grey beside a dark `.badge.solid`. `@codenhub/toaster`, the named consumer, already re-baked the values as `light-dark()` pairs to follow `color-scheme`, which is what the palette now ships. Adding a `@media (prefers-color-scheme: dark)` block instead was rejected: it repeats every value a third time, and a media query cannot see a region a selector forced light, so a light card on a dark system would read dark values; `light-dark()` answers both at the point of use.

## Verifying the output

`tests/browser/palette.spec.ts` checks every generated `bg`, `fg`, and `edge` value -- rest and hover, light and dark -- against every live component the cell describes (`.badge` and `.btn`; `.alert`; `.kbd`, `.code`, and `.pre`), checks that the `subtle` group is exactly the components `registry.json` grounds on `--intent-subtle`, and the three neutral values against their theme counterparts. It compares through `getColorDistance` in `tests/browser/test-utils.ts`, which normalizes a computed color, whichever of `rgb()`, `color(srgb ...)`, `oklab()`, or `oklch()` the engine serializes, to 8-bit sRGB and takes the largest per-channel distance, tolerating the rounding `color-mix()` introduces.

## Public surface

`./palette` is a documented, published export, mapped through `style`/`import`/`default` conditions to `dist/palette.css` (and `types` to the shared empty declaration), and versioned under the same semver as the rest of the package. It has `exports` coverage, public docs coverage in [Customizing](../usage/customizing.md#generated-palette) and [Setup](../setup.md#all-entrypoints), and a `compiledExportContracts` entry in `tests/integration/exports.test.ts`.

A JSON sidecar for non-CSS consumers is not shipped. The package stays CSS-only by design, and adding one waits for a concrete non-CSS consumer.

## Non-goals

This does not touch the `intent x presentation x aesthetic` axis model, `box.css`'s composition, or any component's behavior. It does not require `@codenhub/toaster`, or any other optional-peer consumer, to take a hard dependency on `@codenhub/styles`, adopt Tailwind, or change how it degrades without the package installed.

## References

- [Model](./model.md)
- [Roadmap](./roadmap.md)
- `registry.json`, `package.json`
- `../../scripts/generate-palette.mjs`
- `../../src/box.css`, `../../src/presentation.css`, `../../src/theme.css`
