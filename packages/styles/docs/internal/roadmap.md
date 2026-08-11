---
status: APPROVED
last_updated: 2026-08-11
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction for `@codenhub/styles`. It captures
styling-system improvements that should guide future changes without turning
this document into a release checklist. [Architecture](./architecture.md) owns
the styling model itself.

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
per-component presentation set. The combinations dropped there are recorded in
[Architecture](./architecture.md#presentation-is-narrower-than-its-class-list)
alongside why each one is degenerate, so a future change can tell a deliberate
omission from an oversight.

## Planned

Work is staged. Each stage lands as one reviewable change with `pnpm verify`
green before the next begins.

- **Stage 1 -- Token contract (done)**: Collapse the duplicated per-component intent
  blocks into the shared `--intent-*` contract, add the material token set, and
  declare color tokens once with `light-dark()`. Convert input icons from
  per-theme hardcoded SVG data URIs to masks over `currentColor`.
- **Stage 2 -- Element coverage (done)**: Extend intent and presentation to form
  controls, content elements, feedback, and the new `.card` and `.panel`
  surfaces. Surfaces activate `--elevation-*` and `--surface-hover-transform`,
  which no component reads today.
- **Stage 3 -- Aesthetics (done)**: Ship `.neobrutalism`, `.glass`, and `.pixel`
  from opt-in entrypoints, with the compatibility matrix and playground coverage.
- **Stage 4 -- Composition contract**: Close the gaps where the three axes meet a
  component that only partly implements them. The stage runs in three changes,
  because the rules decide half the answers and had to come first.

  The gate is settled. `clip-path: none` and `backdrop-filter: none` cost nothing
  in any baseline engine -- no compositing layer, no containing block, no stacking
  context, literal or behind a `var()` fallback. The claim that they did was
  false, and correcting it is what opened the token route. A second measurement
  narrowed that route: an indirect token resolves its `var()` references once, on
  the element that declares it, so one shape token cannot serve components that
  override the unit it is built from. Both are recorded under
  [The cost of a no-op](./architecture.md#the-cost-of-a-no-op) and
  [Indirect tokens resolve once](./architecture.md#indirect-tokens-resolve-once).

  - **Stage 4a -- Axis rules (docs only)**: State what each axis may declare, what
    a presentation class promises, what a component may clamp and how it must
    declare the bound, and the precedence when two axes want the same
    declaration. Record the conformance gaps rather than fixing them. Lands as
    [Axis rules](./architecture.md#axis-rules) with no behavior change.

  - **Stage 4b -- Shape reaches elements**: Make aesthetic shape a token the
    component consumes rather than a rule the aesthetic applies, per A4. One token
    slot per unit, since a chip overrides the unit its shape is built from.
    `native.css` picks the shape up for free, because `@apply` copies the
    component's own declarations. The ink and the brutalist shadow keep their
    component-scoped selector lists: those must resolve against the component's
    own intent, which the second measurement above makes non-negotiable.

  - **Stage 4c -- Conformance**: Fix what 4a recorded, in slices. The chip border
    ceiling; the control border floor; `.switch` reading its material; `.error`
    stopping being a component; and a decision for each component that reads one
    presentation token or none. Each slice widens the playground matrix back or
    narrows it deliberately.

    Progress is decided: it keeps a border, clamped to 1px however thick the
    aesthetic and presentation ask, and blends the line toward its fill per P5.
    `.out` then reads as a real 1px outline on a 10px track instead of eating 8px
    of it, and `.flat` blends away as it was always meant to, which makes it
    degenerate with plain and drops it from the matrix. The alternative -- refusing
    the border axis outright -- was rejected because a thin outline is legitimate
    on a low-contrast background.

- **Stage 5 -- Documentation**: Split public docs into concepts, reference, and
  guides so the three-axis model is explained before the lookup tables. State the
  supported-surface rule above, and per component which axes it reads.

- **Stage 6 -- Preview split**: Promote the playground to a demo application and
  leave a minimal fixture playground behind it for tests. Only worth doing once
  the matrix has stopped moving, because the two would otherwise drift. It depends
  on Stage 4: a demo must not show combinations the package does not support, and
  Stage 4 is what decides whether the components under-reading presentation widen
  or are declared intent-only.

## Versioning

`0.2.0` is the next release. The package stays on `0.x` until it is genuinely
depended on by another package and has held still under that use. Reaching `1.0.0`
earlier would only buy a stream of major versions, because every correction to a
contract this young is a breaking change; staying on `0.x` keeps those honest and
cheap.

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

- [Architecture](./architecture.md)
- [Overview](../index.md)
- [Tokens](../tokens.md)
- [Classes](../classes.md)
- [Accessibility](../accessibility.md)
- [Tests](./tests.md)
