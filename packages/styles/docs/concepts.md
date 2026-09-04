---
title: Concepts
description: The three-axis model, the token system, and how theme selection works.
order: 2
---

# Concepts

Read this before the usage guides. It explains the mental model every component, token, and class in this package shares.

## The three axes

Every component separates three independent choices, so each can change without a component-specific variant:

| Axis         | Question        | Classes                                                                                   | Inheritance  |
| ------------ | --------------- | ----------------------------------------------------------------------------------------- | ------------ |
| Intent       | Which color?    | `.primary`, `.secondary`, `.success`, `.warning`, `.destructive`, `.info`                 | Element only |
| Presentation | How much of it? | `.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`                                        | Cascades     |
| Aesthetic    | Made of what?   | `.neobrutalism`, `.glass`, `.pixel`, `.chunky-tile` from an optional aesthetic stylesheet | Cascades     |

```html
<section class="soft pixel">
  <button class="btn primary">Soft primary pixel button</button>
  <button class="btn destructive ghost edged">Outlined destructive override</button>
</section>
```

Intent stays on the component so a semantic container cannot accidentally recolor nested controls. Presentation and aesthetic cascade from a container; putting either class directly on a component overrides the inherited choice. Components apply documented clamps when an axis would remove an essential edge or overwhelm compact geometry.

The maintained contract is the intersection of the combinations documented in [Usage](./usage/index.md) and demonstrated by the playground. Undocumented and undemonstrated combinations may produce CSS but are not supported behavior.

- [Usage → Composing](./usage/composing.md) shows how the three axes combine on each component, with the full axis-support matrix.
- [Usage → Aesthetics](./usage/aesthetics.md) covers each aesthetic and its documented exceptions in depth.

## The token system

Tokens are CSS custom properties, grouped by what they control rather than where they're used:

| Category     | Controls                                                                                    | Reference                                                         |
| ------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Color        | The palette: primary, accent, success, warning, destructive, info, text, borders, surfaces. | [Usage → Theming](./usage/theming.md#color-tokens)                |
| Intent       | Which color slot a component reads once an intent class is applied.                         | [Usage → Theming](./usage/theming.md#intent-tokens)               |
| Foundation   | Layout, shape, motion, focus, depth, and layering defaults shared across components.        | [Usage → Theming](./usage/theming.md#foundation-tokens)           |
| Presentation | How much of an intent a component shows — fill and border percentages.                      | [Usage → Customizing](./usage/customizing.md#presentation-tokens) |
| Material     | What a component is made of — radius, border width, shadow geometry, translucency.          | [Usage → Customizing](./usage/customizing.md#material-tokens)     |
| Aesthetic    | Per-aesthetic knobs such as `--pixel-unit` or `--tile-lift`.                                | [Usage → Customizing](./usage/customizing.md#aesthetic-tokens)    |

Color and foundation tokens are the ones most apps touch first, to match a brand palette or spacing scale. Intent, presentation, and material tokens are lower-level: components read them, and only presentation classes, aesthetic classes, or a consumer override should set them.

## Theme selection

The root follows the operating-system `color-scheme` preference until an explicit selector overrides it.

| Theme | Equivalent selectors                             |
| ----- | ------------------------------------------------ |
| Light | `.light`, `.theme-light`, `[data-theme="light"]` |
| Dark  | `.dark`, `.theme-dark`, `[data-theme="dark"]`    |

- Theme selectors set `color-scheme` and nothing else. Because `color-scheme` inherits, a selector themes its entire subtree.
- With no explicit selector, `:root` uses `color-scheme: light dark`, so the system preference decides.
- A theme selector on `:root` overrides the system preference in either direction.
- A nested explicit selector overrides an inherited theme, so the nearest themed ancestor controls that subtree at any depth.
- If conflicting light and dark selectors are placed on the same element, the dark declaration wins because it appears later with equal specificity. Do not rely on this conflict behavior; apply one theme per element.
- Component colors resolve from tokens or `currentColor`, so they follow the theme without separate dark-variant rules, with no exception: every glyph the package draws is a `currentColor` mask. Icon artwork a consumer brings is theirs to theme.

Setting `color-scheme` yourself on an element also re-themes the tokens below it, because that is the only signal the palette reads. This also themes native UI such as scrollbars and form-control internals to match.

This mechanism works from Chrome 123, Safari 17.5, and Firefox 120; the package overall requires Firefox 121 for `:has()` (see [Setup](./setup.md#requirements)).
