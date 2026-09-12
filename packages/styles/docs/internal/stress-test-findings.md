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

### `.pixel`'s numerals are hard to tell apart at UI sizes

Pagination page numbers and the small "Showing 1-4 of 23" count are legible in the page's actual text content but visually ambiguous under `.pixel` at the sizes a real toolbar or pagination control uses -- `2`/`8` and `3`/`9` read alike at a glance. The existing playground pages mostly show `.pixel` at heading size or in generous matrix cells, which does not surface this; a dense screen does. Confirmed by reading the rendered text (correct) against the screenshot (visually ambiguous), not a rendering bug -- a legibility question about the bundled preview face at small sizes.

Not a code fix: the package ships no font binary for `.pixel` by design (`Not Planned` in the roadmap gives the reasons -- no bundled bitmap face clears the distinct-case, real-weight bar a substitute would need), and the playground's own CDN face is preview scaffolding, not something a consumer gets. There is nothing in `src/` to change. Left open as a documentation question: whether the aesthetic's own docs should carry a caveat about numeral legibility at small sizes, for whoever picks a real face to pair it with.

### Aesthetics own `border-radius` by design -- considered and not changed

Per [Model](./model.md)'s axis table. Tested whether that forecloses a consumer's own choice: `--ui-radius` overridden on a single `.btn` under `.pixel` (`0px` resting) took immediately (`8px` after `element.style.setProperty("--ui-radius", "0.5rem")`). A per-element override works the same way every other token override in this package does; there is no named escape hatch the way `.pill` is one for full roundness, but "unable to" is not accurate. Not disputed.

## Landed, not yet released

Working code for the next version; draft changelog text is in `docs/internal/next-release.md`, not `docs/changelog/`, until the version is actually cut and released. Kept as a short index here; the reasoning for each lives at the site of the change.

| Finding                                                                                               | Change                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No dialog primitive, and `.card` fought `<dialog>`'s open/close and centering                         | `dialog:not([open])`/`dialog[open]` restated in `src/reset.css`                                                                                                                                                                                                                                                                                                                              |
| No visually-hidden utility, silently absent on the vanilla entries                                    | `.visually-hidden` added in `src/utilities/layout.css`                                                                                                                                                                                                                                                                                                                                       |
| `.icon` real and documented but absent from `registry.json`                                           | Added under `modifiers.shape`                                                                                                                                                                                                                                                                                                                                                                |
| `.icon` kept the wrong `min-width` floor under `.compact`/`.spacious`                                 | `src/components/button.css`: all three padding tiers now drop the floor for `.icon`                                                                                                                                                                                                                                                                                                          |
| `.chunky-tile`'s offset shadow read as fill on a small ghost icon button                              | `--ui-shadow-y` halved for `.btn.icon.dense`/`.p-xs` in `src/aesthetics/chunky-tile.css`                                                                                                                                                                                                                                                                                                     |
| Progress track failed WCAG 1.4.11 in both themes                                                      | `--progress-surface` in `src/components/feedback.css` now mixes `--color-text-secondary`                                                                                                                                                                                                                                                                                                     |
| `.card.soft.edged`'s border was nearly invisible against its own fill in light theme                  | `--color-border`'s light value moved from neutral-300 to neutral-400 in `src/theme.css`; re-verified against the untinted `.soft` rest below (2.37:1, better than the original fix's 1.70:1)                                                                                                                                                                                                 |
| Table rules stayed a 1px hairline under `.chunky-tile`'s 2px frame                                    | Row/boundary width now tracks `--_width` (the same token the frame uses) in `src/utilities/content.css`, instead of a fixed `1px`                                                                                                                                                                                                                                                            |
| Elevation cascaded onto unclassed descendants (a `.floating` dialog doubled its own buttons' shadows) | `--ui-elevation`, `--elevation-y`, `--elevation-blur` registered non-inheriting (`@property`) in `src/elevation.css`; each element now needs its own elevation class. `tooltip.css` carries the three tokens back across the host/pseudo-element boundary this broke for `.tooltip.raised`/`.floating`                                                                                       |
| `.card.soft` read as assertive/solid rather than quiet                                                | Untinted at rest (`--_fill-cap: 0%`, ground `--color-foreground`) in `src/components/surface.css`; intent tint and `--color-surface` ground both appear together on `.interactive`/`.hoverable` `:hover`. First attempt wrote `--ui-fill` directly and silently lost the cascade to `.soft`'s own unlayered rule regardless of specificity -- see the `--_fill-cap` comment in `src/box.css` |
| `data-table`'s `.soft` read closer to `.solid` than `.card.soft` does, on both head and body          | Head plate and the table's own base fill both untinted (`--color-foreground`, no ink mixed in), same `--_fill-cap` mechanism as `.card.soft`, in `src/utilities/content.css`. Applies to the bare `<table class="data-table">` case too, since `soft` is the published resting fill and most tables never write the class explicitly                                                         |
| A badge nested inside the now-untinted table lost its own fill entirely (colored text, no chip)       | `--_fill-cap` inherits like any custom property; `src/box.css`'s `@utility box` now restates `--_fill-cap: 100%` on every box user, the same way it already restates `--_d-ground: transparent`, so an own declaration beats the container's inherited cap                                                                                                                                   |

### `.soft`'s ground reads closer to `.solid` than intended -- landed for `.card` and `data-table`, `.panel`/`.alert` deliberately left alone

Measured before touching anything: swapping which token `.soft` grounds on barely moves a neutral card's result (12% ink onto `--color-background`, `--color-foreground`, or `--color-surface` land within 5-18 units of each other, since a near-black ink dominates regardless of which near-white ground it mixes onto). What actually reads as quiet is removing the tint at rest entirely.

`.card.soft` now composes `--color-foreground` untinted, with the intent tint and a `--color-surface` ground both arriving together on `.interactive`/`.hoverable` `:hover` (`src/components/surface.css`). The first attempt at this wrote `--ui-fill: 0%` directly on `.card.soft` and silently did nothing: `presentation.css`'s `.soft` is unlayered CSS, `@utility card` compiles into Tailwind's `utilities` cascade layer, and an unlayered declaration beats a layered one for the same property at any specificity -- so `.soft`'s `12%` always won regardless of selector. `src/box.css` now carries a `--_fill-cap` slot in its fill formula for exactly this, a token `.soft` never touches, and `.card.soft` sets that instead. A browser test now pins the numeric rest value so this cannot silently regress again.

`data-table`'s head has no hover or interaction state to move a reveal to, so its `.soft` head is untinted the same way, permanently, for every intent (`src/utilities/content.css`). The head-only version of this fix shipped first and created a new problem, caught by direct measurement rather than assumed away: an untinted head (`--color-foreground`, five units off the page background) sitting above a body still carrying the ordinary 12% tint (twenty-four units past the head) read backwards -- the seam that should mark one table read instead as the head belonging to the page and the body being the odd piece out. The table's own base fill now rests the same untinted way as the head, through the same `--_fill-cap` mechanism `.card.soft` uses. `.ghost` is unaffected and stays fully transparent, so `.soft` now differs from it by keeping an opaque, untinted plate and a head label strip, not by how much ink either carries. No hover-reveal was added to the table body -- row hover-to-highlight is a real, separate feature, left for later rather than folded into this fix.

`.panel` and `.alert` were considered for the same treatment and deliberately left alone. `.alert`'s whole job is status signaling, and it is never interactive -- an `.alert.soft.destructive` with the same fix would show no red anywhere, ever, which is a real regression in legibility rather than a quieter version of the same component. `.panel` carries the same tension at lower stakes (a `.panel.success` sidebar-of-the-day would flatten to grey-with-a-border). Both keep mixing `12%` at rest, unchanged.

Revisited once more against the live app-shell screen, after the fixes above made the bulk-actions bar (`.panel.primary.soft`) the one visibly strong-tinted surface left on the page. A narrower version was considered -- untint only a panel carrying no named intent (`none`/`.neutral`), leaving `.panel.primary`/`.success`/etc. tinted -- but not built: every other carve-out in this pass keys on _component_ and _presentation state_, never on _which intent_ is present, and this would be the first place fill amount depends on intent identity, needing a selector that lists which intents count as "loud" and stays in sync as intents are added. `.panel` stays unchanged; worth reopening if the same friction keeps surfacing.

### `.icon` ghost buttons read cramped at `.dense` in a real table's row-actions column

The app-shell members table's row actions (edit/remove/resend, `.btn.icon.ghost.dense`) looked visually undersized once seen next to the row's own badges and checkbox at real density -- `.compact` reads better there. Not a code change: `.dense` and `.compact` both work exactly as specified (this is the same floor-drop fix from the table above), it is a matter of which size tier suits a dense table's click targets. Fixture updated to `.compact` in `playground/app-shell/index.html`; left here in case the same preference shows up again and is worth a documented recommendation for table row-actions specifically.

## `form/`

A "create project" form: sectioned fields (project details, visibility, team access, billing), a validation-summary alert at the top, and several fields carrying `aria-invalid`/`.hint.error` together rather than one isolated invalid cell. Read under all five aesthetics and both themes.

### `.alert.soft.edged`'s border misses 3:1 for some intents, and which ones flips with the theme

The form's own validation-summary alert (`.alert.destructive.icon`) is the component's shipped default (`soft edged`, per the registry), not a chosen combination. Measured its border against its own fill -- the comparison [P3](./model.md#what-presentation-may-not-do)'s edge blend makes the right one -- across every intent on `.alert.soft.edged`, then reconfirmed the same numbers on the existing `feedback/` matrix so this is the shipped model, not something this fixture's markup did differently:

| Intent            | Dark theme | Light theme |
| ----------------- | ---------- | ----------- |
| none / `.neutral` | 1.46:1     | 1.70:1      |
| `.primary`        | 11.86:1    | 11.81:1     |
| `.secondary`      | 5.44:1     | 4.80:1      |
| `.success`        | 2.89:1     | 3.61:1      |
| `.warning`        | 4.51:1     | 2.38:1      |
| `.destructive`    | 2.56:1     | 4.09:1      |
| `.info`           | 2.48:1     | 4.09:1      |

Below 3:1 in dark theme: none, success, destructive, info. Below 3:1 in light theme: none, warning. `.panel.edged` composes the same seam and reproduces the same numbers -- confirmed against `settings/`'s destructive danger-zone panel below.

The mechanism is the one `model.md` already documents (P3: an edge blends toward the component's own fill by the fill amount) and the fix that shipped for `.card.soft.edged`'s border in the app-shell pass touched the same token, `--color-border`, one step in light theme only. That fix was tuned against a neutral card; it was never checked against all seven intents, and an intent's own hue plus a 12% fill lands at a different distance from `--color-border` depending on the intent and the theme, which is why the failing set is not the same set in both themes. Not fixed here: `--color-border`/`--intent-border` is what every soft-or-partial-fill component's edge blends toward, so a change reaches `.alert`, `.panel`, `.badge`, `.kbd`, `.pre`/`.code`, and any consumer composition using the same seam, across all seven intents and both themes -- a wider blast radius than the single-token nudge that fixed the card. Left open; see [Open threads](#open-threads).

### `.input-group` with a text affix instead of an icon -- considered, works

Every documented and shipped `.input-group` example is an icon child (`docs/usage/forms.md`, `forms/index.html`). The URL-slug field here uses a plain `<span>` of text (`codenhub.dev/`) as the leading child instead, to see whether the wrapper's `flex items-center gap-2` assumes an icon's fixed square footprint. It does not: the group has no icon-specific sizing rule, so a text affix sits flush and vertically centered the same way an icon does. Not a finding, recorded because the composition is untested by anything else in the package.

### `.pixel`'s numeral legibility reappears here

The counter ("57 / 240") and the alert's "3 fields" reproduce the same small-numeral ambiguity already recorded against the app-shell pagination controls. Same open documentation question, not a new one -- see the app-shell section above.

## `settings/`

An account-settings page: profile, plan/usage, an API-keys table, a security card, and a destructive danger-zone panel, stacked in `.sect-inn.narrow` (768px) -- a size between a component-matrix cell and the full app-shell width. Read under all five aesthetics and both themes.

### Danger-zone panel reproduces the `form/` border finding

`.panel.destructive.edged` measured 2.56:1 (dark) / 4.09:1 (light) border-against-fill, the same numbers `.alert.destructive.soft.edged` measured in `form/` -- see [that finding](#alertsoftedgeds-border-misses-31-for-some-intents-and-which-ones-flips-with-the-theme) rather than repeating the table. Confirms the issue is the shared edge-blend seam, not something specific to alerts.

### A long API key truncates cleanly in a compact table cell

`kbd.settings-key` (a fixed `max-width` plus `overflow: hidden; text-overflow: ellipsis` in the fixture's own CSS) truncates `sk_live_51H8q••••••••••••••••AyBcDe` without widening the `Key` column or breaking `.table-wrap`'s horizontal scroll. Not a finding -- the package has no opinion on cell content width, and the fixture's own CSS is exactly where that opinion belongs.

## Open threads

Whether to fix the `.alert`/`.panel` soft-edged border contrast, and if so how -- a `--color-border` nudge like the card fix, a per-intent adjustment, or leaving it as a documented characteristic the way `.pixel`'s numerals are. Raised with the maintainer rather than decided here, since any fix changes a token every soft-or-partial-fill component's edge reads from.
