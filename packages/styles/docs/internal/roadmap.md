---
status: APPROVED
last_updated: 2026-09-17
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction and release readiness for `@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns the styling model itself.

Finished work is not tracked here. The current token contract, component coverage, and shipped aesthetics belong in the model and repository history, not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the supported machine-readable surface, and the public documentation owns the consumer contract under `docs/specs/packages-documentation.md`. This roadmap adds no support rules.

## Current Focus

**`0.2.0` is merged, tagged, and published.** The stress-test pass across all three planned screens (`app-shell/`, `form/`, `settings/`) is complete -- every finding it turned up is landed, documented, or deferred, and is recorded in [`docs/changelog/0.2.0.md`](../changelog/0.2.0.md). `@codenhub/styles@0.2.0` is the current published npm version. [Planned](#planned) is what is left. [Later / Possible](#later--possible) holds one deferred, not-yet-started ask.

**`.progress` gains real track presentation, cut as `0.3.0`**, per the `APPROVED` decision in [`docs/internal/progress-presentation-axes.md`](./progress-presentation-axes.md): the track now composes a fill and an edge like every other presentation-reading component, while the value fill stays `--intent-color` at full strength. This changes the rendered output of every existing `.progress` consumer, so it ships the same way `0.2.0`'s `--progress-surface` change did -- as a minor, not a patch. See [`docs/changelog/0.3.0.md`](../changelog/0.3.0.md), including its recorded WCAG 1.4.11 known issue on the new default.

**A generated `./palette` export lands, also cut as `0.3.0`**, per the `APPROVED` decision in [`docs/internal/generated-palette.md`](./generated-palette.md): every `intent x presentation` cell's composed `bg`/`fg`/`edge`, rest and hover, light and dark, baked to flat `--palette-*` custom properties for a consumer that cannot take this package as a build-time dependency. The generator (`packages/styles/scripts/generate-palette.mjs`, run through `packages/tools`' `styles-palette` `pnpm generate` step) reads real composed values from a real headless browser rather than reimplementing `color-mix()` math by hand, and `tests/browser/palette.spec.ts` checks every baked value against a freshly live-composed one on every run. This is additive, new public surface rather than a default-value change.

## Planned

- **Decide what to drop.** A `0.x` line is the window for removing surface that is not earning its place. Candidates are named here first, with the reason, before they are removed.

## Later / Possible

- **A literal (non-token) translucent surface utility.** `@codenhub/toaster` wants a way for a consumer to apply a real glass/blur treatment to its toast and dialog surfaces without `@codenhub/toaster` depending on this package or consuming its component classes. The existing `.glass` aesthetic only reassigns `--ui-*` material tokens (see [Model](./model.md)), which a foreign component's own CSS must already read for anything to change -- toaster's CSS does not, and is not planned to compose translucent/alpha-mixed backgrounds this session. What toaster's own escape hatch (a per-instance/per-call `className`) actually needs is a self-contained utility class with literal `background`/`backdrop-filter`/`border-radius`/`box-shadow` values (the same values `.glass` already assembles from `--ui-bg-alpha`, `--ui-backdrop`, `--ui-surface-ground`, `--ui-surface-shadow`), so that applying just that one class to an arbitrary element works regardless of whether that element reads any `--ui-*` token. This is smaller than the rejected "Liquid glass" above (no refraction, no specular highlight) and reuses values the aesthetic already computes; it cannot be named `.glass` (already taken by the token-only aesthetic) and is new public API surface, so it needs its own exports/README/docs pass when picked up. Not started.

## Aesthetics assessed and deferred

Both were costed against the current model and neither fits it. Recorded so the question is not reopened from scratch.

- **Liquid glass**: the refraction that defines it needs an SVG filter element in the DOM, which a CSS-only package cannot ship; the specular highlight is a surface-only treatment; `clip-path: path()` rejects percentages, so the silhouette cannot scale with the box; and `corner-shape: squircle` is Chrome-only. What is reachable without those is `.glass` with a heavier blur.

- **Synthwave / retro**: its signatures are palette, which [R1](./model.md#rules-for-aesthetics) bars an aesthetic from setting. The glow is `--ui-shadow-blur` scaled by elevation, and 18 of the 21 components rest at zero elevation, so it would reach three of them. `text-shadow` does not inherit into `<button>` or `<input>`, and the grid and scanline backgrounds need a painted layer `box` does not have. Shipping it would mean either breaking R1 or adding a background-image slot, and neither is worth doing on the strength of one aesthetic alone -- the stress-test pass is complete now and never surfaced a need for a painted layer elsewhere either.

## Notes

Two measurements shaped the material tokens and outlive the change that needed them, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

`0.2.0` is the current published release, cut through the same tag workflow as `0.1.1` before it. `0.1.0` carried the whole model rewrite over the manually published `0.0.4`; `0.1.1` is the first version cut through the tag workflow -- pushing `@codenhub/styles@0.1.1` triggered `.github/workflows/publish.yml`, which publishes through trusted publishing with provenance and refuses a tag whose version disagrees with the manifest. Every release from here follows that path.

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
