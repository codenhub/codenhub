---
status: APPROVED
last_updated: 2026-08-14
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction for `@codenhub/styles`. It captures
styling-system improvements that should guide future changes without turning
this document into a release checklist. [Model](./model.md) owns the styling
model itself.

Finished work is not tracked here. The token contract, the element coverage it
was extended to, and the three shipped aesthetics are the model that Architecture
now describes, so the record of building them lives there and in the history
rather than in a list of completed stages.

## Supported surface

The package supports what it demonstrates and documents. A class combination
that is neither shown working in the playground nor described in the public docs
is not part of the contract, and making one behave is the consumer's concern
rather than a defect to fix here.

Two obligations follow, and they are the reason the rule is worth stating rather
than assuming. The playground may only render combinations that are supported,
because it is the demonstration half of that sentence: a row that resolves to
the same values as its neighbour, or to a control with no visible border, claims
support for something nobody maintains. And the public docs owe consumers the
rule explicitly, so the boundary is discoverable rather than inferred.

Applying this is what trimmed the playground's variant matrix down to a
per-component presentation set, and it is the reason the set moved again in
0.1.0: a component that reads presentation through `box` reads all of it, so the
rows a component used to ignore are now rows it answers. What is left narrow is
narrow for a stated reason, written beside each entry in `matrix.js` -- the six
text controls collapse their edge rows because the edge is floored, and the
indicators and the tooltip bubble show one row because they read no presentation
at all.

## Current Focus

**Phase 2 -- `0.1.0` stabilization**. Every component now composes `box`, or
records in `registry.json` why it takes less of it, and every one publishes the
resting pair it renders with no presentation class on it. `0.1.0` is the first
release of the current three-axis contract; the already-published `0.0.x`
versions predate it.

What is left is the consumer-facing half. The public documents under `docs/`
still describe the model 0.1.0 replaced -- `.flat`, `.out` and `.ghost` as
presentation, an edge with a scale, and the `--ui-edge` pair that the shadow
parts now draw -- so they have to be rewritten against [Model](./model.md) before
the release is honest. The visual baselines are wave-1 renderings and need
regenerating on CI.

## Planned

- **Rewrite the public documents**: `docs/classes.md` and `docs/tokens.md`
  against the shipped model, then `pnpm generate` for the derived files.
- **Regenerate the visual baselines** on CI, once the matrix has settled.

## Later / Possible

- **WCAG AA text contrast**: Raise filled success and warning component text
  contrast to WCAG 1.4.3's 4.5:1 threshold for normal text. Their current
  neutral-50 foreground over emerald-600 and amber-600 backgrounds reaches only
  about 3.5:1 and 3.1:1; the browser test currently enforces 3:1.
- **Preview split**: Promote the playground to a demo application and leave a
  minimal fixture playground behind it for tests. Only worth doing once the
  matrix has stopped moving, because the two would otherwise drift. It waits on
  Phase 2: a demo must not show combinations the package does not support, and
  Phase 2 is what decides whether the components under-reading presentation widen
  or are declared intent-only.

## Notes

Two measurements shaped the material tokens and outlive the change that needed
them, so both live in Architecture rather than here. A no-op `clip-path` or
`backdrop-filter` costs nothing in any baseline engine -- no compositing layer, no
containing block, no stacking context, literal or behind a `var()` fallback --
which is what made the token route possible at all
([The cost of a no-op](./architecture.md#the-cost-of-a-no-op)). And an indirect
token resolves its `var()` references once, on the element that declares it,
which is why a shape pair needs two token slots rather than one
([Indirect tokens resolve once](./architecture.md#indirect-tokens-resolve-once)).

## Versioning

`0.1.0` is the next release. Package consumers do not gate its stability: they
may change while this package settles. The package stays on `0.x` while the public
contract remains young, so necessary breaking corrections stay explicit and
cheap. Documentation status is `active`: package is supported for normal
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
- [Architecture](./architecture.md) -- superseded, kept for its measurements
- [Overview](../index.md)
- [Tokens](../tokens.md)
- [Classes](../classes.md)
- [Accessibility](../accessibility.md)
- [Tests](./tests.md)
