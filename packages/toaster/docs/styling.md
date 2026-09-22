---
title: Styling
description: Guide to CSS styling, design tokens, live composition with @codenhub/styles, presentation axes, dark mode, and CSP.
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

### Presentation classes

Presentation helper classes (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) adjust how background fills and borders render:

```ts
import { toast, dialog } from "@codenhub/toaster";

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

## Custom token overrides (`ToastTokens`)

When you need specific colors that deviate from the active theme, you can pass custom color tokens either globally via `ToasterConfig.tokens` or per notification via `ToastOptions.tokens`. A custom token always supersedes the composed formula for that specific property:

```ts
import { toast, createToaster } from "@codenhub/toaster";

// Per-instance token configuration:
const brandedToaster = createToaster({
  tokens: {
    successBg: "#0f2e1b",
    successFg: "#4ade80",
    successEdge: "#166534",
    primaryBg: "#6366f1",
    primaryFg: "#ffffff",
  },
});

// Per-toast override:
toast.error("Critical storage alert", {
  tokens: {
    errorBg: "#450a0a",
    errorFg: "#fca5a5",
    errorEdge: "#991b1b",
  },
});
```

### Available token properties

| Category              | Properties                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Default (neutral)** | `defaultBg`, `defaultFg`, `defaultEdge`                                                                                      |
| **Success**           | `successBg`, `successFg`, `successEdge`, `successBtnBg`, `successBtnFg`, `successBtnBgHover`, `successBtnEdge`               |
| **Error**             | `errorBg`, `errorFg`, `errorEdge`, `errorBtnBg`, `errorBtnFg`, `errorBtnBgHover`, `errorBtnEdge`                             |
| **Warning**           | `warningBg`, `warningFg`, `warningEdge`                                                                                      |
| **Info**              | `infoBg`, `infoFg`, `infoEdge`                                                                                               |
| **Dialog surfaces**   | `surface`, `border`, `text`                                                                                                  |
| **Dialog buttons**    | `primaryBg`, `primaryFg`, `primaryBgHover`, `primaryEdge`, `secondaryBg`, `secondaryFg`, `secondaryBgHover`, `secondaryEdge` |

## Content Security Policy (CSP)

When applying token overrides, `@codenhub/toaster` writes CSS variables through an instance-managed `<style>` element. If your application enforces a strict Content Security Policy that blocks unnonced inline styles:

```http
Content-Security-Policy: style-src 'self' 'nonce-rAnd0m123';
```

Pass the nonce to your toaster configuration:

```ts
import { createToaster } from "@codenhub/toaster";

const toaster = createToaster({
  nonce: "rAnd0m123",
  tokens: {
    primaryBg: "indigo",
  },
});
```

## Classless native button stylesheet ordering

If your application uses `@codenhub/styles`' classless native-element mappings (`@codenhub/styles/native` or `@codenhub/styles/tw/native`), be mindful of stylesheet import order:

```ts
// Correct import order:
import "@codenhub/styles/native";
import "@codenhub/toaster/styles";
```

`@codenhub/styles/native` resets every bare `<button>` element to neutral intent at zero specificity. Because `@codenhub/toaster`'s dialog buttons are bare `<button>` elements that also use zero specificity, importing native mappings _after_ `@codenhub/toaster/styles` will overwrite dialog button colors. Always import the native mappings first.
