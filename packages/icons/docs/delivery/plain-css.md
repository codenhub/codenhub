---
title: Plain CSS
description: Import the base rules and one stylesheet per family — no build step, no markup scanning.
---

# Plain CSS, no build step

Import the base rules, then a stylesheet per family. Each family stylesheet is complete, so nothing has to scan your markup.

```css
@import "@codenhub/icons";
@import "@codenhub/icons/phosphor-fill";
@import "@codenhub/icons/lucide";
```

Every rule carries two selectors, the qualified `ic-lucide-heart` and the bare `ic-heart`, sharing one copy of the artwork. That is how this method gets a default family without any configuration to hold one: the last family you import wins every bare name it defines. Above, `ic-heart` is Lucide's.

## Cost

The family stylesheets are large by construction — every icon, because nothing is narrowing them. Lucide is about 1 MB, Material Symbols Rounded about 3.4 MB, all 13 families about 22 MB. A project chooses its cost by choosing which families it imports. If that is too much, use a plugin method or Tailwind, which emit only what your markup asked for.

## Limitations

Stroke width does not work here. It is baked into the artwork each rule carries, and a stylesheet with no build step behind it cannot know which widths you want. Stroke families render at their authored width.

## See also

- [Delivery methods](index.md) — how the methods compare.
- [Concepts](../concepts.md) — name resolution and the markup forms.
