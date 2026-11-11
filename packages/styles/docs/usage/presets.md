---
title: Presets
description: Three ways to set a look once instead of on every element, and when to reach for each.
order: 11
---

# Presets

By now the settings screen says `btn primary soft sm` in a dozen places, and changing your mind means changing a dozen places. This page covers the three ways to set a look once: axis classes on a container, theme and material tokens, and your own component classes built with `@apply`. Each fits a different kind of "once".

## Which one to use

| You want                                                              | Reach for                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| Every component in one region to share a fill, an edge, or a material | [Axis classes on a container](#axis-classes-on-a-container) |
| Different colors, corners, borders, or depth for a page or a region   | [Theme and material tokens](#theme-and-material-tokens)     |
| One name for a recipe you repeat, such as "the save button"           | [Your own component classes](#your-own-component-classes)   |

They combine. A region can set a material token, sit under an aesthetic, and hold your own button class, and each element can still override what it inherits.

## Axis classes on a container

Some classes work on a container as well as on a component, and everything inside takes them:

- The presentation classes: `.solid`, `.soft`, `.ghost`, `.edged`, and `.edgeless`.
- The corner patterns: `.cut-diagonal` and `.cut-diagonal-reverse`.
- The [aesthetics](./aesthetics.md), such as `.glass` or `.pixel`.

```html
<div class="cluster soft edged">
  <button class="btn primary" type="button">Bold</button>
  <button class="btn" type="button">Italic</button>
  <button class="btn destructive solid" type="button">Clear formatting</button>
</div>
```

The toolbar's buttons are soft and edged, and the last one asks for its own fill. A class on the element always beats one from a container.

The other axes do not pass down. Intent, elevation (`.flat`, `.raised`, `.floating`), and size (`.sm`, `.lg`) change only the element they are on, so a `.sm` toolbar does not shrink its buttons; [Composing → Combining classes](./composing.md#combining-classes) explains why. An aesthetic class also sets its own corner pattern on its region, so a `.cut-diagonal` above a `.pixel` region does not reach inside it.

Use a container class when the look belongs to the region, such as a quiet sidebar, rather than to the components in it.

## Theme and material tokens

Tokens are CSS custom properties. Set one on `:root` and the whole page follows; set it on an element and only what is inside follows. They reach further than classes, because components read them while they draw:

```css
.admin {
  --radius-control: 0.25rem;
  --radius-surface: 0.5rem;
  --border-width: 2px;
}
```

Every control and surface inside `.admin` takes the tighter corners and the heavier border, with no class on any of them.

The tables live where the tokens are explained, so this page does not repeat them:

- [Theming → Color tokens](./theming.md#color-tokens): brand and status colors, in both themes.
- [Theming → Foundation tokens](./theming.md#foundation-tokens): corners, border width, control height, focus ring, depth, and motion.
- [Customizing → Presentation tokens](./customizing.md#presentation-tokens): how much a fill, an edge, or a hover gives.
- [Customizing → Material tokens](./customizing.md#material-tokens): what an aesthetic sets, which you can set yourself, such as `--ui-radius`.
- [Customizing → Aesthetic tokens](./customizing.md#aesthetic-tokens): the knobs of each aesthetic, such as `--neo-offset`.

Use tokens when the change is a value, such as a color or a corner, rather than a choice between classes.

## Your own component classes

With the Tailwind source entrypoints, every component, helper, and axis class is a Tailwind utility, so one class of yours can carry the whole recipe:

```css
@import "@codenhub/styles/tw";

@utility btn-save {
  @apply btn primary soft sm;
}
```

```html
<button class="btn-save" type="submit">Save changes</button>
```

`btn-save` behaves like `btn primary soft sm` written out, aesthetics and hover included, and changing the recipe changes every save button. Modifiers that belong to one component, such as `.tight` on `.stack` or `.icon` on `.btn`, are utilities too, so `@apply btn icon` gives you an icon button of your own. [Tailwind CSS v4 → Build your own components with `@apply`](../integrating/tailwind.md#build-your-own-components-with-apply) has the rules, including why `@utility` beats a plain rule.

With the compiled CSS there is no `@apply`. Keep the recipe in one place on the other side instead: a template partial, a component in your framework, or a constant such as `const saveButton = "btn primary soft sm"`.

Use your own class when the same combination names one thing in your design, such as the save button or the plan card.

## Next

[Accessibility](../accessibility.md) lists what the CSS does for your users and what your application still owes them.
