---
status: APPROVED
last_updated: 2026-08-21
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction and release readiness for
`@codenhub/styles` without duplicating issue tracking. [Model](./model.md) owns
the styling model itself.

Finished work is not tracked here. The current token contract, component
coverage, and shipped aesthetics belong in the model and repository history,
not in a completed-work checklist.

## Supported surface

[Model](./model.md) defines the styling contract, `registry.json` records the
supported machine-readable surface, and the public documentation owns the
consumer contract under `docs/specs/packages-documentation.md`. This roadmap
adds no support rules.

## Current Focus

**`0.1.0` stabilization.** The public docs have had their consumer-focused,
task-oriented reformulation. What remains is closing the current review and
turning any outstanding problem findings into a clear, finite release path.

## Planned

`0.1.0` is complete when all of these outcomes hold:

- **Internal sources are stable**: [Model](./model.md), `registry.json`, the test
  strategy, roadmap, and applicable package exceptions agree on the current
  contract and release direction.
- **The current review is closed**: every review thread and finding on the
  release PR is resolved, or explicitly dismissed after the relevant behavior or
  document has been verified. This roadmap does not duplicate that finding list.
- **Public docs are final**: README and public docs satisfy
  `docs/specs/packages-readme.md` and `docs/specs/packages-documentation.md`,
  cover every `package.json` export, and match current behavior. Running
  `pnpm generate styles` leaves all derived documentation current.
- **Validation is clean**: `pnpm verify --changed` passes for the release
  candidate.
- **The PR is merge-ready**: all required PR checks are green and the PR is
  mergeable with no unresolved blocking review thread or finding.

Publishing is a separate gate and a repository-level one. Neither trusted
publishing from CI nor a versioning and changelog workflow exists yet -- both are
open items under `@codenhub` in [the repository roadmap](../../../../docs/roadmap.md)
-- so `0.1.0` goes out as a manual `npm publish`, which
`docs/specs/packages-lifecycle.md` allows. The jump from the published `0.0.4`
carries the whole model rewrite, so the release notes are the only place a
consumer can find out what moved.

## Later / Possible

- **A primary that reads under a shade**: the shipped `.primary` is a monochrome
  near-black, so a chunky tile's bar under a primary button lands about 10 units
  of sRGB distance from the plate above it -- present, and almost invisible. The
  six hue intents separate cleanly. This is a palette question rather than an
  aesthetic one, and it is the same root as the filled-contrast item above:
  neither is free to move without changing what the intent looks like.

- **Elevation coupled to size**: `.sm`/`.lg` already exist as the size
  modifier's class names; a bare `.elevation` that infers its level from a
  sibling `.sm`/`.lg` on the same element (`.btn.sm.elevation` for a small
  elevated button), with `.elevation-md` etc. as an explicit override
  (`.btn.sm.elevation-md`), would read naturally. Shelved rather than built:
  `.sm.elevation` (two classes) has higher CSS specificity than
  `.elevation-md` (one class), so the explicit override would lose to the
  implicit pairing without extra plumbing, and no other modifier in the
  package currently reads a sibling modifier's class to set its own default --
  this would be the first. A maybe, not a target: only worth doing if a clean
  fix for the specificity problem turns up that does not make elevation a
  special case among the modifiers.

- **Preview split**: Promote the playground to a demo application and leave a
  minimal fixture playground behind it for tests. Only worth doing once the
  supported surface and consumer documentation are stable, because the two
  applications would otherwise drift. A demo must not show combinations the
  package does not support.

## Aesthetics assessed and deferred

Both were costed against the current model and neither fits it. Recorded so the
question is not reopened from scratch.

- **Liquid glass**: the refraction that defines it needs an SVG filter element in
  the DOM, which a CSS-only package cannot ship; the specular highlight is a
  surface-only treatment; `clip-path: path()` rejects percentages, so the
  silhouette cannot scale with the box; and `corner-shape: squircle` is
  Chrome-only. What is reachable without those is `.glass` with a heavier blur.

- **Synthwave / retro**: its signatures are palette, which [R1](./model.md#rules-for-aesthetics)
  bars an aesthetic from setting. The glow is `--ui-shadow-blur` scaled by
  elevation, and 18 of the 21 components rest at zero elevation, so it would
  reach three of them. `text-shadow` does not inherit into `<button>` or
  `<input>`, and the grid and scanline backgrounds need a painted layer `box` does
  not have. Shipping it would mean either breaking R1 or adding a background-image
  slot, and neither is worth doing before `0.1.0`.

## Notes

Two measurements shaped the material tokens and outlive the change that needed
them, so both live in [Model](./model.md) rather than here: a no-op `clip-path`
or `backdrop-filter` costs nothing in any baseline engine
([The cost of a no-op](./model.md#the-cost-of-a-no-op)), and an indirect token
resolves its `var()` references once, on the element that declares it, which is
why a shape pair needs two token slots rather than one
([Indirect tokens resolve once](./model.md#indirect-tokens-resolve-once)).

## Versioning

`0.1.0` is the next release. The package stays on `0.x` while the public contract
remains young, so necessary breaking corrections stay explicit and cheap.
Documentation status remains `active`: the package is supported for normal
consumer use, not frozen against future semver-major changes.

## Not Planned

- **Neumorphism**: Its defining trait is a borderless control distinguished only
  by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped
  unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace.
  The package ships no font binary and stays free of network side effects. The
  playground supplies Pixelify Sans from a CDN so the aesthetic can be reviewed
  against a real bitmap face; that is preview scaffolding and never ships. A
  substitute needs distinct uppercase and lowercase glyphs and real 400-700
  weights, since components set `font-weight` 500 to 700 and synthetic bold
  smears a bitmap glyph. Silkscreen fails the first requirement: it draws the
  same glyph for both cases, which makes every heading read as shouting and hides
  real casing mistakes.
- **JS/TS Helpers**: Runtime DOM helpers such as a typed `createElement` wrapper
  are not planned. The package stays CSS-only.
- **Public JavaScript behavior**: Toast dismissal, focus management, and
  app-level theme state remain outside this package.

## References

- [Model](./model.md)
- [Overview](../index.md)
- [Setup](../setup.md)
- [Concepts](../concepts.md)
- [Usage](../usage/index.md)
- [Integrating](../integrating/index.md)
- [Accessibility](../accessibility.md)
- [Tests](./tests.md)
