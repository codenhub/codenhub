---
status: DRAFT
last_updated: 2026-09-11
scope: Findings from composing real-world screens against `@codenhub/styles`, per the roadmap's stress-test pass.
---

# Stress-test findings

## Purpose

[Roadmap](./roadmap.md)'s stress-test pass composes non-trivial, real-world screens against the published package and records where the model holds up and where it does not. This is that record: friction points, missing primitives, combinations that read wrong, and classes or tokens nothing exercises.

This document is a working list, not a design. Nothing here is a decision -- the roadmap's next planned step, feeding findings back into the contract, is where a finding turns into a versioned change to [Model](./model.md), `registry.json`, or the public docs, and each entry below stays until that happens or it is deliberately dropped.

**Method.** A screen's own CSS composes what the package has no opinion on -- page-level layout, a sidebar's grid, spacing between sections, sizing a full-width-by-default field for a toolbar it was never meant to fill. It does not correct what the package gets wrong. A local override that makes a confirmed defect look fine would mean the screen was no longer testing the package, and every fix here started as exactly that temptation -- a low-contrast progress track, a dialog rendering open on load -- restated to look right in the fixture until it was pointed out that a consumer restates nothing before finding the problem themselves. The screens render the real, broken behavior; the write-up below is where the correction belongs.

## `app-shell/`

A sidebar nav, a header, a toolbar (search, two filters, bulk actions), a data table with row actions, a selection-count/rows-per-page/page pagination footer, and a delete-confirmation dialog. Read under all five aesthetics and both themes.

### No dialog primitive, and `.card` actively fights `<dialog>`

The registry has no `dialog`/`modal` component, and `src/native.css` styles no native `<dialog>` element either. The closest primitive a consumer reaches for is `.card`, and composing it onto a real `<dialog>` does not just look unstyled -- it breaks two pieces of native dialog behavior:

- **Renders open with no `open` attribute and no `.showModal()` call.** `.card` composes `surface`, which sets `display: block` (`@apply box block` in `src/box.css`). That rule is author-origin CSS, and author origin beats the user-agent origin's `dialog:not([open]) { display: none }` regardless of selector specificity. A `<dialog class="card">` is visible on page load, full stop.
- **Does not center when opened.** The user agent centers an open modal dialog with `dialog[open] { position: fixed; inset: 0; margin: auto }`. Something in the cascade zeroes margin broadly enough to reach `<dialog>` (confirmed not `src/reset.css`, which only targets specific text elements -- most likely Tailwind's own preflight on the `tw` entry) and the dialog pins to the top-left instead.

Both render unpatched in `playground/app-shell/`: the dialog is visible on every page load, overlapping the header, before any interaction -- clicking a row's remove action does not open it, since it was already open. A consumer hitting this in a real product would have to find both fixes on their own, with nothing in the package pointing at either; patching them locally here would have hidden the actual finding behind a fixture that quietly worked around it, so the screen shows the defect rather than a corrected version of it.

### No visually-hidden utility, and it fails silently on the vanilla entry

The table's caption (`<caption class="sr-only">Workspace members</caption>`) uses Tailwind's `sr-only`, reached for as the common convention. On the vanilla (non-Tailwind, ready-to-import CSS) entry this compiles to nothing: no error, no visual signal -- the caption renders as plain visible text, directly above the table, where it was meant to be screen-reader-only. The package ships no equivalent of its own; the fixture renders it exactly as a consumer on the vanilla entry would get it, rather than patched.

### `.pixel`'s numerals are hard to tell apart at UI sizes

Pagination page numbers and the small "Showing 1-4 of 23" count are legible in the page's actual text content but visually ambiguous under `.pixel` at the sizes a real toolbar or pagination control uses -- `2`/`8` and `3`/`9` read alike at a glance. The existing playground pages mostly show `.pixel` at heading size or in generous matrix cells, which does not surface this; a dense screen does. Confirmed by reading the rendered text (correct) against the screenshot (visually ambiguous), not a rendering bug -- a legibility question about the bundled preview face at small sizes, worth a look regardless of whether the answer is "acceptable" or "worth a caveat in the aesthetic's docs."

### `.chunky-tile`'s offset shadow reads as fill on a small ghost icon button

The row-action buttons use `.btn.icon.ghost.dense` -- transparent background and border confirmed by computed style (`background-color: oklab(0 0 0 / 0)`, same for `border-color`), the correct rendering of `.ghost` at rest. Under `.chunky-tile` the same button carries `box-shadow: 0 4px 0 0 <destructive color>`: a hard, un-blurred offset the aesthetic paints on every `.btn` regardless of fill (registry: `chunky-tile` selects `btn` unconditionally). At a labeled button's size that shadow sits under the tile as a shelf. At a 20px icon-only button it is close enough in size to the glyph's own bounding box that it reads as a solid filled circle behind the icon -- a `.ghost` button that visibly looks `.solid`. Confirmed defect, not a candidate: the computed fill is correct and the paint still reads as filled. Worth a look at whether the shadow offset or spread should scale down with `.dense`/`.p-xs`, the way `--ui-border-width` already caps down for small toggles elsewhere in the registry.

### `.icon` is real and documented but absent from `registry.json`

The row actions and the pagination prev/next controls are exactly what `.btn.icon` is for -- confirmed by finding it already documented (`docs/usage/buttons.md`) and demonstrated (`playground/buttons/index.html`, including a `dense` icon-button example literally labeled "Remove row"). It is a real, shipped, behaviorally distinct button modifier: `aspect-square`, `min-width: var(--control-height)`, glyph-only padding. It does not appear anywhere in `registry.json` -- not under `modifiers`, not on the `btn` component's own entry. [Model](./model.md) calls the registry "the machine-readable source of truth" for the supported surface; a real modifier that only lives in prose and markup is exactly the "classes... nothing exercises" the stress-test pass is for, just inverted -- exercised, but not in the one place meant to know about it.

### `.icon` combined with `.compact`/`.p-sm` keeps the wrong floor

`.icon`'s base rule sets `min-width: var(--control-height)` (2.5rem) unconditionally. `.dense`/`.p-xs` zero that floor (`min-height: 0`) when combined with `.icon` and cut padding to `p-0.5` -- the pairing is consistent, and the result is a button sized to its content. `.compact`/`.p-sm` cuts padding the same way (`p-1` instead of the default `p-2`) but does not zero the floor, so `.icon.compact` keeps the 2.5rem `min-width` from `.icon`'s base rule while shrinking only its padding: a small glyph floating in a box far bigger than it needs, the opposite problem from `.dense`'s "glyph with almost no padding." Neither tier alone produces a well-proportioned small icon button; `.dense` is the one that is at least structurally correct (it is the only tier that actually removes the floor for `.icon`), so it is what the row actions use, unpatched -- the bare `p-0.5` the package gives it, not a padding restatement to make it read more comfortably. `.spacious`/`.p-lg` was not checked for the same gap but is the more likely direction, given `.compact`/`.p-sm` already has it.

### Progress track fails WCAG 1.4.11 in both themes

`.progress`'s track (`--progress-surface`, `color-mix(in srgb, var(--intent-subtle) 60%, transparent)` in `src/components/feedback.css`) measured, via canvas-sampled computed colors and the WCAG relative-luminance formula:

| Against         | Light theme | Dark theme |
| --------------- | ----------- | ---------- |
| Page background | 1.12:1      | 1.15:1     |
| A `.soft` card  | 1.07:1      | 1.04:1     |

All four are close to invisible and well under the 3:1 non-text contrast floor WCAG 1.4.11 sets for UI components -- the same floor `registry.json` already cites by name as the reason the checkbox, radio, and switch entries carry a fill or border bound. `.progress` carries no such bound, and renders unpatched in `playground/app-shell/`: the seats-used bar in the sidebar card is there, but not something a reader would notice without knowing to look. `--color-border` was tried as a local fix and measured no better (1.05:1) -- it is calibrated for a line against the page background, and a `.soft` card already sits close to that same lightness, so a border-strength token disappears against it too -- and `color-mix(in srgb, var(--color-text-secondary) 70%, transparent)` is what actually clears 3:1 against both the page and a `.soft` card in both themes (3.63-4.26:1). Neither is applied to the fixture: fixing the track locally would mean the screen no longer shows what the finding is about.

### `.card.soft.edged`'s border is nearly invisible against its own fill in light theme

Measured on the sidebar's Plan card (canvas-sampled computed colors, WCAG relative luminance):

| Theme | Card fill          | Card border        | Contrast |
| ----- | ------------------ | ------------------ | -------- |
| Light | `rgb(217 217 217)` | `rgb(213 213 213)` | 1.04:1   |
| Dark  | `rgb(33 33 33)`    | `rgb(60 60 60)`    | 1.46:1   |

`.card`'s registry default is `ghost`, not `soft` -- a bare `.card` has no fill at all, so this combination only exists because the fixture asked for `.soft` explicitly. Given that, the edge is doing the only work of marking the card's boundary (per `.edged`'s own purpose), and in light theme it does not: a 4-unit RGB gap between fill and border reads as no boundary at all, where dark theme's 27-unit gap at least reads as one even though neither clears 3:1. The two themes were not tuned to the same standard here.

`--ui-surface-ground` is confirmed to work as a per-instance escape hatch for a different problem the same card surfaced -- `.soft` mixes the intent color (black ink, for the no-intent case) into the ground at up to the neutral fill cap, which produces a background noticeably darker/more assertive than `--color-foreground` or `--color-surface` alone would read as a "quiet" card. Setting `--ui-surface-ground: var(--color-foreground)` on the element (tested live) changes the resolved fill accordingly, so a consumer wanting a flatter, non-intent-tinted card has a working override; it is just a token override rather than a named option like `.ghost`/`.soft`/`.solid` are.

### `data-table`'s head barely distinguishes `.soft` from `.solid`

Measured on the members table, swapping only the presentation class:

| Presentation | Table body (own fill)    | `<thead>` background |
| ------------ | ------------------------ | -------------------- |
| `.soft`      | `rgb(247 247 247 / 12%)` | `rgb(60 60 60)`      |
| `.solid`     | `rgb(250 250 250 / 20%)` | `rgb(75 75 75)`      |

The body differentiates the two presentations reasonably (12% vs 20% alpha, a real perceptual gap). The head does not: both values are fully opaque, 15 RGB units apart. The cause is `--table-ground` (`src/utilities/content.css`), which saturates any non-zero fill to a fully-opaque plate by design ("any fill at all brings the ground back whole rather than in proportion," per its own comment) -- so `--table-head-bg` only varies by how much intent ink is mixed into an already-solid plate (12% vs 20%), not by how solid the plate itself is. The mechanism is deliberate and documented; the outcome is that a table head does not deliver the volume-level distinction presentation promises everywhere else in the model, which is what prompted "soft is looking like solid, I'm not getting smooth vibes at all" in review.

### Table rules stay a 1px hairline under an aesthetic with a thicker border

Measured under `.chunky-tile` on a `.ruled` table: cell rules (`border-bottom-width`) are `1px`; the table's own outer boundary and a `.card`'s border on the same page are both `2px`. `src/utilities/content.css` states the row rule as `@apply border-b` deliberately -- "a rule is structure rather than the silhouette, so it stays hairline under an aesthetic that draws a thick edge" -- so this is documented, intentional behavior, not an oversight. Recorded anyway because the roadmap's stress-test pass is for combinations that read wrong regardless of whether the code behind them is deliberate: a 1px rule inside a 2px frame reads as thinner than intended once you have seen the frame, in exactly the aesthetic whose whole material is thickness.

### Elevation cascading and aesthetic-owned radius are both confirmed working as designed, not defects

Two things that looked surprising in review turned out to be documented behavior, verified rather than assumed:

- **Elevation cascades.** The dialog's `.floating` (elevation ×2) was inherited by its own "Cancel"/"Remove member" buttons, which have no elevation class of their own -- so they rendered at ×2 instead of `.btn`'s own registry default of ×1. This is [Model](./model.md)'s stated design (`--ui-elevation` is a plain number read before a component's own default, so an unclassed descendant inherits the ambient value) and has its own worked example on the surfaces playground page. Not a finding; the fixture simply had not given the buttons their own `.flat` where that mattered.
- **Aesthetics own `border-radius` by design**, per [Model](./model.md)'s axis table ("Aesthetic... Owns: lengths, shadows, shapes, type"). Tested whether that forecloses a consumer's own choice: `--ui-radius` overridden on a single `.btn` under `.pixel` (`0px` resting) took immediately (`8px` after `element.style.setProperty("--ui-radius", "0.5rem")`). A per-element shape override works the same way every other token override in this package does; there is no named escape hatch the way `.pill` is one for full roundness, but "unable to" is not accurate.

## Open threads for the next screen

Not yet exercised: a dense, real form (validation states mixed with real layout, not the forms page's per-control matrix), and a settings/detail screen to see cards and panels compose at a size between "component matrix cell" and "full app shell." Planned as the next stress-test screen.
