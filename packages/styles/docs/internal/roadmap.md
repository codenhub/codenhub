---
status: APPROVED
last_updated: 2026-09-13
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction and release readiness for `@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns the styling model itself.

Finished work is not tracked here. The current token contract, component coverage, and shipped aesthetics belong in the model and repository history, not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the supported machine-readable surface, and the public documentation owns the consumer contract under `docs/specs/packages-documentation.md`. This roadmap adds no support rules.

## Current Focus

**Between passes.** `0.1.0` and `0.1.1` are on npm; that is still the current release. The stress-test pass across all three planned screens (`app-shell/`, `form/`, `settings/`) is complete -- every finding it turned up is landed, documented, or explicitly deferred; see [findings](./stress-test-findings.md) for the record and [Planned](#planned) for what is left before it ships. Next focus is being chosen from [Later / Possible](#later--possible) below.

## Planned

- **Cut `0.2.0`.** Every stress-test finding is landed, documented, or explicitly deferred; nothing is blocked on a decision. What is left is mechanical: `hub release --cut=minor` raises the version and scaffolds `docs/changelog/0.2.0.md`, then `docs/internal/next-release.md`'s draft text is transcribed into it and both scratch docs retire.
- **Decide what to drop.** A `0.x` line is the window for removing surface that is not earning its place. Candidates are named here first, with the reason, before they are removed.

## Later / Possible

- **Fixture-only playground**: `demo/` reuses the playground pages as a branded, deployable reference, aggregated by `apps/demo`. The playground still doubles as the test-fixture surface for `tests/browser/`. Not urgent, but a standing itch rather than a someday idea: three consumers rewriting the same markup for different purposes is real friction every time a fixture changes, and it is due to be trimmed to a minimal fixture set behind the demo now that the stress-test pass is done -- that pass moved fixtures around by design (`form/`, `settings/` both new), and trimming earlier would have meant redoing the work.

  The mechanical half of the coupling is done ahead of that, since it does not depend on which fixtures exist and would only have been redone otherwise: `playground.js` and `matrix.js` are real ES modules now, loaded the same way by `dev`, `debug`, and the built `demo`, so `demo`'s Vite plugin no longer inlines either as a string or patches `document.write`. The one piece that stays a classic, `document.write`ing script is `env-stylesheet.js` -- extracted out of `playground.js` -- because picking the vanilla/build stylesheet still has to happen before first paint, which only a synchronous script can do; the built `demo` drops its tag entirely rather than special-casing it, since a deployed reference always runs one build and needs no such comparison. `playground.js` also no longer reaches into the DOM by `.playground-nav`'s class name to hand a chrome layer its nav: it dispatches a `playground:nav-ready` `CustomEvent` carrying the nav and its wired controls once they exist, and `demo/chrome.ts` listens for it, so neither a class rename nor DOMContentLoaded registration order can break the hand-off silently.

  Until the fixture set itself is trimmed, a change to a `playground/*/index.html` page still touches three consumers at once: `dev` and `debug` both `root` at `playground/`, the built `demo` still bundles the same pages under its own chrome, and `tests/browser/*.spec.ts` asserts against the `data-testid`s in the markup. So a fixture edit still needs `pnpm test:browser styles` and a `pnpm --filter=@codenhub/styles-demo build` to be trusted.

## Aesthetics assessed and deferred

Both were costed against the current model and neither fits it. Recorded so the question is not reopened from scratch.

- **Liquid glass**: the refraction that defines it needs an SVG filter element in the DOM, which a CSS-only package cannot ship; the specular highlight is a surface-only treatment; `clip-path: path()` rejects percentages, so the silhouette cannot scale with the box; and `corner-shape: squircle` is Chrome-only. What is reachable without those is `.glass` with a heavier blur.

- **Synthwave / retro**: its signatures are palette, which [R1](./model.md#rules-for-aesthetics) bars an aesthetic from setting. The glow is `--ui-shadow-blur` scaled by elevation, and 18 of the 21 components rest at zero elevation, so it would reach three of them. `text-shadow` does not inherit into `<button>` or `<input>`, and the grid and scanline backgrounds need a painted layer `box` does not have. Shipping it would mean either breaking R1 or adding a background-image slot, and neither is worth doing on the strength of one aesthetic alone -- the stress-test pass is complete now and never surfaced a need for a painted layer elsewhere either.

## Notes

Two measurements shaped the material tokens and outlive the change that needed them, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

`0.1.1` is the current release. `0.1.0` carried the whole model rewrite over the manually published `0.0.4`; `0.1.1` is the first version cut through the tag workflow -- pushing `@codenhub/styles@0.1.1` triggered `.github/workflows/publish.yml`, which publishes through trusted publishing with provenance and refuses a tag whose version disagrees with the manifest. Every release from here follows that path.

The stress-test pass's fixes, across all three screens, land as one minor (`0.2.0`) rather than a run of patches: several change default token values (`--progress-surface`, `--color-border`) that affect every consumer already using `.progress` or `.card.soft.edged`, not just new ones, which is a real behavior change and not patch-level even pre-1.0. Not cut yet -- see [Planned](#planned).

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
