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
per-component presentation set. The combinations dropped there are recorded in
[Architecture](./architecture.md#presentation-is-narrower-than-its-class-list)
alongside why each one is degenerate, so a future change can tell a deliberate
omission from an oversight.

## Current Focus

**Phase 2 -- Composition contract**. Close the gaps where the three axes meet a
component that only partly implements them, one reviewable change at a time with
`pnpm verify` green before the next begins.

The rules came first, because they decide half the answers, and are now
[Axis rules](./architecture.md#axis-rules). The shape material followed: the
silhouette, its ring, the border ceiling, and the radius are tokens consumed
through the `shaped` and `shaped-tight` utilities, so a bare `<button>`,
`<input>`, `<code>`, or `<kbd>` carries the aesthetic's full silhouette. Then the
geometry conformance fixes: the progress ceiling and fill blend, the chip border
ceiling, the control border floor, and `.switch` reading its material.

What the rules recorded and the code has not answered yet:

- `.error` stops being a component. Helper text becomes `.hint` coloured by the
  intent axis, so `.hint.error`, which deletes the field-scoped reinterpretation
  and its `:not(.btn)` guard. A breaking class-surface change, which `0.x` is for.
- `.checkbox` and `.radio` need the border floor the text controls already have
  under `.soft` and `.ghost`.
- `--glass-shadow` should compose from `--elevation-color` instead of being a
  private near-copy of it. The alphas differ, so folding them makes the dark-theme
  shadow heavier; that is a visible change and belongs in its own slice.
- A decision for each component that reads one presentation token or none:
  `.divider` reads `--ui-border-scale`, `.empty-state` reads `--ui-fg-on-fill`,
  `.skeleton` and `.loader` read neither, and `.quote` hardcodes `border-l-4`.
  Each either widens or is declared intent-only under the supported-surface rule.

## Planned

- **Phase 3 -- Documentation and release**: Split public docs into concepts,
  reference, and guides so the three-axis model is explained before the lookup
  tables. State the supported-surface rule above, and state per component which
  axes it reads. `0.2.0` ships from that.

## Later / Possible

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
