---
status: APPROVED
last_updated: 2026-09-10
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction and release readiness for `@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns the styling model itself.

Finished work is not tracked here. The current token contract, component coverage, and shipped aesthetics belong in the model and repository history, not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the supported machine-readable surface, and the public documentation owns the consumer contract under `docs/specs/packages-documentation.md`. This roadmap adds no support rules.

## Current Focus

**Exercising the shipped model.** `0.1.0` and `0.1.1` are on npm, `0.1.1` published from its tag through the repository's trusted-publishing workflow. The model, the machine-checked contract, and the shipped aesthetics are all in place; what is not yet known is how they hold up in anger. The near-term work is a deliberate stress-test -- build real screens with the package and record where it is strong, where it fights back, what a consumer reaches for and cannot find, and what ships but goes unused.

## Planned

- **Stress-test pass.** Compose non-trivial, real-world screens against the published package -- forms, tables, toolbars, dialogs, a dense app shell -- under each shipped aesthetic and both themes. The output is a written findings list: friction points, missing primitives, combinations that read wrong, and classes or tokens nothing exercises.
- **Feed findings back into the contract.** Anything the stress-test turns up that changes behavior, the token surface, or the supported class list goes through a normal versioned change: [Model](./model.md) and `registry.json` first, then the public docs, then a `docs/changelog/` entry. `hub release --cut` raises the version and scaffolds the entry; the `changelog` check makes skipping it impossible.
- **Decide what to drop.** A `0.x` line is the window for removing surface that is not earning its place. Candidates are named here first, with the reason, before they are removed.

## Later / Possible

- **A primary that reads under a shade**: the shipped `.primary` is a monochrome near-black, so a chunky tile's bar under a primary button lands about 10 units of sRGB distance from the plate above it -- present, and almost invisible. The six hue intents separate cleanly. This is a palette question rather than an aesthetic one: `.primary` cannot move without changing what it looks like everywhere it is used.

- **Elevation coupled to size**: `.sm`/`.lg` already exist as the size modifier's class names; a bare `.elevation` that infers its level from a sibling `.sm`/`.lg` on the same element (`.btn.sm.elevation` for a small elevated button), with `.elevation-md` etc. as an explicit override (`.btn.sm.elevation-md`), would read naturally. Shelved rather than built: `.sm.elevation` (two classes) has higher CSS specificity than `.elevation-md` (one class), so the explicit override would lose to the implicit pairing without extra plumbing, and no other modifier in the package currently reads a sibling modifier's class to set its own default -- this would be the first. A maybe, not a target: only worth doing if a clean fix for the specificity problem turns up that does not make elevation a special case among the modifiers.

- **Fixture-only playground**: `demo/` reuses the playground pages as a branded, deployable reference, aggregated by `apps/demo`. The playground still doubles as the test-fixture surface for `tests/browser/`. Not urgent, but a standing itch rather than a someday idea: three consumers rewriting the same markup for different purposes is real friction every time a fixture changes, and it is due to be trimmed to a minimal fixture set behind the demo as soon as there is room for it -- right after the stress-test pass above, since that pass will move fixtures around anyway and trimming first would mean redoing the work.

  Until then, a change to a `playground/*/index.html` page touches three consumers at once: `dev` and `debug` both `root` at `playground/`, `demo`'s Vite build rewrites those same pages (inlining `shared/playground.js` and `shared/matrix.js`, which cannot be modules because `playground.js` `document.write`s its stylesheet link; stripping the `@source` at-rules the prod CSS minifier rejects; forcing `?env=vanilla`), and `tests/browser/*.spec.ts` asserts against the `data-testid`s in the markup. So a fixture edit needs `pnpm test:browser styles` and a `pnpm --filter=@codenhub/styles-demo build` to be trusted. The cheapest first step, when this is picked up, is making `playground.js` and `matrix.js` real ES modules so `demo`'s rewrite plugin shrinks to just the chrome injection.

- **`dark:` variant under system preference**: the `@custom-variant dark` in `theme.css` now covers all three explicit spellings (`.dark`, `.theme-dark`, `[data-theme="dark"]`) but deliberately not `prefers-color-scheme: dark`, so a consumer's `dark:` utilities do not respond to the OS default the way the token palette does through `light-dark()`. Adding a system arm is possible but cannot cleanly exclude a forced-light subtree in a single `@custom-variant`, so it would be an imperfect match to the "explicit selector decides" rule the theme model states. Not urgent, but a real inconsistency rather than a hypothetical one -- worth a proper design pass and a fix as soon as there is time for one, once a way to exclude a forced-light subtree cleanly turns up.

## Aesthetics assessed and deferred

Both were costed against the current model and neither fits it. Recorded so the question is not reopened from scratch.

- **Liquid glass**: the refraction that defines it needs an SVG filter element in the DOM, which a CSS-only package cannot ship; the specular highlight is a surface-only treatment; `clip-path: path()` rejects percentages, so the silhouette cannot scale with the box; and `corner-shape: squircle` is Chrome-only. What is reachable without those is `.glass` with a heavier blur.

- **Synthwave / retro**: its signatures are palette, which [R1](./model.md#rules-for-aesthetics) bars an aesthetic from setting. The glow is `--ui-shadow-blur` scaled by elevation, and 18 of the 21 components rest at zero elevation, so it would reach three of them. `text-shadow` does not inherit into `<button>` or `<input>`, and the grid and scanline backgrounds need a painted layer `box` does not have. Shipping it would mean either breaking R1 or adding a background-image slot, and neither is worth doing until the stress-test pass shows the model needs a painted layer for something else.

## Notes

Two measurements shaped the material tokens and outlive the change that needed them, so both live in [Model](./model.md) rather than here: a no-op `clip-path` or `backdrop-filter` costs nothing in any baseline engine ([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token resolves its `var()` references once, on the element that declares it, which is why a shape pair needs two token slots rather than one ([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

`0.1.1` is the current release. `0.1.0` carried the whole model rewrite over the manually published `0.0.4`; `0.1.1` is the first version cut through the tag workflow -- pushing `@codenhub/styles@0.1.1` triggered `.github/workflows/publish.yml`, which publishes through trusted publishing with provenance and refuses a tag whose version disagrees with the manifest. Every release from here follows that path.

The package stays on `0.x` while the public contract is still young, so a necessary breaking correction stays explicit and cheap. Documentation status remains `active`: supported for normal consumer use, not frozen against future semver-major changes.

## Not Planned

- **Neumorphism**: Its defining trait is a borderless control distinguished only by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace. The package ships no font binary and stays free of network side effects. The playground supplies Pixelify Sans from a CDN so the aesthetic can be reviewed against a real bitmap face; that is preview scaffolding and never ships. A substitute needs distinct uppercase and lowercase glyphs and real 400-700 weights, since components set `font-weight` 500 to 700 and synthetic bold smears a bitmap glyph. Silkscreen fails the first requirement: it draws the same glyph for both cases, which makes every heading read as shouting and hides real casing mistakes.
- **JS/TS Helpers**: Runtime DOM helpers such as a typed `createElement` wrapper are not planned. The package stays CSS-only.
- **Public JavaScript behavior**: Toast dismissal, focus management, and app-level theme state remain outside this package.

## References

- [Model](./model.md)
- [Overview](../index.md)
- [Setup](../setup.md)
- [Concepts](../concepts.md)
- [Usage](../usage/index.md)
- [Integrating](../integrating/index.md)
- [Accessibility](../accessibility.md)
- [Tests](./tests.md)
