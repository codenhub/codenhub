---
status: DRAFT
last_updated: 2026-09-18
scope: Proposal to extend `./palette` with `--color-border`/`--color-surface`/`--color-text`'s flat values, for the same optional-peer consumers `./palette` already serves.
---

# Flat neutral tokens in the generated palette

This is a proposal, not agreed direction. It extends [A generated palette for consumers outside the Tailwind pipeline](./generated-palette.md) and should be read after it -- this document assumes that one's problem statement, evidence method, and "Public surface" precedent, and does not repeat them.

## The problem

`./palette` bakes every `intent x presentation` cell so an optional-peer consumer never has to reimplement `box.css`'s `color-mix()` formula. It does not cover `--color-border`, `--color-surface`, or `--color-text` -- they are not intent x presentation cells, so the generator that produces `palette.css` has no reason to touch them. But a consumer in exactly the situation `./palette` exists for (an optional peer, no Tailwind pipeline of its own) still needs these three: they are the resting surface/border/text colors for anything that is not intent-colored, and `@codenhub/toaster`'s dialog container, cancel button, and text input all read them today.

`--color-border`/`--color-surface`/`--color-text` are `light-dark(var(--color-neutral-400), var(--color-neutral-700))`-shaped in [`theme.css`](../../src/theme.css#L48) -- resolved through Tailwind's own neutral OKLCH scale, which only exists after `@import "tailwindcss"` runs. There is no plain-text source for their final value the way `palette.css`'s intent cells have one in `registry.json`/`theme.css`'s literal intent colors: getting an actual value requires compiling `theme.css` through the real Tailwind CLI and reading the result back from a real browser, per `color-scheme`.

## Evidence

`@codenhub/toaster`'s `scripts/generate-toast-defaults.mjs` -- the generator this repository's `./palette` export exists to make unnecessary for intent colors -- does exactly that compile-and-read dance today, but only for these three tokens: `compileThemeHarness` shells out to `tailwindcss` against a throwaway entry file importing `../../src/theme.css`, and `readNeutralTokens` launches a full Playwright/Chromium instance, renders two throwaway HTML probe pages (light and dark), and reads `getComputedStyle(...).backgroundColor` back out through a hand-rolled OKLab-to-sRGB conversion, solely to end up with three hex constants (`--toast-default-border`/`-surface`/`-text`).

That is roughly half of a generator script -- a Tailwind CLI invocation plus a full browser launch -- to obtain three values that do not vary by intent or presentation and would fit as three more lines in `palette.css` if the generator that already produces that file emitted them.

This costs nothing at runtime -- `generate-toast-defaults.mjs` only ever runs at `pnpm generate` time, never in a published package or a consumer's build -- so the case for this document is maintainer tooling weight, not a consumer-facing defect. `@codenhub/toaster` cited only as the concrete example; this is not a proposal to change that package, matching how [`generated-palette.md`](./generated-palette.md#evidence) cites it.

## The decision (proposed)

Add three more declarations to `./palette`'s generator, alongside the existing `intent x presentation` cross: `--palette-border`, `--palette-surface`, `--palette-text`, each read from `--color-border`/`--color-surface`/`--color-text` the same way the generator already resolves any other theme value that needs the real Tailwind build to exist. Light values unscoped, dark values under the same `.dark`, `.theme-dark`, `[data-theme="dark"]` selector set the rest of `./palette` already uses.

### Naming

No intent, no presentation, no ground, no hover state -- these three tokens have none of those axes, so `--palette-<slot>` is the whole name: `--palette-border`, `--palette-surface`, `--palette-text`. Checked against the existing `--palette-<intent>-<presentation>-<slot>` shape and against `--color-*`/`--intent-*`/`--ui-*`: no collision, and no ambiguity with an intent cell, since no published intent is named `border`, `surface`, or `text`.

### Where they land

Same file, same export -- `./palette` already ships as one flat stylesheet a non-Tailwind consumer imports once; splitting these three into a second export would double the integration surface for no benefit to the audience this serves. `docs/setup.md`'s and `docs/usage/customizing.md`'s existing `./palette` sections get a short addition documenting the three tokens; no new export-table row.

### Verification

Same instrument `./palette`'s own cells are checked against: `tests/browser/test-utils.ts`'s `readSrgb`/`expectSameColor`, comparing the generated `--palette-border`/`-surface`/`-text` values against the live, Tailwind-compiled `--color-border`/`-surface`/`-text` for the same theme, light and dark.

## What this unblocks

Once published, `@codenhub/toaster`'s `generate-toast-defaults.mjs` can read `--palette-border`/`-surface`/`-text` as plain text off `palette.css`, the same way it already reads every `--palette-<intent>-*` cell -- `compileThemeHarness` and `readNeutralTokens` (the Tailwind CLI shell-out, the Playwright launch, the OKLab-to-sRGB conversion) become dead code to delete. `src/styles/index.css`'s existing `var(--toast-color-*, var(--palette-*, var(--toast-default-*)))` chains for the dialog container/cancel button/input already read `--color-border`/`-surface`/`-text` as their live-link tier (not `--palette-*`, since that tier didn't exist for these yet) -- that middle link should move to `--palette-border`/`-surface`/`-text` to match the pattern every other cell in that file already follows.

## Non-goals

This does not add a `--color-border-hover` or `--color-text-secondary`/`-hover`/`-strong`/`-contrast` cell -- nothing in `@codenhub/toaster` or the evidence above reads those today, and `./palette`'s existing "bake what is used" precedent (`generated-palette.md`'s own scope is every `intent x presentation` cell actually composed, not every token that exists) argues against speculatively baking tokens with no cited consumer. Add them the same way, with the same evidence standard, if a real consumer needs one.

## References

- [A generated palette for consumers outside the Tailwind pipeline](./generated-palette.md)
- [Model](./model.md)
- `../../src/theme.css`
- `../../../toaster/scripts/generate-toast-defaults.mjs` -- external example only, not a target of this proposal
