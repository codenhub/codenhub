---
status: APPROVED
last_updated: 2026-08-09
scope: `@codenhub/styles` package direction.
---

# Roadmap

## Purpose

This roadmap tracks durable direction for `@codenhub/styles`. It captures styling-system improvements that should guide future changes without turning this document into a release checklist.

## Planned

- **Aesthetic Themes**: Add aesthetic themes (e.g., glassmorphism, brutalism, glitch) to allow changing the whole look-and-feel of the UI. They extend the presentation token contract with a further number set rather than adding component branches.
- **Presentation Contract Coverage**: Form controls, surfaces, tooltips, and progress do not read the presentation tokens yet. Extend coverage once the contract has proven itself on `btn`, `alert`, and `badge`.
- **Dynamic Tokens & Color Schemes**: Add `@codenhub/theme` as a dev dependency to enable dynamic token changes and color scheme creation.
- **Button Presentation Classes**: Consider adding more presentation classes for buttons (e.g., loading state enhancements) once component APIs stabilize.
- **Compatibility Tests**: Add more explicit compatibility tests for intent and presentation combinations when new combinations are supported.

## Not Planned

- **JS/TS Helpers**: Runtime DOM helpers (such as a typed `createElement` wrapper) are not planned for now. They will be considered further before any future package expansion, but remain out of scope for now to keep the package CSS-only.
- Public JavaScript behavior like toast dismissal, focus management, and app-level theme state remain outside the CSS package.

## References

- [Overview](../index.md)
- [Tokens](../tokens.md)
- [Classes](../classes.md)
- [Accessibility](../accessibility.md)
- [Tests](./tests.md)
