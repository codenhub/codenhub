---
status: APPROVED
last_updated: 2026-08-10
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction for `@codenhub/styles`. It captures
styling-system improvements that should guide future changes without turning
this document into a release checklist. [Architecture](./architecture.md) owns
the styling model itself.

## Planned

Work is staged. Each stage lands as one reviewable change with `pnpm verify`
green before the next begins.

- **Stage 1 -- Token contract**: Collapse the duplicated per-component intent
  blocks into the shared `--intent-*` contract, add the material token set, and
  declare color tokens once with `light-dark()`. Convert input icons from
  per-theme hardcoded SVG data URIs to masks over `currentColor`.
- **Stage 2 -- Element coverage**: Extend intent and presentation to form
  controls, content elements, feedback, and the new `.card` and `.panel`
  surfaces. Surfaces activate `--elevation-*` and `--surface-hover-transform`,
  which no component reads today.
- **Stage 3 -- Aesthetics**: Ship `.neobrutalism`, `.glass`, and `.pixel` from
  opt-in entrypoints, with the compatibility matrix and playground coverage.
- **Stage 4 -- Documentation**: Split public docs into concepts, reference, and
  guides so the three-axis model is explained before the lookup tables.

## Not Planned

- **Neumorphism**: Its defining trait is a borderless control distinguished only
  by low-contrast shadow, which fails WCAG 1.4.11 non-text contrast. Not shipped
  unless a variant is found that keeps the look and passes.
- **Bundled fonts**: `.pixel` reads `--font-pixel` and falls back to monospace.
  The package ships no font binary and stays free of network side effects.
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
