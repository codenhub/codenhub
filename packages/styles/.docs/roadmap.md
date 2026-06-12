# Roadmap

**Status:** DRAFT
**Last updated:** 2026-06-12
**Scope:** `@codenhub/styles` package direction.

## Purpose

This roadmap tracks durable direction for `@codenhub/styles` after the v0.0.2 foundation work. It captures styling-system improvements that should guide future changes without turning this document into a release checklist.

## Recently Completed

- Published the v0.0.2 foundation direction in package docs: tokens, helper classes, accessibility notes, and test strategy.
- Added package-shipped `.docs` files and kept the README focused on quickstart usage plus links to durable docs.
- Added foundational design tokens for colors, layout, radius, motion, focus, shadows, layering, and dark mode.
- Expanded helper classes for layout, surfaces, buttons, forms, feedback, loading indicators, progress, empty states, and tooltips.
- Added preview and browser coverage for compiled CSS and Tailwind source CSS consumer paths.
- Refactored component helpers toward Tailwind-first source usage with `@apply` for static utility-like styling.
- Preserved composable button intent classes and presentation classes, including `.btn.error` inside `.field`.

## Current Focus

- Reduce selector leakage by nesting related component styles where CSS nesting clearly scopes variants, states, pseudo-elements, and descendants to their owning helper class.
- Improve button presentation compatibility, especially `.ghost`, so semantic intents remain visible when intent colors are light.
- Keep the package source Tailwind-first: prefer `@apply` for static styling and reserve custom properties for tokens, composition, fallback behavior, and future profile overrides.

## Planned

- Rework `.ghost` so it behaves closer to `.outline`: transparent by default, compatible with semantic intent colors, and protected from low-contrast text when the intent color is light.
- Formalize presentation classes for buttons and related helpers, including `.soft` and `.pill`, with clear docs and tests for supported combinations.
- Make presentation classes smarter about intent compatibility. They do not have to support every possible intent, but broad compatibility is preferred when it can be achieved without fragile special cases.
- Consider adding light and dark companion tokens for primary and secondary intents, similar to semantic tokens such as success, warning, destructive, and info. This would give each intent enough color roles for filled, outline, ghost, soft, and future presentations without relying on unsafe color mixing alone.
- Split motion tokens by use case so fast interactions, normal transitions, and slow ambient motion can differ. Skeleton loading should use a slower motion role than button or control transitions.
- Replace raw shadow tokens with elevation tokens. Components should use the elevation role that matches the use case instead of choosing a one-off shadow value.
- Revisit feedback helpers so `.alert` remains an agnostic feedback foundation while static banners and elevated toasts have clearer roles. A simple path is to keep `.alert` as the base surface and let `.toast` extend it with placement, elevation, and overlay-specific treatment.

## Later / Possible

- Add a simple internal theme toggle to the preview, fixed in the bottom-right corner, so light and dark behavior can be tested quickly. This should stay internal to package docs/tests unless the package intentionally grows a JavaScript runtime surface.
- Evaluate whether `@codenhub/theme` should provide theme-toggle behavior in the future if the need grows beyond a preview helper.
- Add more explicit compatibility tests for intent and presentation combinations once the token roles are expanded.

## Not Planned

- Aesthetic profile classes such as `.glassmorphism` or `.brutalism` are still not planned for the current foundation work. The package should first improve token roles, composition behavior, accessibility hooks, and helper compatibility.
- Public JavaScript behavior is not planned for `@codenhub/styles` right now. Toast dismissal, focus management, and app-level theme state remain outside the CSS package unless a future package decision changes the runtime surface.

## Notes

- Prefer scoped CSS nesting when it improves containment, but do not nest only for style. Top-level helper classes are still appropriate when they are intentional public contracts.
- Presentation classes should document unsupported combinations instead of silently producing inaccessible or visually broken output.
- If toasts become dismissible in examples or docs, the dismissal behavior must be supplied by a consumer or by a separate runtime package, not implied by CSS alone.

## References

- [Overview](./index.md)
- [Tokens](./tokens.md)
- [Classes](./classes.md)
- [Accessibility](./accessibility.md)
- [Tests](./tests.md)
