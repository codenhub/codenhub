---
title: Styling
description: The stylesheet, colors with and without @codenhub/styles, presentation classes, size, dark mode, color overrides, Content Security Policy, and stylesheet order.
order: 4
---

# Styling

Toasts and dialogs should look like part of your app, not like a library that wandered in. This page covers the stylesheet, where the colors come from, the presentation classes, size, dark mode, overriding colors yourself, and Content Security Policy. Everything here is plain CSS: no build plugin, no theme object, no runtime styling API.

## The stylesheet

Load the stylesheet once, where your app starts:

```ts
import "@codenhub/toaster/styles";
```

It holds everything visual: the stacks and their positions, toast and dialog layout, animations, and colors. Without it, toasts are still added to the page, but with no positioning, layout, or color. If your first toast shows up looking like a forgotten paragraph at the bottom of the page, this import is the reason.

The import works with any bundler that handles CSS imports, such as Vite, webpack, or esbuild. Without a bundler, link `dist/styles/index.css` from the package with a `<link rel="stylesheet">` tag.

### What it sets outside toasts

Almost every rule is scoped to the package's own elements, but a few are page-wide, and it's better to hear about them here than from a confused teammate:

- **`color-scheme` on the root.** The stylesheet sets `color-scheme: light dark` on `:root`, so the browser draws built-in controls such as scrollbars and form fields in dark mode when the operating system prefers dark. The `dark`, `light`, `theme-dark`, and `theme-light` classes and the `data-theme` attribute set it too, on whatever element carries them; see [Dark mode](#dark-mode). If your page sets its own `color-scheme`, yours applies wherever your rule is more specific or loads later.
- **Presentation classes.** It defines `.solid`, `.soft`, `.ghost`, `.edged`, and `.edgeless` globally, in the CSS `@layer components`. They only set the `--ui-fill`, `--ui-fg-on-fill`, and `--ui-border` custom properties. An element of your own that happens to share a class name won't change by itself, but those properties are inherited, and toasts and `@codenhub/styles` components read them, so anything of that kind inside it picks them up. If `.solid` already means something else in your app, rename yours.

## Where the colors come from

Toasts and dialogs pick their colors in one of two ways, depending on whether `@codenhub/styles` is on the page.

### Standalone

Without `@codenhub/styles`, the stylesheet uses built-in colors: a neutral surface for default toasts, green for success, red for error, amber for warning, and blue for info, each with a light and a dark version. You don't need to set anything up.

### With `@codenhub/styles`

[`@codenhub/styles`](https://www.npmjs.com/package/@codenhub/styles) is an optional design system. When its stylesheet, version 0.3.0 or newer, is on the page, toasts and dialogs build their colors from its theme instead:

- **Intent colors**: toasts read `--color-success`, `--color-destructive` (for errors), `--color-warning`, and `--color-info`, and dialog buttons read `--color-primary`, so changing your theme's colors changes both.
- **Presentation**: how much color fills the background and the border follows `--ui-fill` and `--ui-border`.
- **Look and feel**: a theme's corner radius, border width, shadow, clipping, and elevation (`--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`, `--ui-clip`, `--ui-elevation`) apply to toasts and dialogs too, so a glassy or neobrutalist theme reaches them as well.

These are read live. Change a theme variable or class at runtime and toasts already on screen update with it.

By default a toast looks like a `@codenhub/styles` alert: a lightly tinted surface with a border and no shadow. Dialog buttons look like its buttons: solid color, no border, slightly raised.

## Presentation classes

Pass a presentation class through `className` to change how strongly a toast is colored:

| Class      | Effect                                    |
| ---------- | ----------------------------------------- |
| `solid`    | Fully colored background.                 |
| `soft`     | Lightly tinted background. Toast default. |
| `ghost`    | No background fill.                       |
| `edged`    | Draws the border. Toast default.          |
| `edgeless` | Removes the border.                       |

```ts
import { toast } from "@codenhub/toaster";

toast.error("Note could not be saved", { className: "solid" });
toast.info("Syncing in the background", { className: "ghost edgeless" });
```

These classes work standalone and with `@codenhub/styles`. They set `--ui-fill` and `--ui-border`, so a class on the toast itself beats one on any ancestor. To apply one to every toast from a toaster, use the toaster's `className` option.

## Size

Every toast is 22.25rem (356px) wide. On a narrow screen it shrinks to fit, keeping the stack's margin on both sides. All toasts in a stack share the same width, so the stack keeps straight edges.

To change the width, set `width` in a class and pass it through `className`:

```css
.wide-toast {
  width: 28rem;
}
```

```ts
toast.info("A longer message that needs more room", { className: "wide-toast" });
```

## Animation speed

Toasts slide in and out over 400ms, and dialogs fade over 200ms. Both read the same motion custom properties `@codenhub/styles` uses, so you can change them with or without it:

| Property                   | Default                      | Controls                                      |
| -------------------------- | ---------------------------- | --------------------------------------------- |
| `--motion-duration-slow`   | `400ms`                      | Toast entrance, exit, and sliding in a stack. |
| `--motion-ease`            | `cubic-bezier(0.2, 0, 0, 1)` | Easing of those toast animations.             |
| `--motion-duration-normal` | `200ms`                      | Dialog and backdrop fades.                    |

```css
:root {
  --motion-duration-slow: 250ms;
}
```

Reduced motion turns all of these off regardless; see [Reduced motion](accessibility.md#reduced-motion).

## Dark mode

With no theme set, toasts and dialogs follow the operating system's light or dark preference. To choose explicitly, put one of these on an ancestor, usually `<html>`:

- Dark: the `dark` or `theme-dark` class, or `data-theme="dark"`.
- Light: the `light` or `theme-light` class, or `data-theme="light"`.

`@codenhub/theme` sets the `theme-<name>` class and `data-theme="<name>"`, so themes named `dark` and `light` match out of the box. For dark themes with other names, turn on its `darkClass` option, which adds the `dark` class.

Colors are resolved with CSS `light-dark()` against each element's own `color-scheme`, so a light section inside a dark page works. Toasts rendered inside it, by a [toaster scoped to that section](instances.md), use light colors:

```html
<html class="dark">
  <body>
    <aside id="preview" class="light" style="color-scheme: light">
      <!-- A toaster created with { container: preview } shows light toasts here. -->
    </aside>
  </body>
</html>
```

## Color overrides

When a color has to differ from the theme, set the matching `--toast-color-*` custom property in your own CSS. It replaces the computed color for that one value, standalone or with `@codenhub/styles`. Each value is final: it's used exactly as given, not mixed with anything.

Custom properties are inherited, so where you set one decides what it affects:

```css
/* Every toast and dialog on the page. */
:root {
  --toast-color-success-bg: #0f2e1b;
  --toast-color-success-fg: #4ade80;
  --toast-color-success-edge: #166534;
}

/* Only toasts inside the sidebar, from a toaster created with { container: sidebar }. */
#sidebar {
  --toast-color-error-bg: #450a0a;
  --toast-color-error-fg: #fca5a5;
}

/* One toast, through className. */
.quota-alert {
  --toast-color-error-bg: #7f1d1d;
}
```

```ts
toast.error("Storage almost full", { className: "quota-alert" });
```

For dialogs, put the class on the dialog with the call's `className` or the instance's `className`.

| Property                     | What it colors                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `--toast-color-default-bg`   | Background of a neutral toast.                                                          |
| `--toast-color-default-fg`   | Text and icon of a neutral toast.                                                       |
| `--toast-color-default-edge` | Border of a neutral toast.                                                              |
| `--toast-color-success-bg`   | Background of a success toast.                                                          |
| `--toast-color-success-fg`   | Text and icon of a success toast.                                                       |
| `--toast-color-success-edge` | Border of a success toast.                                                              |
| `--toast-color-error-bg`     | Background of an error toast.                                                           |
| `--toast-color-error-fg`     | Text and icon of an error toast.                                                        |
| `--toast-color-error-edge`   | Border of an error toast.                                                               |
| `--toast-color-warning-bg`   | Background of a warning toast.                                                          |
| `--toast-color-warning-fg`   | Text and icon of a warning toast.                                                       |
| `--toast-color-warning-edge` | Border of a warning toast.                                                              |
| `--toast-color-info-bg`      | Background of an info toast.                                                            |
| `--toast-color-info-fg`      | Text and icon of an info toast.                                                         |
| `--toast-color-info-edge`    | Border of an info toast.                                                                |
| `--toast-color-surface`      | Background of a dialog and its cancel button.                                           |
| `--toast-color-text`         | Text of a dialog and its cancel button.                                                 |
| `--toast-color-border`       | Border of a dialog and its cancel button under `edged`, and of the prompt's text field. |
| `--toast-color-primary-bg`   | Focus ring and focused border of the prompt's text field.                               |

The package never sets these properties itself. They're entirely yours.

## Content Security Policy

The package injects no `<style>` element. The stylesheet is one you load, and the only styles the package writes are individual properties on elements through `element.style.setProperty()`, which a `style-src` policy doesn't block. A strict policy such as this one needs no nonce or exception for it:

```http
Content-Security-Policy: style-src 'self';
```

The package also never parses HTML, so it works under Trusted Types as well; see [Accessibility and security](accessibility.md#trusted-types).

## Stylesheet order with `@codenhub/styles/native`

If you use `@codenhub/styles`' native-element stylesheet (`@codenhub/styles/native` or `@codenhub/styles/tw/native`), import it **before** the toaster stylesheet:

```ts
import "@codenhub/styles/native";
import "@codenhub/toaster/styles";
```

The native stylesheet styles every plain `<button>` as a neutral button. Dialog buttons are plain `<button>` elements, and both stylesheets style them with equally weak selectors, so whichever loads last wins. Load the native stylesheet last and every dialog button turns neutral, including the red "Delete" one, which is exactly the button that most needs to look dangerous.

## Next

The notes app looks the part. The last page, [Accessibility and security](accessibility.md), covers what screen reader users hear, how focus moves, reduced motion, and the trust boundary of custom content.
