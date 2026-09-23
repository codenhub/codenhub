---
status: APPROVED
last_updated: 2026-09-23
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction and release readiness for `@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns the styling model itself.

Finished work is not tracked here. The current token contract, component coverage, and shipped aesthetics belong in the model and repository history, not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the supported machine-readable surface, and the public documentation owns the consumer contract under `docs/specs/packages-documentation.md`. This roadmap adds no support rules.

## Current Focus

**`0.4.0` is cut** and ships once its pull request is merged and the merge is tagged; `@codenhub/styles@0.3.0` is the current npm version until then. It adds the `.cyber` aesthetic, per [`cyber-aesthetic.md`](./cyber-aesthetic.md), a solo class for every aesthetic, per [`solo-utilities.md`](./solo-utilities.md), and the `--ui-corner-shape`, `--ui-radius-pill`, and `--ui-radius-tight` material tokens `.cyber` needed. [`docs/changelog/0.4.0.md`](../changelog/0.4.0.md) records it. [Planned](#planned) is what is left. [Later / Possible](#later--possible) holds deferred, not-yet-started asks.

## Planned

- **Decide what to drop.** A `0.x` line is the window for removing surface that is not earning its place. Candidates are named here first, with the reason, before they are removed. Not a gate for any particular release.

## Later / Possible

- **A cascade layer for the aesthetics.** Moving the aesthetic classes into `@layer components` would let a consumer's Tailwind utility on the same element beat the aesthetic (measured: a `font-*` or `--ui-radius` utility on a `.pixel` element wins only once the aesthetic is layered). Wrapping the files is not enough, though. Measured in Chromium, Firefox, and WebKit with the built stylesheet, a layered aesthetic loses to everything the package leaves unlayered or puts in `utilities`: an aesthetic on `<html>` loses its press and depth colour to the theme's `:root` tokens, chunky tile's label weight (800) loses to `.btn`'s (600), neobrutalism's alert slab disappears, and `.card.soft.glass` loses its translucent ground to the card's own. Doing it properly means layering the theme's `:root` blocks below `components`, lifting the aesthetics' selector lists above the component utilities, and settling the intent reset, presentation, and elevation, which are unlayered too. That is a package-wide layering design, taken as its own decision rather than folded into an aesthetic release. The solo classes stay unlayered regardless: they must beat a foreign component's unlayered CSS. Not started.

- **Size-aware corners in the model.** No corner scales with a component's size today: `--radius-control` is one value, the size and padding modifiers (`.sm`, `.lg`, `.dense`, `.p-xs`, `.icon`) change height and padding but never the radius, and every aesthetic sets one `--ui-radius` for every size. A round corner hides it; `.cyber`'s bevel does not, and a 10px cut crowded the label out of a 15-30px button. `.cyber` caps its default cut at `min(<cut>, 25%)` of the element's box as a local fix, which scales but runs slightly off 45 degrees on small wide elements because horizontal percentages resolve against the width. The model-level answer is two tokens: a size token each size and padding modifier publishes, and a scalar corner token an aesthetic sets, separate from the corner _pattern_ (which corners take it) that `.cyber` currently packs into a multi-value `--ui-radius`. `box` would compute the default radius from the two, and an explicit `--ui-radius` would still override. That would scale every aesthetic's corner, retire `.cyber`'s percentage cap, and give [shape modifier classes](#later--possible) the scalar they need. To settle when picked up: whether the scale follows height or padding step; whether the result must stay a true 45-degree cut (a length, not a percentage); how it composes with `--ui-radius-pill` and `--ui-radius-tight`; and what it changes for a consumer already setting `--ui-radius` directly. Not started.
- **Shape modifier classes.** Per-element classes that place an aesthetic's corner on a chosen pattern -- `.cut-diagonal`, `.cut-diagonal-reverse`, `.cut-hex`, `.cut-skew` -- by setting `--ui-radius`/`--ui-radius-surface` from a scalar cut the aesthetic publishes. Considered while scoping `.cyber`'s shapes and deferred: `.cyber` exposes its shapes as the `--cyber-shape`/`--cyber-shape-surface` knobs, which cover a whole region, and a single element can already take a shape through `--ui-radius` set inline. A class family would work under every aesthetic (a diagonal under the default look is a two-corner "leaf") and so is a new modifier family, with its registry entries, collision checks, and docs; a parallelogram also slants into its content and needs its own padding answer. Not started.

The four aesthetics below are wanted for a near-future release and deferred from the current one so it can ship what it scoped. Each records what the model already says about it, so picking one up starts from the constraint rather than from scratch.

- **Glitch.** Its signatures are a colour-split (offset copies in two fixed hues) and a slice or jitter motion, and neither is material. The split is a multi-layer shadow in fixed colours: a complete value, which only surfaces resolve (`--ui-surface-shadow`), and fixed hues sit close to what [R1](./model.md#rules-for-aesthetics) bars. A text split needs `text-shadow`, which does not inherit into `<button>` or `<input>` (see Synthwave below). Motion has to satisfy WCAG 2.2.2 (moving content over five seconds must be pausable) and 2.3.1 (three flashes), and stop under `prefers-reduced-motion`. Whether it ships as a cascading aesthetic or as an effect utility on a single element is open; the maintainer has further direction for it. Not started.
- **Sketch.** A hand-drawn look: uneven elliptical corners, a 2px ink line, and a small offset shadow. The corners are a plain `--ui-radius`/`--ui-radius-surface` value (`255px 15px 225px 15px / 15px 225px 15px 255px`, for example), so the look is Tier 1 with no new slot. Two things to settle when it is picked up: `.checkbox` clamps its corner with `min(var(--ui-radius, ...), var(--radius-small))`, and `min()` takes a single length, so a multi-value elliptical radius makes that declaration invalid and the checkbox squares; and `box` writes `border-style: solid`, so a dashed or pencil line would need a slot of its own. A handwriting face would be consumer-supplied, the way `.pixel` reads `--font-pixel`. Not started.
- **Synthwave / retro.** Assessed earlier and deferred; now wanted. Its signatures are palette, which [R1](./model.md#rules-for-aesthetics) bars an aesthetic from setting. The glow is `--ui-shadow-blur` scaled by elevation, and 20 of the 22 registry components rest at zero elevation, so it would reach two of them: buttons and cards. `text-shadow` does not inherit into `<button>` or `<input>`, and the grid and scanline backgrounds need a painted layer `box` does not have. Shipping it means either breaking R1 or adding a background-image slot. The slot was judged not worth adding for one aesthetic alone, and the stress-test pass never surfaced a need for a painted layer elsewhere; the slot is to be designed together with synthwave, which cannot ship without it, and `.cyber` can take scanlines from it then. Known costs to settle at that point: surfaces would own `background-image`, so a consumer's own background image on a `.card` becomes cascade-order dependent where it now just works; every pattern needs text contrast checked across intents and themes; and forced-colors behaviour for a gradient layer is unmeasured. Not started.
- **Retro-OS bevel.** The raised two-tone bevel of a late-90s desktop UI: a light top-left edge, a dark bottom-right edge, and a press that inverts the two. Both edges are inset layers in fixed light and dark colours, which the single-layer shadow parts cannot express, so the resting look is a complete value -- and the one complete-value slot, `--ui-surface-shadow`, reaches surfaces only, where the look is best known on buttons and fields. It needs either a complete-value slot controls resolve (and an `:active` counterpart for the inverted press) or a Tier 2 selector list. Not started.

## Aesthetics assessed and deferred

Costed against the current model and not a fit. Recorded so the question is not reopened from scratch.

- **Liquid glass**: the refraction that defines it needs an SVG filter element in the DOM, which a CSS-only package cannot ship; the specular highlight is a surface-only treatment; `clip-path: path()` rejects percentages, so the silhouette cannot scale with the box; and `corner-shape: squircle` is Chrome-only. What is reachable without those is `.glass` with a heavier blur.

## Notes

Two measurements shaped the material tokens and outlive the change that needed them, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

`0.3.0` is the current published release, cut through the same tag workflow as `0.1.1` and `0.2.0` before it, and `0.4.0` is cut to follow it the same way. `0.1.0` carried the whole model rewrite over the manually published `0.0.4`; `0.1.1` is the first version cut through the tag workflow -- pushing `@codenhub/styles@0.1.1` triggered `.github/workflows/publish.yml`, which publishes through trusted publishing with provenance and refuses a tag whose version disagrees with the manifest. Every release from here follows that path.

The stress-test pass's fixes, across all three screens, land as one minor (`0.2.0`) rather than a run of patches: several change default token values (`--progress-surface`, `--color-border`) that affect every consumer already using `.progress` or `.card.soft.edged`, not just new ones, which is a real behavior change and not patch-level even pre-1.0.

The package stays on `0.x` while the public contract is still young, so a necessary breaking correction stays explicit and cheap. Documentation status remains `active`: supported for normal consumer use, not frozen against future semver-major changes.

## Not Planned

- **Neumorphism**: Its defining trait is a borderless control distinguished only by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace. The package ships no font binary and stays free of network side effects. The playground supplies Pixelify Sans from a CDN so the aesthetic can be reviewed against a real bitmap face; that is preview scaffolding and never ships. A substitute needs distinct uppercase and lowercase glyphs and real 400-700 weights, since components set `font-weight` 500 to 700 and synthetic bold smears a bitmap glyph. Silkscreen fails the first requirement: it draws the same glyph for both cases, which makes every heading read as shouting and hides real casing mistakes.
- **JS/TS Helpers**: Runtime DOM helpers such as a typed `createElement` wrapper are not planned. The package stays CSS-only.
- **Public JavaScript behavior**: Toast dismissal, focus management, and app-level theme state remain outside this package.
- **A primary that reads under a shade, in light theme**: considered, then re-measured and closed rather than left as a maybe. `.chunky-tile`'s bar mixes 72% of `--intent-border` into a fixed black (`--elevation-color: rgb(0 0 0)`, chosen so a hued intent's bar composites darker, not lighter, than its plate); a hued intent separates cleanly from its own plate this way (`.btn.success`: `1.88:1`, 56.6 units), but `.primary` is `light-dark(neutral-950, neutral-50)` -- near-black in light theme, matching the black the bar mixes toward, so the two collapse into each other (`1.04:1`, 10.4 units; confirmed in dark theme this is fine, `2.48:1`, 154 units, since a near-white plate contrasts easily against the same black-anchored bar). Not a bug with a clean fix: moving `--color-primary` off monochrome repaints every `.primary` everywhere for one aesthetic's benefit, and special-casing primary inside `.chunky-tile` alone breaks the one rule that makes every other intent's bar read consistently -- "a shade of itself," stated in the aesthetic's own doc comment. Documented instead, in `docs/usage/aesthetics.md`'s `.chunky-tile` exceptions.

- **Elevation coupled to size**: a bare `.elevation` that infers its level from a sibling `.sm`/`.lg` size class (`.btn.sm.elevation` reading as a small elevated button), with `.elevation-md` etc. as an explicit override, would read naturally, but was considered and rejected. `.sm.elevation` (two classes) has higher CSS specificity than `.elevation-md` (one class), so the explicit override would lose to the implicit pairing without extra plumbing to route around it -- plumbing no other modifier in the package needs, since none of them currently reads a sibling modifier's class to set its own default. That extra mechanism, just for this one pairing, is worse for a consumer to reason about than writing the elevation class explicitly every time.

## References

- [Model](./model.md)
- [Overview](../index.md)
- [Setup](../setup.md)
- [Concepts](../concepts.md)
- [Usage](../usage/index.md)
- [Integrating](../integrating/index.md)
- [Accessibility](../accessibility.md)
- [Tests](./tests.md)
