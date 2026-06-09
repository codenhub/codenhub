# @codenhub/styles

Shared Codenhub CSS package with compiled styles, design tokens, theme support, reusable component classes, typography utilities, and Tailwind CSS v4 source entrypoints.

This package is CSS-only. It does not ship JavaScript behavior, DOM helpers, React components, or TypeScript APIs.

## Installation

```sh
pnpm add @codenhub/styles
```

Install Tailwind CSS only when importing Tailwind source entrypoints:

```sh
pnpm add @codenhub/styles tailwindcss
```

`tailwindcss` is an optional peer dependency. Compiled CSS imports do not require Tailwind in consumer apps.

## Usage

### Compiled CSS

Import the full compiled stylesheet when the app does not process this package through Tailwind.

```css
@import "@codenhub/styles";
```

```html
<section class="sect">
  <div class="sect-container">
    <article class="card">
      <h1 class="text-title">Create something useful</h1>
      <button class="btn primary">Save</button>
    </article>
  </div>
</section>
```

The root compiled import includes theme tokens, dark-mode variables, global base styles, component classes, and typography utilities.

### Tailwind Source CSS

Import the Tailwind source entrypoint when the app already builds Tailwind CSS v4 and needs Codenhub tokens/classes available during that build.

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./src";
```

The Tailwind source path lets consumers use Codenhub tokens in Tailwind utilities, variants, and `@apply`.

### Partial Imports

Theme-only compiled CSS:

```css
@import "@codenhub/styles/theme";
```

Theme-only Tailwind source CSS:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/theme";
```

Component-only compiled CSS:

```css
@import "@codenhub/styles/components";
```

Component-only Tailwind source CSS:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/components";
```

`components` imports include the theme token definitions because component classes use those tokens.

## Reference

### Import Paths

| Path                             | Kind                | Contents                                                            |
| -------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `@codenhub/styles`               | Compiled CSS        | Full stylesheet: theme, base styles, components, typography.        |
| `@codenhub/styles/theme`         | Compiled CSS        | Theme tokens, light/dark variables, Tailwind theme output.          |
| `@codenhub/styles/components`    | Compiled CSS        | Theme tokens plus component classes.                                |
| `@codenhub/styles/tw`            | Tailwind source CSS | Full Tailwind v4 source: theme, base styles, components, utilities. |
| `@codenhub/styles/tw/theme`      | Tailwind source CSS | Theme tokens, light/dark variables, custom dark variant.            |
| `@codenhub/styles/tw/components` | Tailwind source CSS | Theme tokens plus component classes.                                |

### Theme Tokens

Tokens are CSS variables. Light values are defined by default, and dark values apply inside `.dark`.

```html
<html class="dark">
  <body>
    <button class="btn primary">Dark themed button</button>
  </body>
</html>
```

Apps own adding/removing `.dark`. This package only defines styles that respond to it.

Default token groups:

| Token                          | Purpose                          | Tailwind Usage                                         |
| ------------------------------ | -------------------------------- | ------------------------------------------------------ |
| `--font-default`               | Default app font family.         | `font-default`                                         |
| `--color-primary`              | Primary action/content color.    | `bg-primary`, `text-primary`, `border-primary`         |
| `--color-primary-contrast`     | Text/icon color on primary.      | `text-primary-contrast`, `bg-primary-contrast`         |
| `--color-primary-hover`        | Primary hover state.             | `hover:bg-primary-hover`, `text-primary-hover`         |
| `--color-accent`               | Secondary/accent surface.        | `bg-accent`, `text-accent`, `border-accent`            |
| `--color-accent-contrast`      | Text/icon color on accent.       | `text-accent-contrast`, `bg-accent-contrast`           |
| `--color-accent-hover`         | Accent hover state.              | `hover:bg-accent-hover`, `text-accent-hover`           |
| `--color-border`               | Default border color.            | `border-border`                                        |
| `--color-border-hover`         | Interactive border color.        | `hover:border-border-hover`                            |
| `--color-background`           | Page background.                 | `bg-background`, `text-background`                     |
| `--color-foreground`           | Raised foreground surface.       | `bg-foreground`, `text-foreground`                     |
| `--color-surface`              | Nested or muted surface.         | `bg-surface`, `text-surface`                           |
| `--color-text`                 | Primary text color.              | `text-text`, `bg-text`                                 |
| `--color-text-secondary`       | Secondary text color.            | `text-text-secondary`, `bg-text-secondary`             |
| `--color-success`              | Success state color.             | `bg-success`, `text-success`, `border-success`         |
| `--color-success-contrast`     | Text/icon color on success.      | `text-success-contrast`, `bg-success-contrast`         |
| `--color-success-light`        | Light success surface.           | `bg-success-light`, `text-success-light`               |
| `--color-success-dark`         | Dark success surface.            | `bg-success-dark`, `text-success-dark`                 |
| `--color-warning`              | Warning state color.             | `bg-warning`, `text-warning`, `border-warning`         |
| `--color-warning-contrast`     | Text/icon color on warning.      | `text-warning-contrast`, `bg-warning-contrast`         |
| `--color-warning-light`        | Light warning surface.           | `bg-warning-light`, `text-warning-light`               |
| `--color-warning-dark`         | Dark warning surface.            | `bg-warning-dark`, `text-warning-dark`                 |
| `--color-destructive`          | Destructive/error state color.   | `bg-destructive`, `text-destructive`                   |
| `--color-destructive-contrast` | Text/icon color on destructive.  | `text-destructive-contrast`, `bg-destructive-contrast` |
| `--color-destructive-light`    | Light destructive surface.       | `bg-destructive-light`, `text-destructive-light`       |
| `--color-destructive-dark`     | Dark destructive surface.        | `bg-destructive-dark`, `text-destructive-dark`         |
| `--color-info`                 | Informational state color.       | `bg-info`, `text-info`, `border-info`                  |
| `--color-info-contrast`        | Text/icon color on info.         | `text-info-contrast`, `bg-info-contrast`               |
| `--color-info-light`           | Light informational surface.     | `bg-info-light`, `text-info-light`                     |
| `--color-info-dark`            | Dark informational surface.      | `bg-info-dark`, `text-info-dark`                       |
| `--breakpoint-xs`              | Extra-small responsive width.    | `xs:*` responsive variant with Tailwind.               |
| `--breakpoint-2xl`             | Extended large responsive width. | `2xl:*` responsive variant with Tailwind.              |

With compiled CSS, tokens are available as CSS variables:

```css
@import "@codenhub/styles/theme";

.panel {
  background: var(--color-background);
  color: var(--color-text);
  border-color: var(--color-border);
}
```

With Tailwind source CSS, tokens are available through Tailwind utilities and `@apply`:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/theme";

.panel {
  @apply bg-background text-text border-border font-default;
}
```

### Base Styles

The full entrypoints add global base styles:

| Selector                                                             | Styles                                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `::-webkit-scrollbar`                                                | Uses Codenhub spacing and primary/background colors.                                                                            |
| `html, body`                                                         | Applies background, text color, default font, flex column layout, full viewport minimum height, and hidden horizontal overflow. |
| `button`                                                             | Uses pointer cursor when not disabled.                                                                                          |
| `img`                                                                | Disables selection.                                                                                                             |
| `::selection`                                                        | Uses primary/primary-contrast colors.                                                                                           |
| `.selection-contrast::selection`, `.selection-contrast *::selection` | Reverses selection colors.                                                                                                      |
| `p`, `li`, `a`                                                       | Applies `.text-body`.                                                                                                           |

### Component Classes

Component entrypoints define these classes:

| Class or Pattern                                | Purpose                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `.sect`                                         | Centered section layout with vertical spacing and padding.                                               |
| `.sect-container`                               | Full-width centered container with `max-w-7xl` and vertical spacing.                                     |
| `.btn`                                          | Button base: inline flex layout, rounded shape, padding, font weight, color transition, loading support. |
| `.btn.loading`                                  | Hides button text and shows spinner using `::after`.                                                     |
| `.btn[disabled]`, `.btn.disabled`               | Applies disabled cursor and opacity.                                                                     |
| `.btn.primary`                                  | Primary button colors and hover color.                                                                   |
| `.btn.secondary`                                | Accent button colors and hover color.                                                                    |
| `.btn.success`                                  | Success button colors.                                                                                   |
| `.btn.destructive`, `.btn.danger`, `.btn.error` | Destructive button colors.                                                                               |
| `.btn.warning`                                  | Warning button colors.                                                                                   |
| `.btn.info`                                     | Info button colors.                                                                                      |
| `.card`                                         | Bordered rounded surface with padding, gap, and hover border transition.                                 |
| `.ipt`                                          | Input shape, border, padding, focus ring, and focus outline removal.                                     |
| `.tooltip`                                      | Relative tooltip host using `data-tooltip` content.                                                      |
| `.tooltip.icon`                                 | Circular icon-style tooltip trigger.                                                                     |
| `[data-tooltip-position="top"]`                 | Positions tooltip above host.                                                                            |
| `[data-tooltip-position="bottom"]`              | Positions tooltip below host.                                                                            |
| `[data-tooltip-position="left"]`                | Positions tooltip left of host.                                                                          |
| `[data-tooltip-position="right"]`               | Positions tooltip right of host.                                                                         |

### Typography Utilities

The full entrypoints define these Tailwind utilities:

| Class            | Purpose                        |
| ---------------- | ------------------------------ |
| `.text-display`  | Large display headings.        |
| `.text-title-lg` | Large section titles.          |
| `.text-title`    | Default section titles.        |
| `.text-title-sm` | Smaller titles or card titles. |
| `.text-label-lg` | Large label text.              |
| `.text-label`    | Default label text.            |
| `.text-body`     | Default body copy.             |

## Examples

### App With Compiled CSS

```css
@import "@codenhub/styles";
```

```html
<main class="sect">
  <div class="sect-container">
    <article class="card">
      <p class="text-label">Status</p>
      <h1 class="text-title">Ready to publish</h1>
      <button class="btn success">Continue</button>
    </article>
  </div>
</main>
```

### Vite App With Tailwind CSS

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./src";
```

```ts
import "./index.css";
```

### Theme-Only Consumer

```css
@import "@codenhub/styles/theme";

.app-shell {
  min-height: 100vh;
  background: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-default);
}
```

### Theme-Only Tailwind Consumer

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/theme";

@source "./src";

.app-shell {
  @apply bg-background text-text font-default min-h-screen;
}
```

## Requirements

| Requirement     | Details                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| CSS imports     | Consumer tooling must support package CSS imports.                                         |
| Tailwind CSS    | Required only for `@codenhub/styles/tw` entrypoints. Version 4 or newer.                   |
| Browser runtime | Styles target browsers. There is no JavaScript runtime behavior.                           |
| Dark mode       | Consumers apply or remove `.dark`; package CSS reacts to that class.                       |
| Accessibility   | Styles do not provide semantic HTML, labels, ARIA, keyboard behavior, or focus management. |

## Notes

This package publishes CSS as its public runtime surface. It does not expose JavaScript or TypeScript entrypoints.

Lifecycle exception: `@codenhub/styles` intentionally omits `main`, `module`, and `types` from `package.json` because it is a CSS-only package with no JavaScript API. Every supported consumer import path is listed explicitly in `exports`, build output is generated into `dist`, and package checks validate the CSS build contract.

The package intentionally does not expose private files outside the documented import paths. If exports change, this README must be updated in the same change.
