---
status: APPROVED
last_updated: 2026-09-27
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction and release readiness for `@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns the styling model itself.

Finished work is not tracked here. The current token contract, component coverage, and shipped aesthetics belong in the model and repository history, not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the supported machine-readable surface, and the public documentation owns the consumer contract under `docs/specs/packages-documentation.md`. This roadmap adds no support rules.

## Current Focus

**`0.5.0` is a local, unreleased draft**: `@codenhub/styles@0.4.0` remains the current npm version. Its scope is the foundation changes and the sketch aesthetic with its rounded variant, all implemented; the [0.5.0 changelog](../changelog/0.5.0.md) describes that scope.

The foundation was built for structure, not for a look. Any new material part must still pass [What enters the material contract](./model.md#what-enters-the-material-contract), independently of the aesthetic that would use it. An aesthetic the foundation cannot express without breaking that rule needs a separate decision before implementation.

## Planned

The aesthetics below were planned for `0.5.0` and moved out of it. They carry no release commitment. Each still needs its solo class, compiled and `/tw` exports, a registry entry, public documentation, playground coverage, and cross-browser tests when it lands.

Aesthetics compose the foundation rather than justify new tokens. Exact appearance, knobs, and browser fallbacks must be reviewed against real screens before claiming completion.

- **Glitch.** Static color split without built-in motion or slicing; hues come from intent or consumer knobs, not a preset palette ([R1](./model.md#rules-for-aesthetics)). Its treatment needs new visual references before implementation. Not started.
- **Synthwave/retro.** Visual references are awaited before defining its appearance, tokens, or implementation. No look has been selected.
- **Retro-OS bevel (`.retro-os`).** A raised two-tone edge with the standard press, not an inverted pressed bevel. A first implementation -- square corners, a 1px ink line, the two depth layers inset as a shade and a white highlight, and a grey surface face -- was built and rejected on review because it did not read as a retro OS; the design starts over from references. A two-tone bevel needs two depth layers with separate base colours, which the foundation no longer carries; whether the new design needs them is decided with it.

## Aesthetics assessed and deferred

Costed against the current model and not a fit. Recorded so the question is not reopened from scratch.

- **Liquid glass**: the refraction that defines it needs an SVG filter element in the DOM, which a CSS-only package cannot ship; the specular highlight is a surface-only treatment; `clip-path: path()` rejects percentages, so the silhouette cannot scale with the box; and `corner-shape: squircle` is Chrome-only. What is reachable without those is `.glass` with a heavier blur.

## Notes

Two measurements shaped the material tokens and outlive the change that needed them, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

`0.4.0` is the current published release. `0.5.0` remains untagged and unreleased until it is verified and released. Release authorization and tagging follow `docs/specs/packages-lifecycle.md`.

The stress-test pass's fixes, across all three screens, land as one minor (`0.2.0`) rather than a run of patches: several change default token values (`--progress-surface`, `--color-border`) that affect every consumer already using `.progress` or `.card.soft.edged`, not just new ones, which is a real behavior change and not patch-level even pre-1.0.

`0.5.0` is one minor because the cascade layers change what beats what for every consumer, and the edge-contrast fix and removals change default rendering. The sketch aesthetic is an opt-in addition to that release.

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
- [Cascade layers](./model.md#cascade-layers)
- [Accessibility](../accessibility.md)
- [Overview](../index.md)
- [Setup](../setup.md)
- [Concepts](../concepts.md)
- [Usage](../usage/index.md)
- [Integrating](../integrating/index.md)
- [Tests](./tests.md)
