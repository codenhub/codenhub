---
title: Theming
description: Light and dark mode, replacing the palette with brand colors, defining an intent of your own, and every color, intent, foundation, and font token with its default.
order: 5
---

# Theming

The settings screen works and looks like the package's defaults: near-black actions on a near-white page. This page makes it yours. It covers light and dark mode, then replaces the primary color with a brand color in both modes, then defines an intent the package does not ship. The second half is the lookup reference: every color, intent, foundation, and font token, with its default.

## Light and dark

Out of the box, the page follows the operating system: light when the user's system is light, dark when it is dark. You do nothing for that.

To let the user choose, put a theme selector on the root element:

```html
<html data-theme="dark">
  …
</html>
```

| Theme | Equivalent selectors                             |
| ----- | ------------------------------------------------ |
| Light | `.light`, `.theme-light`, `[data-theme="light"]` |
| Dark  | `.dark`, `.theme-dark`, `[data-theme="dark"]`    |

A settings screen with a "System / Light / Dark" choice removes the attribute for System and sets it for the other two.

How it resolves:

- A theme selector sets the CSS `color-scheme` property, and the element's text color to `--color-text`. Every color token holds its light and its dark value at once, through `light-dark()`, and the element's `color-scheme` picks one.
- `color-scheme` inherits, so a selector themes everything inside it. A selector on any element themes that part of the page: a dark sidebar on a light page is `<aside class="dark">`, and the text inside it takes the dark theme's text color.
- A selector sets no background. Give the region its ground yourself, such as `background: var(--color-background)`. Any utility or component class on the same element overrides the selector's text color.
- The nearest selector wins, at any depth. A `.light` card inside a `.dark` page is light.
- With no selector, the root has `color-scheme: light dark`, which follows the system.
- Put one theme on an element. If an element carries both a light and a dark selector, dark wins, but do not rely on that.
- Setting `color-scheme` yourself on an element themes the tokens the same way, because it is the only thing the palette reads. It also themes native parts such as scrollbars and the inside of form controls. Plain text inside keeps the color it inherited until you also set `color: var(--color-text)`.

Every component color comes from a token or from `currentColor`, so components follow the theme with no dark-mode rules of their own. The marks the package draws, such as the checkbox tick and the select arrow, use `currentColor` too. Icons and images you add are yours to theme.

`light-dark()` works from Chrome 123, Safari 17.5, and Firefox 120. The package as a whole needs Firefox 128; see [Setup → Requirements](../setup.md#requirements).

### The `dark:` variant

With the Tailwind source entrypoints (`/tw`), the package replaces Tailwind's `dark:` variant so your own utilities follow the same theme as the tokens. A `dark:` utility applies under an explicit dark selector on the element or an ancestor, or under a dark system preference when no ancestor sets a theme:

```html
<html>
  <body>
    <p class="dark:text-white">Follows the system preference</p>
    <div class="light">
      <p class="dark:text-white">Stays light: this part of the page chose a theme</p>
    </div>
  </body>
</html>
```

It differs from the tokens in one case: an explicit theme nested inside the opposite one. A `.light` element inside a `.dark` one has light tokens, because the nearest `color-scheme` wins. But `dark:` matches by selector, and `.dark *` matches every element inside `.dark`, so a `dark:` utility inside that `.light` element still applies. If a page uses both tokens and `dark:` utilities, do not nest opposite themes.

The compiled entrypoints do not define a `dark:` variant; they have no Tailwind build to define it in.

## Change the brand color

The primary color is near-black on a light page and near-white on a dark one. To make it a brand color, replace the whole primary family: the base color and its four companions. Each holds a light and a dark value:

```css
:root {
  --color-primary: light-dark(#0f766e, #2dd4bf);
  --color-primary-contrast: light-dark(#ffffff, #042f2e);
  --color-primary-hover: light-dark(#115e59, #5eead4);
  --color-primary-subtle: light-dark(#ccfbf1, #134e4a);
  --color-primary-strong: light-dark(#115e59, #5eead4);
}
```

What each one is for:

| Token                      | Role                                                                   | Check                                          |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| `--color-primary`          | The fill of a solid primary button, a checked toggle, a progress fill. | Text in `-contrast` on it reaches 4.5:1.       |
| `--color-primary-contrast` | Text and icons on a full primary fill.                                 | See above.                                     |
| `--color-primary-hover`    | The fill under the pointer.                                            | Text in `-contrast` on it still reaches 4.5:1. |
| `--color-primary-subtle`   | The light tint behind soft components.                                 | Text in `-strong` on it reaches 4.5:1.         |
| `--color-primary-strong`   | Text, icons, and borders where the fill is not full: soft and ghost.   | Reaches 4.5:1 on the page and on `-subtle`.    |

The teal values above measure, in light and dark mode: 5.47:1 and 7.77:1 for the fill and its text, 7.27:1 and 13.38:1 for the strong tone on the page, and 6.73:1 and 6.41:1 for the strong tone on the subtle tint.

Replace the whole family. Changing only `--color-primary` leaves its companions on the old near-black, so a soft primary badge keeps gray text and a hovered button flashes black. The focus ring is drawn from `--color-primary` at 64% opacity, so it follows the brand color without a change of its own.

The same pattern works for every family in [Color tokens](#color-tokens): `--color-accent` is what `.secondary` reads, and the four status families are `success`, `warning`, `destructive`, and `info`. Set them on `:root` for the whole page, or on any element to retheme only what is inside it.

The values must be complete colors: hex, `rgb()`, `oklch()`, or a variable you declared yourself. Tailwind palette variables such as `--color-teal-700` exist in a `/tw` build, from your Tailwind theme, but the compiled CSS declares only the palette colors the package itself uses. With compiled CSS, a reference to any other palette variable is empty, and the color it feeds is lost.

## Your own intent

The package ships six intents: `.primary`, `.secondary`, `.success`, `.warning`, `.destructive`, and `.info`, and the default, `.neutral`. To add one, such as a "Beta" color for features in preview, write a class that sets the seven intent slots. Use complete colors, with `light-dark()` for anything that changes between themes:

```css
.beta {
  --intent-color: #7c3aed;
  --intent-contrast: #ffffff;
  --intent-hover: #6d28d9;
  --intent-strong: light-dark(#5b21b6, #c4b5fd);
  --intent-subtle: light-dark(#ede9fe, #4c1d95);
  --intent-border: light-dark(#7c3aed, #a78bfa);
  --intent-fill-max: 100%;
}
```

```html
<span class="badge beta">Beta</span> <button class="btn beta" type="button">Try the new editor</button>
```

These values measure 5.7:1 for white on the fill, 7.1:1 for white on the hover color, 8.61:1 (light) and 10.72:1 (dark) for the strong tone on the page, and 7.57:1 and 5.93:1 for the strong tone on the subtle tint.

**Set every slot**, including `--intent-fill-max`. Each component resets all seven slots to the neutral values at its own root, so a slot you leave out keeps neutral's value, and without `--intent-fill-max: 100%` your intent fills only to 20%, like neutral. What each slot does is in [Intent tokens](#intent-tokens).

The class works on everything that takes an intent: buttons, badges, fields and toggles, solid and ghost cards, progress bars, skeletons, tooltip bubbles, and the rest. A few behaviors are written for the six built-in names, and a custom intent does not get them:

- **A quiet, untinted rest.** A neutral `.card.soft`, `.panel`, and `.alert` rest on the quiet background tone, and they recognize an intent only by the six built-in classes. `.card.soft.beta`, `.panel.beta`, and `.alert.beta` are drawn like the neutral one: the quiet background tone instead of a violet tint. Your intent still colors their text and border.
- **The chip tint.** A `.beta` key cap or code block shows your `--intent-subtle` tint, but not the extra 12% of `--intent-color` a built-in intent adds over it.
- **Solo classes.** A [solo class](./solo.md) such as `.neobrutalism-solo` takes an intent only from the six built-in classes, so `.neobrutalism-solo.beta` is drawn neutral.

If you need those, there are two ways:

- **Retheme a built-in intent instead.** Set the `--color-info` family (or another one) to your colors, as in [Change the brand color](#change-the-brand-color), and write `.info`. Everything, including the cases above, then works. The cost is that the change reaches every `.info` inside the element you set it on, so set it on the narrowest element that works, and do not do it with an intent the page already uses for its own meaning.
- **Paint it yourself.** Write your own CSS for that one component, such as a `background-color` on `.panel.beta`.

> **Intent does not pass down.** Each component resets the intent slots at its own root, so a `.success` container does not recolor a destructive button inside it. Put the intent class on the element that shows the color.

## Color tokens

Every color token holds a light and a dark value through `light-dark()`; one value means both themes use it. Palette names such as `neutral-950` are Tailwind's default palette, which the package's compiled CSS declares for the colors it uses.

Each row is an override point: set it on `:root` to retheme the page, or on any element to retheme what is inside it. The `-hover`, `-subtle`, `-strong`, and `-contrast` rows are companions of their family's base color and do not follow it, so retheme the whole family. The `text` family has no `-subtle` row: the neutral intent takes its subtle tone from `--color-surface`.

| Token                          | Light, dark                  | Purpose                                                                                        |
| ------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `--color-primary`              | `neutral-950`, `neutral-50`  | Fill of `.primary`.                                                                            |
| `--color-primary-contrast`     | `neutral-50`, `neutral-950`  | Text and icons on a full primary fill.                                                         |
| `--color-primary-hover`        | `neutral-700`, `neutral-200` | Primary fill under the pointer.                                                                |
| `--color-primary-subtle`       | `neutral-200`, `neutral-900` | Primary tint behind soft components.                                                           |
| `--color-primary-strong`       | `neutral-900`, `neutral-100` | Primary text, icons, and borders where the fill is not full.                                   |
| `--color-accent`               | `neutral-600`, `neutral-400` | Fill of `.secondary`.                                                                          |
| `--color-accent-contrast`      | `neutral-50`, `neutral-950`  | Text and icons on a full secondary fill.                                                       |
| `--color-accent-hover`         | `neutral-700`, `neutral-300` | Secondary fill under the pointer.                                                              |
| `--color-accent-subtle`        | `neutral-100`, `neutral-800` | Secondary tint behind soft components.                                                         |
| `--color-accent-strong`        | `neutral-800`, `neutral-200` | Secondary text, icons, and borders where the fill is not full.                                 |
| `--color-border`               | `neutral-400`, `neutral-700` | Border of neutral surfaces, tables, dividers, and key caps.                                    |
| `--color-border-hover`         | `neutral-600`, `neutral-500` | Border under the pointer.                                                                      |
| `--color-control-border`       | `neutral-500`                | Resting border of neutral text controls and toggles, drawn at a fraction on text controls.     |
| `--color-background`           | `neutral-50`, `neutral-950`  | The page.                                                                                      |
| `--color-foreground`           | `neutral-100`, `neutral-900` | The quiet background tone one step off the page: neutral soft cards, panels, and alerts.       |
| `--color-surface`              | `neutral-200`, `neutral-800` | A further step: nested and muted surfaces, and the neutral intent's tint.                      |
| `--color-text`                 | `neutral-950`, `neutral-50`  | Body text, and the neutral intent's color.                                                     |
| `--color-text-secondary`       | `neutral-700`, `neutral-400` | Secondary text, such as `.hint`.                                                               |
| `--color-text-contrast`        | `neutral-50`, `neutral-950`  | Text on a full fill of `--color-text`, such as the mark of a checked neutral toggle.           |
| `--color-text-hover`           | `neutral-700`, `neutral-200` | Neutral color under the pointer.                                                               |
| `--color-text-strong`          | `neutral-900`, `neutral-100` | Neutral text, icons, and borders where the fill is not full.                                   |
| `--color-tooltip`              | `white`, `neutral-700`       | Background of a tooltip bubble with no intent. Chosen per theme so it reads as lifted in both. |
| `--color-tooltip-contrast`     | `neutral-900`, `neutral-100` | Text on `--color-tooltip`.                                                                     |
| `--color-success`              | `emerald-700`                | Fill of `.success`.                                                                            |
| `--color-success-contrast`     | `neutral-50`                 | Text on a full success fill: 5.14:1.                                                           |
| `--color-success-hover`        | `#007552`, `#008e66`         | Success fill under the pointer.                                                                |
| `--color-success-subtle`       | `emerald-100`, `emerald-900` | Success tint behind soft components.                                                           |
| `--color-success-strong`       | `emerald-800`, `emerald-300` | Success text, icons, and borders where the fill is not full.                                   |
| `--color-warning`              | `amber-600`                  | Fill of `.warning`.                                                                            |
| `--color-warning-contrast`     | `neutral-950`                | Text on a full warning fill: near-black, not the page color. 6.19:1.                           |
| `--color-warning-hover`        | `#d46700`, `#e78300`         | Warning fill under the pointer.                                                                |
| `--color-warning-subtle`       | `amber-100`, `amber-900`     | Warning tint behind soft components.                                                           |
| `--color-warning-strong`       | `amber-800`, `amber-300`     | Warning text, icons, and borders where the fill is not full.                                   |
| `--color-destructive`          | `rose-700`                   | Fill of `.destructive`.                                                                        |
| `--color-destructive-contrast` | `neutral-50`                 | Text on a full destructive fill: 5.78:1.                                                       |
| `--color-destructive-hover`    | `#c00036`, `#d1054b`         | Destructive fill under the pointer.                                                            |
| `--color-destructive-subtle`   | `rose-100`, `rose-900`       | Destructive tint behind soft components.                                                       |
| `--color-destructive-strong`   | `rose-800`, `rose-300`       | Destructive text, icons, and borders where the fill is not full.                               |
| `--color-info`                 | `indigo-600`                 | Fill of `.info`.                                                                               |
| `--color-info-contrast`        | `neutral-50`                 | Text on a full info fill: 6.19:1.                                                              |
| `--color-info-hover`           | `#4b36e9`, `#5e4ff9`         | Info fill under the pointer.                                                                   |
| `--color-info-subtle`          | `indigo-100`, `indigo-900`   | Info tint behind soft components.                                                              |
| `--color-info-strong`          | `indigo-800`, `indigo-300`   | Info text, icons, and borders where the fill is not full.                                      |

Theme changes belong in these values, not in component rules that check the theme.

## Intent tokens

An intent class sets these seven slots, and components read them. Because every component reads the same seven names, a class that sets all seven works as an intent, as [Your own intent](#your-own-intent) shows.

| Token               | Purpose                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--intent-color`    | The intent's base color, what a fill is made of.                                                                                                                                                                              |
| `--intent-contrast` | Text on a full fill of `--intent-color`.                                                                                                                                                                                      |
| `--intent-hover`    | The base color under the pointer.                                                                                                                                                                                             |
| `--intent-strong`   | The intent as text, icon, or border wherever the fill is not full.                                                                                                                                                            |
| `--intent-subtle`   | The light tint behind soft components and progress tracks. Neutral uses `--color-surface`.                                                                                                                                    |
| `--intent-border`   | Line color. With no intent it is the aesthetic's `--ui-ink`, then `--color-border`; text controls and toggles read `--ui-control-ink`, then `--ui-ink`, then `--color-control-border`, and tables read `--ui-rule-ink` first. |
| `--intent-fill-max` | How far a fill of this intent may go. `100%` for every intent except neutral.                                                                                                                                                 |

`--intent-color` and `--intent-strong` are not interchangeable. The base color is chosen to be filled with; the strong tone is chosen to be read against the page. A soft or ghost component prints the strong tone, which is why a soft warning reads in amber-800 while a solid one is filled with amber-600.

The strong tone also has to stay recognizably its own hue. On a dark page, the `-100` shade of every family is a pale tint with almost no color at small sizes: a soft success badge and a soft destructive one would both read as white. The dark strong tones are `-300` for that reason, and the tints under them are `-900`, which measures 5.0:1 or better wherever a partial fill holds text, and over 9:1 on the page.

`--intent-border` exists so a neutral border stays the quiet border gray rather than the text color. Everything that draws a line reads it: control borders, table rules, dividers, key caps, and quote bars.

`--intent-fill-max` exists for the neutral intent, whose color is the page's own text color. Every other intent is a hue, readable as a pale tint at 12% and saturated at 100%; a gray filled to 100% is a black or white block, the loudest thing on the page for the intent that means nothing in particular. Neutral stops at `20%`, so `.solid` gives it a quiet gray that is still a step past `.soft`. Hover adds its step on top of the cap, so a capped fill still deepens under the pointer.

The text color follows the fill. `--intent-contrast` is the text color for a full fill; printed on a fifth of one, it would be white on light gray. So contrast text appears only once the fill is past halfway, and reaches full strength at a full fill; below that, a component prints `--intent-strong`. A capped neutral therefore prints the strong tone. A state that lifts the cap on purpose, such as a checked checkbox, reaches a full fill and prints the contrast color.

## Foundation tokens

Foundation tokens set layout, shape, motion, focus, depth, and stacking. Override them on `:root`, or on an element for what is inside it.

The four `--elevation-*` shadows are for elements you style yourself. They are separate from the `.flat`, `.raised`, and `.floating` classes, which scale a component's own shadow and draw nothing until an aesthetic or one of those classes asks for depth; see [Composing → Elevation](./composing.md#elevation). Both use the weights none, small, medium, and large, but one is a fixed value and the other scales shadow parts, so they do not always look the same.

| Token                      | Default                                                | Purpose                                                                                                         |
| -------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `--font-default`           | `"Segoe UI", system-ui, sans-serif`                    | Page font. See [Fonts](#fonts).                                                                                 |
| `--container-narrow`       | `48rem`                                                | Width of `.section-content.narrow`.                                                                             |
| `--container-max`          | `80rem`                                                | Width of `.section-content`.                                                                                    |
| `--container-wide`         | `90rem`                                                | Width of `.section-content.wide`.                                                                               |
| `--layout-gutter`          | `clamp(1rem, 4vw, 2rem)`                               | Side padding of `.section`, growing with the window.                                                            |
| `--layout-section-block`   | `clamp(4rem, 9vw, 7rem)`                               | Top and bottom padding of `.section`, growing with the window.                                                  |
| `--layout-gap`             | `1rem`                                                 | Gap of `.view`, `.stack`, `.cluster`, and `.auto-grid`.                                                         |
| `--layout-grid-min`        | `16rem`                                                | Narrowest column of `.auto-grid`.                                                                               |
| `--radius-small`           | `0.25rem`                                              | Corner of small chips: `.kbd` and `.code`.                                                                      |
| `--radius-control`         | `0.5rem`                                               | Corner of buttons, fields, and tooltip bubbles.                                                                 |
| `--radius-surface`         | `0.875rem`                                             | Corner of cards, panels, and alerts.                                                                            |
| `--control-height`         | `2.5rem`                                               | Minimum height of a default button and a text control.                                                          |
| `--border-width`           | `1px`                                                  | Border width.                                                                                                   |
| `--elevation-color`        | `rgb(15 23 42 / 0.08)` light, `rgb(0 0 0 / 0.55)` dark | The shadow color the four elevations use. Heavier on a dark page, where a light shadow would not show.          |
| `--elevation-none`         | `none`                                                 | No shadow.                                                                                                      |
| `--elevation-sm`           | `0 1px 2px`, `0 1px 3px`                               | A light shadow for your own surfaces, such as a card.                                                           |
| `--elevation-md`           | `0 4px 6px -1px`, `0 2px 4px -2px`                     | A shadow for your own raised elements, such as a dropdown menu.                                                 |
| `--elevation-lg`           | `0 20px 25px -5px`, `0 8px 10px -6px`                  | A shadow for your own overlays, such as a modal dialog.                                                         |
| `--focus-ring`             | `--color-primary` at 64% opacity                       | Color of the keyboard focus ring.                                                                               |
| `--focus-ring-offset`      | Not set                                                | Distance of the ring from the element. When unset, the ring sits on the element's border under every aesthetic. |
| `--focus-ring-width`       | `3px`                                                  | Width of the keyboard focus ring.                                                                               |
| `--motion-duration-fast`   | `120ms`                                                | A table row's hover.                                                                                            |
| `--motion-duration-normal` | `200ms`                                                | Color, border, shadow, and press transitions, toggle marks, and the tooltip bubble.                             |
| `--motion-duration-slow`   | `400ms`                                                | Progress value changes, and the base of the skeleton and progress shimmer cycle.                                |
| `--motion-ease`            | `cubic-bezier(0.2, 0, 0, 1)`                           | Easing for every transition.                                                                                    |
| `--z-popover`              | `40`                                                   | Stacking order of tooltip bubbles. Use it for your own popovers so they stack the same way.                     |
| `--breakpoint-xs`          | `30rem`                                                | The `xs:` responsive breakpoint. Only in a `/tw` build; the compiled entrypoints do not declare it.             |

Each `--elevation-*` shadow is made of the listed parts, each in `--elevation-color`. The hover step that deepens a fill under the pointer is a presentation token, `--hover-step`; see [Customizing](./customizing.md#presentation-tokens).

## Fonts

The package ships no font files and makes no network requests. Every font token names fonts already installed on the reader's device until you supply your own.

| Token            | Read by                                                                                          | Without your value                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--font-default` | The reset, on `html` and `body`. Buttons and form controls inherit it.                           | `"Segoe UI", system-ui, sans-serif`                                                                                                             |
| `--font-mono`    | The `kbd`, `code`, and `pre` content helpers, and `<kbd>`, `<code>`, and `<pre>` under `/native` | `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`. Under `/tw`, your Tailwind theme's value. |
| `--font-pixel`   | [`.pixel`](./aesthetics.md#pixel) and `.pixel-solo`                                              | Not declared. Falls back to a monospace stack.                                                                                                  |
| `--font-rounded` | [`.chunky-tile`](./aesthetics.md#chunky-tile) and `.chunky-tile-solo`                            | Not declared. Falls back to `--font-default`, then a sans-serif stack.                                                                          |
| `--font-cyber`   | [`.cyber`](./aesthetics.md#cyber) and `.cyber-solo`                                              | Not declared. Falls back to a monospace stack.                                                                                                  |
| `--font-sketch`  | [`.sketch`](./aesthetics.md#sketch) and `.sketch-solo`                                           | Not declared. Falls back to the platform `cursive` family.                                                                                      |

`--font-default` reaches the page only through the reset, which `@codenhub/styles`, `/native`, `/tw`, `/tw/native`, and `/tw/reset` include. With `/theme` or `/components` alone, set `font-family` on `body` yourself. The aesthetic tokens are read by the aesthetic's own class, so they work with any entrypoint.

To use a web font, load it the way you load any font, then name it in the token. Set the token on `:root` for the whole page, or on any element for that part of it:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap" />
```

```css
:root {
  --font-default: "Inter", system-ui, sans-serif;
}
```

A self-hosted font is declared with `@font-face` and named the same way:

```css
@font-face {
  font-family: "Pixelify Sans";
  src: url("/fonts/pixelify-sans.woff2") format("woff2");
  font-weight: 400 700;
  font-display: swap;
}

:root {
  --font-pixel: "Pixelify Sans", monospace;
}
```

Load weights 400 to 700, and 800 for `--font-rounded`: components set `font-weight` from 400 to 700, and `.chunky-tile` sets its labels in 800. A browser that lacks a weight fakes it by thickening the regular one, which smears a pixel or handwriting face. Always end the stack with a generic family, such as `sans-serif` or `monospace`, so text still renders while the font loads or if it fails to.

## Next

The screen has your colors in both themes. [Aesthetics](./aesthetics.md) changes what it is made of: thick black outlines, frosted glass, pixels, and more.
