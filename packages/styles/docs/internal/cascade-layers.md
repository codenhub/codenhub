---
status: IMPLEMENTED
last_updated: 2026-09-24
scope: Decision to place everything `@codenhub/styles` ships in named cascade layers, so a consumer's own CSS and Tailwind utilities beat the package's classes.
---

# Cascade layers: the consumer's CSS wins

This is the implemented decision, per the repository root `docs/README.md`'s `IMPLEMENTED` status; [Model](./model.md#cascade-layers) carries the layer map as part of the model. [Implementation notes](#implementation-notes) records where the shipped code refines what was proposed. It states the decision and what the implementation must reproduce, not drop-in code, for the reason [`.progress` gains presentation](./progress-presentation-axes.md) gives. The measurements below come from a throwaway spike, built and run in Chromium, Firefox, and WebKit.

## The problem

A consumer's Tailwind utility on an element carrying a package class loses to that class. `font-mono` on a `.pixel` region, `[--ui-radius:0]` on a `.cyber` one, or `[--ui-fill:50%]` on a `.solid` button all do nothing, because the class is unlayered and every Tailwind utility is layered. For normal declarations, an unlayered declaration beats a layered one whatever the specificity (important declarations reverse layer precedence; the `!important` width and height declarations in `@utility alert-icon` remain an intentional exception that overrides unlayered important declarations).

[Roadmap](./roadmap.md) recorded this for the aesthetics. It also recorded that wrapping the aesthetic files in `@layer components` is not enough: a layered aesthetic then loses to everything the package leaves unlayered or puts in `utilities`. This proposal takes the wider scope the maintainer chose: a consumer's utility, and the consumer's own unlayered CSS, beat all four class families the package ships -- **aesthetic, presentation, intent, and elevation**.

What the package emits today is not one map but three:

| Entrypoint                     | Components (`.btn`, `.card`, ...) | Four class families | Theme `:root` tokens |
| ------------------------------ | --------------------------------- | ------------------- | -------------------- |
| `.` (`dist/index.css`), `/tw`  | `utilities`                       | unlayered           | unlayered            |
| `/components`                  | unlayered                         | unlayered           | unlayered            |
| `/native`                      | unlayered                         | unlayered           | unlayered            |
| `/aesthetics`, `/aesthetics/*` | --                                | unlayered           | --                   |

`/components` and `/native` never import `tailwindcss` itself, so the CLI does not wrap their `@utility` output. On those two entries a component beats every consumer rule, where on `.` it already shares a layer with the consumer's utilities.

## Measured

The spike layered the four families and the theme tokens, then probed the built CSS with a consumer stylesheet appended: `@layer utilities` rules for the utility case, plain rules for the unlayered case. Each row below held identically in all three engines. The load scenarios were `.` with every aesthetic, and the raw `dist/` files a non-Tailwind consumer would link: `/components`, `/native`, `/theme` then `/components`, and `/aesthetics` loaded _before_ `/components`.

| Probe                                                       | `main`         | Proposed |
| ----------------------------------------------------------- | -------------- | -------- |
| Utility `font-*` beats `.pixel`'s face                      | loses          | wins     |
| Utility `--ui-radius` beats `.pixel`'s                      | loses          | wins     |
| Utility `--ui-fill` beats `.solid`                          | loses          | wins     |
| Utility `--intent-color` beats `.success`                   | loses          | wins     |
| Utility `--ui-elevation` beats `.flat`                      | loses          | wins     |
| Utility `font-*` beats chunky tile's label weight           | loses          | wins     |
| Aesthetic on `<html>` keeps its press and depth colour      | holds          | holds    |
| ... with `/aesthetics` loaded before `/components`          | **loses** (\*) | holds    |
| Chunky tile's label weight (800) on `.btn`                  | holds          | holds    |
| Neobrutalism's alert slab                                   | holds          | holds    |
| `.card.soft.glass` keeps glass's translucent ground         | holds (\*\*)   | holds    |
| A ghost card nested in a `.card.soft` takes the page ground | **no** (\*)    | yes      |
| `.ipt.soft` names its own 12% cap                           | holds          | holds    |
| `aria-invalid` beats `.success` on a field                  | holds          | holds    |
| Consumer's unlayered CSS beats `.pixel` and `.solid`        | holds          | holds    |

(\*) Behaviour on `main` that the layering changes as a side effect. An aesthetic loaded before the components lost `--elevation-color` to the theme's `:root` by source order, which is a defect. A plain card nested in a neutral `.card.soft` inherited the outer card's quiet ground, because the public `--ui-surface-ground` the outer card writes inherits; under L6 it takes the page ground like any other ghost card. Nothing records the old behaviour as intended, but it is a visible change and is listed for review.

(\*\*) Holds on `.`, but on `main` it is already broken under `/native`.

The existing browser suite passed unchanged against the spike: 599 passed, 4 skipped, all three engines. (This read 605 when proposed; that count included six runs of the spike's own probe.) It caught none of the failures the spike had to fix along the way, because every playground page is compiled through Tailwind and none exercises a consumer override, which is why [Tests](#tests) adds both.

One raw-entry fact turned up that this proposal does not change: `/components` loaded without the theme leaves colour tokens undefined, so `--_d-ground` and neobrutalism's slab resolve to nothing there on `main` and in the spike alike. The entry is compiled in Tailwind's reference mode, which emits no theme variables, so it relies on `/theme` for them.

## Decision

### L1. One layer map, for every entrypoint

| Layer        | Holds                                                                                                                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme`      | Tailwind's theme, the package's `:root` foundation tokens (radius, control height, elevation colour and steps, focus ring, motion, `--ui-active-transform`), the `.light`/`.dark` colour-scheme selectors, and `./palette`'s `--palette-*` tokens.                                                                                     |
| `base`       | `reset.css` and the native element styles, as now.                                                                                                                                                                                                                                                                                     |
| `components` | The four class families: intent (the `:root` floor, the classes, both `:where()` resets including `native.css`'s), presentation, elevation, and every aesthetic's token classes with their `@supports` and `@media` blocks.                                                                                                            |
| `utilities`  | Every component `@utility`, on every entrypoint, and the rules that must beat their own component (L4).                                                                                                                                                                                                                                |
| _unlayered_  | Only what must beat everything: the `forced-colors` blocks and the loader's reduced-motion art (accessibility overrides, as `reset.css` already argues), the `<dialog>` restatement in `reset.css`, the solo classes (they must beat a foreign component's unlayered CSS, per [Solo utilities](./solo-utilities.md)), and `@property`. |

The names are Tailwind's own, not a namespace of the package's, so a Tailwind consumer's layers and the package's merge into one order. Placing the four families in `components` puts them below every utility, the consumer's included. The `properties` layer Tailwind emits for its `@property` fallbacks stays where Tailwind puts it, below `theme`.

What this changes for a consumer:

- A utility, or the consumer's own unlayered CSS, on the same element beats any class of the four families for normal declarations.
- A consumer utility and a package component on the same element still contest one layer, by specificity and then source order, as they already do on `.`. Components cannot move below `utilities`: `@apply` only reaches `@utility` rules, and `box`, `surface`, and `text-control` are applied that way.
- A consumer rule the consumer placed in `@layer components` now contests the four families by specificity and order, where it lost to them outright before.
- On `/components` and `/native`, the consumer's unlayered CSS now beats the components too (for normal declarations), as it already does on `.`.

### L2. Every entrypoint declares the order first

A browser orders layers by the first time it meets each name, so a sheet that opens `components` before `theme` ranks it lowest. The spike found exactly that: compiled standalone, `/theme`, `/components`, and `/native` each opened `components` first. Every source entrypoint therefore begins with Tailwind's own statement, `@layer theme, base, components, utilities;`, ahead of its imports, and `/palette`'s generator writes it too. Measured on the built files, every entrypoint then opens in that order, and each load scenario above -- including the aesthetics loaded before the components -- resolved the same way.

### L3. `/components` and `/native` put components in `utilities`

Both import Tailwind's utilities and theme through `layer(utilities)` and `layer(theme)`, the way `tailwindcss/index.css` does, so their components land where `.` already puts them. This is the maintainer's choice of one map over three, and it is what lets L4 hold on every entry.

### L4. A rule goes where the property it writes can be contested

The package has rules that exist to beat their own component's `@utility`: the form seams (`.ipt.soft` and `.solid` naming their own cap, `.edgeless` lowering the edge floor, the toggles' `--intent-fill-max`, `.switch.ghost.edgeless`, `:checked`, `aria-invalid`), the tooltip's open state, and the loader's default art. Today they are unlayered to win. They move into `utilities` and win there on specificity (each is at least 0-2-0 against the component's 0-1-0), which the spike confirmed on every entrypoint.

The rule for where anything goes:

- **Writes a property or a public token a consumer may set** -> `components` (or `theme` for a foundation token), so a consumer's utility beats it.
- **Writes only package privates, or a state** -> `utilities`, with the specificity it needs to beat its own component. Nothing a consumer writes competes with a `--_*` private.

State is the one place a consumer's utility still loses, and deliberately: a consumer's `[--intent-color:...]` on an `aria-invalid` field loses to the destructive slots at 0-2-0, as [Precedence](./model.md#precedence) says state wins over every choice.

The two aesthetic selector lists that remain follow the same rule. Neobrutalism's alert slab writes only `--_d-elevation`, so it goes in `utilities` at 0-2-0. Chunky tile's `.btn.icon.dense`/`.p-xs` rule writes `--ui-shadow-y`, a public token, so it goes in `components`: as the element's own declaration it still beats the value inherited from `.chunky-tile`, and a consumer's utility beats it.

### L5. Chunky tile's label weight becomes a slot

`.chunky-tile :is(.btn, button) { font-weight: 800; letter-spacing: 0.04em }` cannot be placed anywhere that satisfies the goal: in `components` it loses to `.btn`'s own weight, and above `utilities` it beats the consumer's `font-*`. So it becomes two material tokens, per [Tier 2's first option](./model.md#tier-2----a-slot-or-a-selector-list-you-own):

| Token                  | Fallback                 | Read by                                 |
| ---------------------- | ------------------------ | --------------------------------------- |
| `--ui-button-weight`   | `--font-weight-semibold` | `.btn`, and `/native`'s bare `<button>` |
| `--ui-button-tracking` | _undefined_ (inherits)   | the same                                |

`.btn` reads `font-weight: var(--ui-button-weight, var(--font-weight-semibold))` in place of `font-semibold`, and `letter-spacing: var(--ui-button-tracking)`: undefined, that declaration is invalid at computed-value time, and `letter-spacing` then inherits, which is exactly today's behaviour. Chunky tile sets `800` and `0.04em`. The other four aesthetics clear both with `initial`, the nesting hygiene every aesthetic already follows for its corners.

Named for the component kind that reads them, the way `--ui-surface-*` names what only a surface reads, rather than for an "action" role: the role taxonomy was [removed from the model](./model.md#shared-composition-not-a-taxonomy).

Two consequences. Chunky tile's selector list shrinks to its icon-button bar (L4), which still names `.btn` and so stays a recorded R3 exception. And a bare `<button>` the package does not style -- no `.btn`, no `/native` -- no longer takes the heavier label under chunky tile; on `main` the selector list reached it anyway, which R3 says an aesthetic should not do.

### L6. A surface's quiet ground becomes a private default

A neutral `.card.soft`, a neutral `.panel`, and a neutral `.alert` write `--ui-surface-ground: var(--color-foreground)` from inside their `@utility`, and glass writes the same token. Layered, the component wins on the same element, and `.card.soft.glass` turns opaque.

They write a private default instead, `--_d-surface-ground`, which `surface` reads beneath the public token:

```css
--_d-surface-ground: initial;
--_d-ground: var(--ui-surface-ground, var(--_d-surface-ground, var(--color-background)));
```

`surface` restates the private as `initial` so it cannot inherit into a nested surface, as `box` restates `--_fill-cap` and `--_d-ground`. A consumer's `--ui-surface-ground` still wins over both states of `.card.soft.interactive`, as the current comment promises.

The maintainer accepted the consequence: **inside a `.glass` region, neutral soft cards, panels, and alerts are glass too.** On `main` they kept an opaque quiet ground, a side effect `aesthetics.spec.ts` documents and works around by probing a destructive panel. That workaround and its comment go.

### L7. What does not change

- The solo classes stay unlayered, as recorded when they shipped.
- The `forced-colors` blocks stay unlayered.
- No existing seam is simplified. With presentation below the components, a component could now write `--ui-fill` directly and win, so `--_fill-cap` and `--_fg-on-fill-floor` are no longer the only way through. Rewriting them is a separate change with its own review, not part of moving layers.

## Public surface

- **Behaviour, pre-1.0 breaking.** Consumer CSS that relied on a package class beating it now loses, and a consumer's `@layer components` rule now contests the four families. The commit that lands it carries `!`, and the release notes say so.
- **`/components` and `/native`** gain the layer placement `.` already has (L3).
- **New material tokens** `--ui-button-weight` and `--ui-button-tracking`, in the model's table and `docs/usage/customizing.md`.
- **Glass** reaches every neutral surface in its region (L6), in `docs/usage/aesthetics.md`.
- **Chunky tile** no longer styles bare buttons the package does not style (L5).
- **A new public section** on cascade layers in `docs/setup.md` or `docs/concepts.md`: the map, what beats what, and the per-entry guarantee.
- **`registry.json`**: chunky tile's `selectorReason` narrows to the icon-button bar; neobrutalism's is unchanged.

## Documents this changes

[Model](./model.md) explains several mechanisms by "unlayered beats layered": `--_fill-cap` in `box`, the `:checked` floor, [Precedence](./model.md#precedence)'s "a state that writes an intent slot is declared where intents are declared", and the toggles' `--intent-fill-max`. Each still works under this proposal, but the reason changes from "unlayered" to "`utilities`, at higher specificity". The implementation rewrites those passages and the matching source comments, and adds the layer map to the model.

## Tests

- **A new browser spec, `layers.spec.ts`**, turning the probe table into assertions, run on `.` and on the raw `dist/` files for `/components`, `/native`, `/theme` + `/components`, and `/aesthetics` before `/components`: a consumer `@layer utilities` rule and an unlayered rule each beat an aesthetic, presentation, intent, and elevation class; an aesthetic on `<html>` keeps its tokens; chunky tile's weight holds and a consumer's `font-*` beats it; `.card.soft.glass` and a glass region's neutral surfaces take glass's ground; a nested ghost card keeps its own ground; `.ipt.soft` names its cap and `aria-invalid` beats an intent class.
- **An integration check in `exports.test.ts`**: every built entrypoint opens with `theme, base, components, utilities`, and every unlayered rule in `dist/` is on an allowlist -- the solo classes, `forced-colors`, `@property` -- so a rule that slips out of its layer fails the build.
- **Registry**: chunky tile's `selectorReason` narrowed, and the aesthetic hygiene test extended to `--ui-button-weight` and `--ui-button-tracking`.

## Not in scope

- Simplifying the seams layering makes redundant (L7).
- Making `/components` usable without `/theme`. The undefined colour tokens there are unchanged by this proposal.
- Corner scale and corner pattern, which are separate decisions on [Roadmap](./roadmap.md#structure).

## Implementation notes

Where the shipped code refines or corrects what was proposed:

- **Two more unlayered rules.** The proposal listed the `forced-colors` blocks, the solo classes, and `@property` as the only unlayered CSS. Two more were already unlayered on `main` and stay so, for reasons that still hold: the loader's reduced-motion art is an accessibility override like `forced-colors`, and the `<dialog>` restatement in `reset.css` has to beat `.card`'s `display: block` on a closed `<dialog class="card">`, so it must beat the utilities layer. L1's table now lists them, and the integration check's allowlist names each.
- **Chunky tile keeps a selector list.** The proposal said chunky tile lost its only selector list under L5. Its `.btn.icon.dense`/`.p-xs` rule, which halves the bar under the smallest icon buttons, also names `.btn`, so it remains a recorded R3 exception. It writes the public `--ui-shadow-y`, so it sits in `components` (L4).
- **The four families enter `components` two ways.** Intent, presentation, and elevation are imported into the layer by `theme.css` (`@import "./intent.css" layer(components)`), the only file that imports them; the aesthetics and `native.css`'s resets wrap their rules in `@layer components` because they are entrypoints or share a file with other layers.
- **A regression test for the nested ground.** `surfaces.spec.ts` asserts that a card nested in a `.card.soft` rests like a card under a plain `.soft` container. Presentation cascades by design, so both are soft; only the ground differs, and it failed on `main`.
- **The seams, simplified later.** L7 left the seams alone. The follow-up in `0.5.0` removed `--_fill-floor` and `--_fg-on-fill-floor`: `:checked` now declares `--ui-fill` and `--ui-fg-on-fill` itself, as a state in `utilities` may, and `text-control` reads `box`'s fill and ink rather than restating them. `--_fill-cap` stays, for L4 (a component writing `--ui-fill` from `utilities` would beat the consumer's utility) and because `--ui-fill` cascades into what a component contains. See [Model](./model.md#a-state-declares-inputs-and-lifts-bounds-it-does-not-write-results).

## References

- [Model](./model.md)
- [Solo utilities](./solo-utilities.md)
- [Roadmap](./roadmap.md)
- [Tests](./tests.md)
