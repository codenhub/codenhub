---
title: Styling
description: Guide to CSS styling, color custom properties, live composition with @codenhub/styles, presentation axes, dark mode, and CSP.
order: 4
---

# Styling and theming

`@codenhub/toaster` uses an adaptable CSS architecture built on runtime CSS custom property composition. It composes seamlessly with `@codenhub/styles` design tokens when present, but remains fully usable standalone with zero external dependencies.

## The required stylesheet

Import `@codenhub/toaster/styles` once in your application entrypoint:

```ts
import "@codenhub/toaster/styles";
```

This stylesheet provides layout containers, responsive positioning, FLIP animation primitives, native `<dialog>` styles, and color formula rules. No Tailwind configuration or build plugins are required.

## Live composition with `@codenhub/styles`

If your project installs `@codenhub/styles >=0.3.0`, toaster components participate automatically in its live theme and aesthetic system:

- **Semantic intents**: Toast and dialog colors read directly from `--color-<intent>` (`--color-success`, `--color-error`, `--color-warning`, `--color-info`, `--color-primary`).
- **Presentation axes**: Toasts adapt to `--ui-fill` and `--ui-border` percentages.
- **Aesthetic materials**: Active aesthetic classes (such as `.glass` or `.neobrutalism`) pass through their `--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`, `--ui-clip`, and `--ui-elevation` properties.

### Component role defaults

To match the wider ecosystem, toaster components mirror the base styling conventions of `@codenhub/styles`:

- **Toast body**: Composes like an unstyled `.alert` component: a soft surface (12% intent fill), edged border, grounded on the page background with elevation 0.
- **Dialog action buttons**: Compose like an unstyled `.btn` component: a solid surface (100% intent fill), edgeless border, and raised elevation 1.

Every toast is 22.25rem (356px) wide, narrowed to fit the viewport inside the stack's margin, so a stack keeps straight edges. Set `width` through `className` to change it.

### Presentation classes

Presentation helper classes (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) adjust how background fills and borders render:

```ts
import { toast } from "@codenhub/toaster";
import { dialog } from "@codenhub/toaster/dialog";

// Render a high-contrast solid toast:
toast.success("Build deployed", {
  className: "solid",
});

// Render a ghost notification:
toast.info("Syncing...", {
  className: "ghost",
});
```

Because presentation classes set CSS custom properties (`--ui-fill`, `--ui-border`), a class applied directly to a toast element overrides any presentation class declared on an ancestor element.

## Standalone fallback

When `@codenhub/styles` is not installed, `@codenhub/toaster/styles` executes the exact same color-mixing formulas against internal, pre-computed defaults (`generated-defaults.css`). These defaults are generated directly from the canonical `@codenhub/styles` palette at build time, ensuring pixel-consistent aesthetics without introducing runtime dependencies.

## Dark mode support

Dark mode styling activates automatically when an ancestor element (typically `<html>`) carries either:

- The `.dark` class
- The `data-theme="dark"` attribute

Because colors resolve through CSS `light-dark()` against the element's computed `color-scheme`, dark mode works consistently in both standalone and composed modes.

### Nested themes

Theme resolution is computed locally. If your application embeds a `.light` or `.dark` section inside an oppositely-themed parent, toasts or dialogs rendered inside that container inherit the correct local colors:

```html
<html class="dark">
  <body>
    <!-- Nested light-themed workspace panel -->
    <div id="light-panel" class="light" style="color-scheme: light">
      <!-- Toaster anchored inside this panel uses light-mode tokens -->
    </div>
  </body>
</html>
```

## Color overrides

When you need colors that deviate from the active theme, set the package's `--toast-color-*` CSS custom properties in your own stylesheet. The stylesheet reads each one ahead of the composed formula, so a property you set always supersedes the composed color for that specific value. Custom properties inherit, so where you set one decides what it reaches:

```css
/* Globally: every toast and dialog on the page. */
:root {
  --toast-color-success-bg: #0f2e1b;
  --toast-color-success-fg: #4ade80;
  --toast-color-success-edge: #166534;
}

/* Scoped: only toasts rendered inside this container. */
#billing-panel {
  --toast-color-error-bg: #450a0a;
  --toast-color-error-fg: #fca5a5;
  --toast-color-error-edge: #991b1b;
}

/* Per toast: a class passed through `className`. */
.storage-alert {
  --toast-color-error-bg: #7f1d1d;
}
```

```ts
import { toast, createToaster } from "@codenhub/toaster";

// Scoped: a toaster whose stacks render inside #billing-panel.
const billingToaster = createToaster({ container: document.querySelector<HTMLElement>("#billing-panel")! });

// Per toast:
toast.error("Critical storage alert", { className: "storage-alert" });
```

`ToasterConfig.className` applies a class to every toast of an instance, and `DialogsConfig.className` or a dialog's own `className` applies one to the `<dialog>` element. The package sets these properties nowhere itself, so it injects no `<style>` element for them.

### Available properties

| Property                     | What it colors                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `--toast-color-default-bg`   | Background of a default (no-severity) toast.                                              |
| `--toast-color-default-fg`   | Text and icon color of a default toast.                                                   |
| `--toast-color-default-edge` | Border of a default toast.                                                                |
| `--toast-color-success-bg`   | Background of a success toast.                                                            |
| `--toast-color-success-fg`   | Text and icon color of a success toast.                                                   |
| `--toast-color-success-edge` | Border of a success toast.                                                                |
| `--toast-color-error-bg`     | Background of an error toast.                                                             |
| `--toast-color-error-fg`     | Text and icon color of an error toast.                                                    |
| `--toast-color-error-edge`   | Border of an error toast.                                                                 |
| `--toast-color-warning-bg`   | Background of a warning toast.                                                            |
| `--toast-color-warning-fg`   | Text and icon color of a warning toast.                                                   |
| `--toast-color-warning-edge` | Border of a warning toast.                                                                |
| `--toast-color-info-bg`      | Background of an info toast.                                                              |
| `--toast-color-info-fg`      | Text and icon color of an info toast.                                                     |
| `--toast-color-info-edge`    | Border of an info toast.                                                                  |
| `--toast-color-surface`      | Background of the dialog container and its cancel button.                                 |
| `--toast-color-text`         | Text color of the dialog container and its cancel button.                                 |
| `--toast-color-border`       | Border of the dialog container and cancel button under `.edged`, and of the prompt input. |
| `--toast-color-primary-bg`   | Focus ring and focused border of the prompt input.                                        |

Every value is final, a background, border, or foreground exactly as it renders, never an ingredient the package mixes further. Unset, each one matches the composed `@codenhub/styles` look, or the package's generated defaults without it.

## Content Security Policy (CSP)

`@codenhub/toaster` injects no `<style>` element: the stylesheet is one you load, and the package writes only individual inline properties through the CSSOM (`element.style.setProperty`), which a `style-src` policy does not block. A strict policy such as the following needs no nonce for the package:

```http
Content-Security-Policy: style-src 'self';
```

## Classless native button stylesheet ordering

If your application uses `@codenhub/styles`' classless native-element mappings (`@codenhub/styles/native` or `@codenhub/styles/tw/native`), be mindful of stylesheet import order:

```ts
// Correct import order:
import "@codenhub/styles/native";
import "@codenhub/toaster/styles";
```

`@codenhub/styles/native` resets every bare `<button>` element to neutral intent at zero specificity. Because `@codenhub/toaster`'s dialog buttons are bare `<button>` elements that also use zero specificity, importing native mappings _after_ `@codenhub/toaster/styles` will overwrite dialog button colors. Always import the native mappings first.
