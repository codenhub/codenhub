---
status: DRAFT
last_updated: 2026-09-11
scope: Findings from composing real-world screens against `@codenhub/styles`, per the roadmap's stress-test pass.
---

# Stress-test findings

## Purpose

[Roadmap](./roadmap.md)'s stress-test pass composes non-trivial, real-world screens against the published package and records where the model holds up and where it does not. This is that record: friction points, missing primitives, combinations that read wrong, and classes or tokens nothing exercises.

This document is a working list, not a design. Nothing here is a decision -- the roadmap's next planned step, feeding findings back into the contract, is where a finding turns into a versioned change to [Model](./model.md), `registry.json`, or the public docs, and each entry below stays until that happens or it is deliberately dropped.

## `app-shell/`

A sidebar nav, a header, a toolbar (search, two filters, bulk actions), a data table with row actions, pagination, and a delete-confirmation dialog. Read under all five aesthetics and both themes.

### No dialog primitive, and `.card` actively fights `<dialog>`

The registry has no `dialog`/`modal` component, and `src/native.css` styles no native `<dialog>` element either. The closest primitive a consumer reaches for is `.card`, and composing it onto a real `<dialog>` does not just look unstyled -- it breaks two pieces of native dialog behavior:

- **Renders open with no `open` attribute and no `.showModal()` call.** `.card` composes `surface`, which sets `display: block` (`@apply box block` in `src/box.css`). That rule is author-origin CSS, and author origin beats the user-agent origin's `dialog:not([open]) { display: none }` regardless of selector specificity. A `<dialog class="card">` is visible on page load, full stop.
- **Does not center when opened.** The user agent centers an open modal dialog with `dialog[open] { position: fixed; inset: 0; margin: auto }`. Something in the cascade zeroes margin broadly enough to reach `<dialog>` (confirmed not `src/reset.css`, which only targets specific text elements -- most likely Tailwind's own preflight on the `tw` entry) and the dialog pins to the top-left instead.

Both were worked around locally in `playground/app-shell/index.css` (`.app-dialog:not([open]) { display: none }` and `margin: auto` restated), with a comment at each site. A consumer would have to find the same two fixes on their own, with nothing in the package pointing at either.

### No visually-hidden utility, and it fails silently on the vanilla entry

The table's caption (`<caption class="sr-only">Workspace members</caption>`) used Tailwind's `sr-only`, reached for as the common convention. On the vanilla (non-Tailwind, ready-to-import CSS) entry this compiled to nothing: no error, no visual signal, the caption just rendered as plain visible text where it was meant to be screen-reader-only. The package ships no equivalent of its own. Worked around locally with a hand-rolled `.app-sr-only` in `playground/app-shell/index.css`.

### `.pixel`'s numerals are hard to tell apart at UI sizes

Pagination page numbers and the small "Showing 1-4 of 23" count are legible in the page's actual text content but visually ambiguous under `.pixel` at the sizes a real toolbar or pagination control uses -- `2`/`8` and `3`/`9` read alike at a glance. The existing playground pages mostly show `.pixel` at heading size or in generous matrix cells, which does not surface this; a dense screen does. Confirmed by reading the rendered text (correct) against the screenshot (visually ambiguous), not a rendering bug -- a legibility question about the bundled preview face at small sizes, worth a look regardless of whether the answer is "acceptable" or "worth a caveat in the aesthetic's docs."

### `.chunky-tile` on small ghost icon buttons (unconfirmed)

The row-action buttons (`.btn.ghost` icon-only, pencil/trash) picked up a small shadow under `.chunky-tile`, which reads like a faint pedestal under a bare icon rather than the tile effect the aesthetic intends for a labeled action button. Registry confirms `chunky-tile` selects `btn` unconditionally, so this is expected from the current rule, not a bug -- flagged as a "combination that reads wrong" candidate rather than a confirmed defect; worth a closer look at whether icon-only or very small buttons should be part of that selector's scope.

## Open threads for the next screen

Not yet exercised: a dense, real form (validation states mixed with real layout, not the forms page's per-control matrix), and a settings/detail screen to see cards and panels compose at a size between "component matrix cell" and "full app shell." Planned as the next stress-test screen. </content>
