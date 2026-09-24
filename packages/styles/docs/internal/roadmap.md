---
status: APPROVED
last_updated: 2026-09-24
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction and release readiness for `@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns the styling model itself.

Finished work is not tracked here. The current token contract, component coverage, and shipped aesthetics belong in the model and repository history, not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the supported machine-readable surface, and the public documentation owns the consumer contract under `docs/specs/packages-documentation.md`. This roadmap adds no support rules.

## Current Focus

**`0.5.0` is cut** and ships once its pull request is merged and the merge is tagged; `@codenhub/styles@0.4.0` is the current npm version until then. It is a foundation release and ships no new aesthetic: the cascade layers, per [`cascade-layers.md`](./cascade-layers.md); the structure the material contract did not express, per [`structure.md`](./structure.md); the boundary contrast of a line over its own plate and of controls under glass and chunky tile, per [`boundary-contrast.md`](./boundary-contrast.md); a stylesheet that survives inlining; the theme on every entry that promises it; and the removal of three alias sets. [`docs/changelog/0.5.0.md`](../changelog/0.5.0.md) records it, leading with the layers' breaking change.

The foundation is built for structure, not for a look. Each structural item was decided in its own document before it was built, under [What enters the material contract](./model.md#what-enters-the-material-contract), and the same holds for whatever comes next. No item is justified by the aesthetic that would use it; [Later / Possible](#later--possible) lists those as compositions of the foundation, not as reasons for it.

## Planned

Nothing is planned past `0.5.0` yet. [Later / Possible](#later--possible) holds the aesthetics wanted next.

## Later / Possible

Aesthetics are compositions of the foundation, not reasons for it. The four below are wanted after `0.5.0`. Each records the parts it would compose from and the questions that stay its own; a look the foundation cannot express without breaking a guarantee waits, rather than bending the model.

- **Glitch.** A colour split (offset copies in two hues) and a slice or jitter motion. Would compose from the second depth layer or the label shadow for the split. The movement has no token: ambient motion is [not exposed](./structure.md#7-ambient-motion), so it would be the application's own animation. Its own questions: fixed hues sit close to what [R1](./model.md#rules-for-aesthetics) bars; whether it is a cascading aesthetic or an effect on a single element; and the maintainer has further direction for it. Not started.
- **Sketch.** A hand-drawn look: uneven elliptical corners, an ink line, and a small offset shadow. The corners are a plain `--ui-radius`/`--ui-radius-surface` value (`255px 15px 225px 15px / 15px 225px 15px 255px`, for example); chips take a single length through `--ui-radius-tight`, so the checkbox's `min()` cap no longer turns invalid, and they take a plain corner rather than a wobble. Would compose from `--ui-line-style` for a dashed or dotted line; the offset shadow is the existing parts. A handwriting face would be consumer-supplied, the way `.pixel` reads `--font-pixel`. Not started.
- **Synthwave / retro.** A glow, a grid or scanline ground, and glowing labels. Would compose from the halo, `--ui-surface-image`, and the label shadow. Its own question: its signature is palette, which [R1](./model.md#rules-for-aesthetics) gives to intent, so the hues come from the application's palette or a published knob in the way `--cyber-ink` works, never from the aesthetic. Not started.
- **Retro-OS bevel.** The raised two-tone edge of a late-90s desktop UI, light top-left and dark bottom-right, with a press that inverts the two. Would compose from two inset layers -- the first and `--ui-shadow-2-*`. The inverting press needs a pressed counterpart for the second layer, which [Structure](./structure.md#4-depth-in-layers) left until a component needs it, and `outset`/`inset` line styles were not taken. Not started.

## Aesthetics assessed and deferred

Costed against the current model and not a fit. Recorded so the question is not reopened from scratch.

- **Liquid glass**: the refraction that defines it needs an SVG filter element in the DOM, which a CSS-only package cannot ship; the specular highlight is a surface-only treatment; `clip-path: path()` rejects percentages, so the silhouette cannot scale with the box; and `corner-shape: squircle` is Chrome-only. What is reachable without those is `.glass` with a heavier blur.

## Notes

Two measurements shaped the material tokens and outlive the change that needed them, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

`0.4.0` is the current published release, cut through the same tag workflow as `0.2.0` and `0.3.0` before it, and `0.5.0` is cut to follow it the same way. `0.1.0` carried the whole model rewrite over the manually published `0.0.4`; `0.1.1` is the first version cut through the tag workflow -- pushing `@codenhub/styles@0.1.1` triggered `.github/workflows/publish.yml`, which publishes through trusted publishing with provenance and refuses a tag whose version disagrees with the manifest. Every release from here follows that path.

The stress-test pass's fixes, across all three screens, land as one minor (`0.2.0`) rather than a run of patches: several change default token values (`--progress-surface`, `--color-border`) that affect every consumer already using `.progress` or `.card.soft.edged`, not just new ones, which is a real behavior change and not patch-level even pre-1.0.

`0.5.0` is one minor for the same reason: the cascade layers change what beats what for every consumer, and the edge-contrast fix and any removal change default rendering, so the foundation lands together rather than as a run of releases each breaking a little.

The package stays on `0.x` while the public contract is still young, so a necessary breaking correction stays explicit and cheap. Documentation status remains `active`: supported for normal consumer use, not frozen against future semver-major changes.

## Not Planned

- **Removing `.theme-light` and `.theme-dark`**: named with the aliases `0.5.0` removed, and kept. `@codenhub/theme` writes a `theme-<name>` class by default, and the toaster's standalone fallback reads it, so it is not a second name nothing uses.
- **Neumorphism**: Its defining trait is a borderless control distinguished only by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace. The package ships no font binary and stays free of network side effects. The playground supplies Pixelify Sans from a CDN so the aesthetic can be reviewed against a real bitmap face; that is preview scaffolding and never ships. A substitute needs distinct uppercase and lowercase glyphs and real 400-700 weights, since components set `font-weight` 500 to 700 and synthetic bold smears a bitmap glyph. Silkscreen fails the first requirement: it draws the same glyph for both cases, which makes every heading read as shouting and hides real casing mistakes.
- **JS/TS Helpers**: Runtime DOM helpers such as a typed `createElement` wrapper are not planned. The package stays CSS-only.
- **Public JavaScript behavior**: Toast dismissal, focus management, and app-level theme state remain outside this package.
- **A primary that reads under a shade, in light theme**: considered, then re-measured and closed rather than left as a maybe. `.chunky-tile`'s bar mixes 72% of `--intent-border` into a fixed black (`--elevation-color: rgb(0 0 0)`, chosen so a hued intent's bar composites darker, not lighter, than its plate); a hued intent separates cleanly from its own plate this way (`.btn.success`: `1.88:1`, 56.6 units), but `.primary` is `light-dark(neutral-950, neutral-50)` -- near-black in light theme, matching the black the bar mixes toward, so the two collapse into each other (`1.04:1`, 10.4 units; confirmed in dark theme this is fine, `2.48:1`, 154 units, since a near-white plate contrasts easily against the same black-anchored bar). Not a bug with a clean fix: moving `--color-primary` off monochrome repaints every `.primary` everywhere for one aesthetic's benefit, and special-casing primary inside `.chunky-tile` alone breaks the one rule that makes every other intent's bar read consistently -- "a shade of itself," stated in the aesthetic's own doc comment. Documented instead, in `docs/usage/aesthetics.md`'s `.chunky-tile` exceptions.

- **Elevation coupled to size**: a bare `.elevation` that infers its level from a sibling `.sm`/`.lg` size class (`.btn.sm.elevation` reading as a small elevated button), with `.elevation-md` etc. as an explicit override, would read naturally, but was considered and rejected. `.sm.elevation` (two classes) has higher CSS specificity than `.elevation-md` (one class), so the explicit override would lose to the implicit pairing without extra plumbing to route around it -- plumbing no other modifier in the package needs, since none of them currently reads a sibling modifier's class to set its own default. That extra mechanism, just for this one pairing, is worse for a consumer to reason about than writing the elevation class explicitly every time.

## References

- [Model](./model.md)
- [Cascade layers](./cascade-layers.md)
- [Accessibility](../accessibility.md)
- [Overview](../index.md)
- [Setup](../setup.md)
- [Concepts](../concepts.md)
- [Usage](../usage/index.md)
- [Integrating](../integrating/index.md)
- [Tests](./tests.md)
