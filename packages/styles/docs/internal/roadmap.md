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
- **Stage 4 -- Composition contract**: Close the gaps where the three axes meet
  a component that only partly implements them. Two changes carry the stage.

  The chosen direction for aesthetic shape is to make it a token the component
  consumes rather than a rule the aesthetic applies. Components would resolve it
  the way they already resolve `--ui-radius` and `--ui-shadow`, the per-aesthetic
  selector lists would go away with their duplication, and the shape would reach
  native elements for free, because the declaration would live in the utility
  `native.css` applies. See
  [Architecture](./architecture.md#aesthetics-reach-classes-not-elements) for what
  is measurably missing today.

  That direction has one obstacle to clear first, and the stage cannot land until
  it does.
  [Material tokens](./architecture.md#material-tokens) records that `clip-path`
  and `backdrop-filter` are kept out of the contract on purpose, because applying
  either unconditionally was held to create a compositing layer and a containing
  block on every component even at its no-op value. A `--ui-clip` every component
  resolves is exactly the unconditional application that reasoning rejects.

  So the stage opens by settling that empirically rather than by assuming either
  side: measure whether `clip-path: none` and `backdrop-filter: none` actually
  cost a layer or a containing block in the baseline engines. If they do not, the
  material-token note is what needs correcting and the token route proceeds. If
  they do, the shape has to reach components some other way -- an opt-in utility
  the aesthetics compose, or a shape token only the components that can afford it
  resolve -- and the native gap is closed by whichever of those survives. Either
  outcome updates one of these two documents, so they stop disagreeing.

  Presentation gets honest on the components that under-read it. A text control
  under `.soft` loses its border with no bottom rule to replace it; `.switch`
  reads no presentation token at all; `.progress`, `.divider`, and
  `.empty-state` each read one. Whether a component widens to the full contract
  or is documented as intent-only is a per-component decision, but it must be a
  decision rather than an accident.

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
