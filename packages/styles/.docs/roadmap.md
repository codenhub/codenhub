# Roadmap

**Status:** APPROVED
**Last updated:** 2026-06-18
**Scope:** `@codenhub/styles` package direction.

## Purpose

This roadmap tracks durable direction for `@codenhub/styles`. It captures styling-system improvements that should guide future changes without turning this document into a release checklist.

## Recently Completed

- Published the v0.0.2 foundation: tokens, helper classes, accessibility notes, and test strategy.
- Added package-shipped `.docs` files and kept the README focused on quickstart usage plus links to durable docs.
- Added foundational design tokens for colors, layout, radius, motion, focus, shadows, layering, and dark mode.
- Added primary and secondary companion tokens (`--color-primary-subtle`, `--color-primary-strong`, `--color-accent-subtle`, `--color-accent-strong`).
- Expanded helper classes for layout, surfaces, buttons, forms, feedback, loading indicators, progress, empty states, and tooltips.
- Added preview and browser coverage for compiled CSS and Tailwind source CSS consumer paths.
- Refactored component helpers toward Tailwind-first source usage with `@apply` for static utility-like styling.
- Preserved composable button intent classes and presentation classes, including `.btn.error` inside `.field`.
- Reduced selector leakage by nesting related component styles where CSS nesting clearly scopes variants, states, pseudo-elements, and descendants to their owning helper class.
- Improved button presentation compatibility: button intents map color tone variants into scoped button slots, while `.ghost`, `.out`, and `.soft` own how those slots become presentation styles.
- Added semantic hover tokens for success, warning, destructive, and info intents.
- Renamed companion tone tokens from light/dark to subtle/strong so their names describe role instead of theme luminance.
- Kept loading buttons from animating color-related transitions so spinner and surface colors stay synchronized during theme changes.
- Added `.soft` and `.pill` as formally supported presentation classes with consistent docs and tests.
- Added `.banner` as a full-width, border-x-0 static feedback surface that extends the `.alert` token foundation.
- Refactored `.toast` so it shares the feedback token foundation with `.alert`, adds placement and overlay-specific treatment, and uses `--elevation-overlay` for its shadow.
- Split motion tokens by use case: `--motion-duration-fast` for buttons and inputs, `--motion-duration-normal` for layout and modals, `--motion-duration-slow` for skeleton and progress transitions.
- Replaced raw shadow tokens with semantic elevation tokens: `--elevation-low`, `--elevation-mid`, `--elevation-high`, `--elevation-overlay`.
- Added an internal theme toggle to the preview, fixed in the bottom-right corner.
- Tightened public token roles by removing legacy root tokens and treating component-scoped variables as internal implementation details.
- Updated semantic contrast tokens so filled intent buttons meet 3:1 UI component contrast requirements.
- Added regression coverage for filled semantic button contrast, presentation/intent tone slot composition, loading transition behavior, and legacy token removal.

## Planned

- Consider adding more presentation classes for buttons (e.g. `loading` state enhancements) once component APIs stabilize.
- Add more explicit compatibility tests for intent and presentation combinations when new combinations are supported.

## Later / Possible

- Evaluate whether `@codenhub/theme` should provide theme-toggle behavior if the need grows beyond a preview helper.

## Not Planned

- Aesthetic profile classes such as `.glassmorphism` or `.brutalism` are not planned for the current foundation work. The package should first improve token roles, composition behavior, accessibility hooks, and helper compatibility.
- Public JavaScript behavior is not planned for `@codenhub/styles` right now. Toast dismissal, focus management, and app-level theme state remain outside the CSS package unless a future package decision changes the runtime surface.

## Notes

- Prefer scoped CSS nesting when it improves containment, but do not nest only for style. Top-level helper classes are still appropriate when they are intentional public contracts.
- Presentation classes should document unsupported combinations instead of silently producing inaccessible or visually broken output.
- If toasts become dismissible in examples or docs, the dismissal behavior must be supplied by a consumer or by a separate runtime package, not implied by CSS alone.
- Color intent tokens own semantic tone values. Components should consume those tokens through scoped slots instead of adding broad theme-specific branches.

## References

- [Overview](./index.md)
- [Tokens](./tokens.md)
- [Classes](./classes.md)
- [Accessibility](./accessibility.md)
- [Tests](./tests.md)
