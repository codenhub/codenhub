---
title: Plain CSS
description: Import the base rules and one stylesheet per family — no build step, no markup scanning.
order: 1
---

# Plain CSS, no build step

Plain CSS is the zero-configuration route: import the base rules, then import one prebuilt stylesheet for each family you want. Every family stylesheet already holds its full catalog, so nothing needs to scan your markup.

```css
@import "@codenhub/icons";
@import "@codenhub/icons/phosphor-fill";
@import "@codenhub/icons/lucide";
```

Each rule carries two selectors sharing one copy of the artwork: the qualified `ic-lucide-heart` and the bare `ic-heart`. That is how plain CSS gets a default family with no plugin config to hold it — by standard CSS cascade order, the last family you import wins every bare name it defines. Above, `ic-heart` is Lucide's.

The brand families are the polite exception. `@codenhub/icons/simple-icons` and `@codenhub/icons/logos` emit only qualified names such as `ic-logos-google`, so importing one at the end never hijacks `ic-x` or `ic-play`.

## Cost

Because nothing scans your markup to prune unused icons, family stylesheets ship every glyph up front: Lucide is about 1.3 MB, Material Symbols Rounded about 3.9 MB, the full-color `logos` about 6.5 MB, Line MD about 3.0 MB including its static reduced-motion artwork, and all 17 families together reach about 39 MB. You control the budget by importing only the families you actually use. If that still feels heavy for three buttons and a sidebar, switch to Tailwind, Vite, or PostCSS so only the icons you wrote land in the output.

Line MD carries static artwork for reduced motion and for `ic-on-hover` at rest. Add `ic-on-hover` to play the artwork on hover with CSS alone; replaying one-shot artwork on every hover, rather than only the first, needs the optional `@codenhub/icons/play` helper. SVG Spinners retain loading animation. See [Animated families](../concepts.md#animated-families) for one-shot timing and browser limits.

## Limitations

Stroke width does not work in plain CSS. The width is baked into each rule's artwork, and a static stylesheet with no build step behind it has no way to know which stroke widths your templates asked for, so stroke families render at their authored width.

## See also

- [Delivery methods](index.md) — how the methods compare.
- [Tailwind CSS](tailwind.md) — the next delivery method, if you want on-demand emission with one import.
- [Frameworks](../frameworks/index.md) — framework-specific wiring once you have picked a delivery method.
- [Concepts](../concepts.md) — name resolution and the markup forms.
