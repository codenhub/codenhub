---
title: Introduction
description: What @codenhub/styles is, what it covers, and where to go next.
---

# @codenhub/styles

`@codenhub/styles` is a CSS-only design system: tokens, a reset, typography and layout utilities, and composable classes for buttons, forms, feedback, surfaces, and tooltips. Every component separates three independent choices — which color, how much of it, and what it's made of — so changing one never requires a component-specific variant. Four optional aesthetics (`.neobrutalism`, `.glass`, `.pixel`, `.chunky-tile`) restyle that same component set without touching markup.

The package ships as ready-to-import compiled CSS, or as Tailwind CSS v4 source entrypoints for a project that already runs Tailwind. Both cover the same classes; the difference is which build processes them.

## What it does

- Publishes color, foundation, intent, presentation, and material design tokens as CSS custom properties, themed with `light-dark()`.
- Provides a reset, focus-visible handling, and responsive layout/content utilities.
- Provides composable classes for buttons, form controls and toggles, alerts, badges, loaders, progress, cards/panels, tables, quotes, code, and tooltips.
- Provides four opt-in aesthetics that restyle the same components by setting material tokens, not by adding component variants.
- Provides classless mappings so plain HTML elements pick up base styling without added classes, from a dedicated entrypoint.
- Publishes Tailwind CSS v4 source entrypoints alongside the compiled output.

## What it does not do

- No JavaScript. There is no runtime, no framework bindings, and no build-time code generation beyond the CSS itself.
- No semantic HTML, ARIA, keyboard behavior, focus management, validation, or announcement timing. See [Accessibility](./accessibility.md) for the exact line between what the CSS provides and what an application must still add.
- No theme-toggling logic. Theme selection is a class or attribute a consumer applies; wiring a toggle to system preference, storage, or a user setting is outside this package. The `@codenhub/theme` package covers that need for consumers who want it.
- No shipped font binaries. `.pixel` and `.chunky-tile` accept a consumer-supplied font and fall back to a system stack when none is given.
- No compatibility layer for removed tokens or classes. Breaking changes are documented, not silently aliased.

## Next steps

- [Setup](./setup.md): Install the package, choose an entrypoint, and render a first component.
- [Concepts](./concepts.md): The three-axis model, the token system, and how theme selection works — read this before the usage guides.
- [Usage](./usage/index.md): Guides for composing axes, theming, customizing, aesthetics, and each component family.
- [Integrating](./integrating/index.md): Wiring the stylesheet into Next.js, Vue, Svelte, Astro, or a Tailwind CSS v4 build.
- [Accessibility](./accessibility.md): CSS accessibility hooks and what remains an application responsibility.
