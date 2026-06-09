# @codenhub/styles

Shared Codenhub CSS package with ready-to-import styles, design tokens, theme support, and optional Tailwind CSS v4 source entrypoints.

The compiled CSS path is fully supported and canonical for apps that want a drop-in stylesheet. The Tailwind source path is also canonical for apps that already run Tailwind and want build-time processing, stronger token integration, and better pruning of generated utility output.

This package is intentionally CSS-only. JavaScript behavior, DOM helpers, and UI scripts belong in packages such as `@codenhub/ui-kit`.

## Installation

```sh
pnpm add @codenhub/styles
```

Install Tailwind CSS only when using the `@codenhub/styles/tw` source entrypoints:

```sh
pnpm add @codenhub/styles tailwindcss
```

`tailwindcss` is an optional peer dependency. It is not required for the compiled CSS entrypoints.

## Usage

### Ready-To-Import CSS

Use the root import when you want the full Codenhub stylesheet without asking your app to process the package through Tailwind.

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

This path is the simplest integration and is fully supported. It includes the compiled theme tokens, base styles, typography utilities, and component classes.

### Tailwind Build-Time CSS

Use the `tw` import when your app already builds Tailwind CSS and you want Codenhub styles to participate in that build.

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./src";
```

This path gives Tailwind more context. It can use Codenhub tokens in `@apply`, utility classes, variants, and generated output while giving the consumer build the best chance to avoid unused Tailwind output.

### Partial Imports

Import only the shared tokens and theme behavior:

```css
@import "@codenhub/styles/theme";
```

or through Tailwind:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/theme";
```

Import only reusable component classes:

```css
@import "@codenhub/styles/components";
```

or through Tailwind:

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/components";
```

Consumers should usually import `@codenhub/styles` or `@codenhub/styles/tw` unless they intentionally manage tokens and components separately.

## Reference

### Supported Import Paths

| Path                             | Kind                | Description                                                          |
| -------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `@codenhub/styles`               | Compiled CSS        | Complete prebuilt stylesheet with tokens, base styles, and classes.  |
| `@codenhub/styles/theme`         | Compiled CSS        | Prebuilt tokens and theme behavior only.                             |
| `@codenhub/styles/components`    | Compiled CSS        | Prebuilt component class CSS only.                                   |
| `@codenhub/styles/tw`            | Tailwind source CSS | Complete Tailwind v4 source entrypoint for consumer-side processing. |
| `@codenhub/styles/tw/theme`      | Tailwind source CSS | Tailwind v4 source entrypoint for tokens and theme behavior.         |
| `@codenhub/styles/tw/components` | Tailwind source CSS | Tailwind v4 source entrypoint for reusable component classes.        |

### Tokens

Tokens are supported in both compiled CSS and Tailwind source paths. They ship with default/fallback values, are light/dark theme-compatible by default, and are exposed as CSS variables.

With compiled CSS, tokens are available as normal CSS variables and through prebuilt classes that reference them.

```css
@import "@codenhub/styles/theme";

.panel {
  background: var(--color-background);
  color: var(--color-text);
  border-color: var(--color-border);
}
```

With Tailwind source CSS, the same tokens also become available to Tailwind utilities and `@apply` usage.

```css
@import "tailwindcss";
@import "@codenhub/styles/tw/theme";

.panel {
  @apply bg-background text-text border-border font-default;
}
```

Default token groups:

| Token                          | Default/Fallback Intent          | Dark Mode Behavior                              | Tailwind Usage                                         |
| ------------------------------ | -------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `--font-default`               | Default app font family.         | Stable across light and dark themes by default. | `font-default`                                         |
| `--color-primary`              | Primary action/content color.    | Inverts for dark surfaces.                      | `bg-primary`, `text-primary`, `border-primary`         |
| `--color-primary-contrast`     | Text/icon color on primary.      | Inverts with `--color-primary`.                 | `text-primary-contrast`, `bg-primary-contrast`         |
| `--color-primary-hover`        | Primary hover state.             | Adjusts for dark surfaces.                      | `hover:bg-primary-hover`, `text-primary-hover`         |
| `--color-accent`               | Secondary/accent surface.        | Adjusts for dark surfaces.                      | `bg-accent`, `text-accent`, `border-accent`            |
| `--color-accent-contrast`      | Text/icon color on accent.       | Inverts with `--color-accent`.                  | `text-accent-contrast`, `bg-accent-contrast`           |
| `--color-accent-hover`         | Accent hover state.              | Adjusts for dark surfaces.                      | `hover:bg-accent-hover`, `text-accent-hover`           |
| `--color-border`               | Default border color.            | Adjusts for dark surfaces.                      | `border-border`                                        |
| `--color-border-hover`         | Interactive border color.        | Adjusts for dark surfaces.                      | `hover:border-border-hover`                            |
| `--color-background`           | Page background.                 | Switches between light and dark base surfaces.  | `bg-background`, `text-background`                     |
| `--color-foreground`           | Raised foreground surface.       | Switches between light and dark surfaces.       | `bg-foreground`, `text-foreground`                     |
| `--color-surface`              | Nested or muted surface.         | Switches between light and dark surfaces.       | `bg-surface`, `text-surface`                           |
| `--color-text`                 | Primary text color.              | Switches for readable light/dark contrast.      | `text-text`, `bg-text`                                 |
| `--color-text-secondary`       | Secondary text color.            | Adjusts for muted light/dark contrast.          | `text-text-secondary`, `bg-text-secondary`             |
| `--color-success`              | Success state color.             | Stable semantic color by default.               | `bg-success`, `text-success`, `border-success`         |
| `--color-success-contrast`     | Text/icon color on success.      | Stable semantic contrast by default.            | `text-success-contrast`, `bg-success-contrast`         |
| `--color-success-light`        | Light success surface.           | Available in both themes.                       | `bg-success-light`, `text-success-light`               |
| `--color-success-dark`         | Dark success surface.            | Available in both themes.                       | `bg-success-dark`, `text-success-dark`                 |
| `--color-warning`              | Warning state color.             | Stable semantic color by default.               | `bg-warning`, `text-warning`, `border-warning`         |
| `--color-warning-contrast`     | Text/icon color on warning.      | Stable semantic contrast by default.            | `text-warning-contrast`, `bg-warning-contrast`         |
| `--color-warning-light`        | Light warning surface.           | Available in both themes.                       | `bg-warning-light`, `text-warning-light`               |
| `--color-warning-dark`         | Dark warning surface.            | Available in both themes.                       | `bg-warning-dark`, `text-warning-dark`                 |
| `--color-destructive`          | Destructive/error state color.   | Stable semantic color by default.               | `bg-destructive`, `text-destructive`                   |
| `--color-destructive-contrast` | Text/icon color on destructive.  | Stable semantic contrast by default.            | `text-destructive-contrast`, `bg-destructive-contrast` |
| `--color-destructive-light`    | Light destructive surface.       | Available in both themes.                       | `bg-destructive-light`, `text-destructive-light`       |
| `--color-destructive-dark`     | Dark destructive surface.        | Available in both themes.                       | `bg-destructive-dark`, `text-destructive-dark`         |
| `--color-info`                 | Informational state color.       | Stable semantic color by default.               | `bg-info`, `text-info`, `border-info`                  |
| `--color-info-contrast`        | Text/icon color on info.         | Stable semantic contrast by default.            | `text-info-contrast`, `bg-info-contrast`               |
| `--color-info-light`           | Light informational surface.     | Available in both themes.                       | `bg-info-light`, `text-info-light`                     |
| `--color-info-dark`            | Dark informational surface.      | Available in both themes.                       | `bg-info-dark`, `text-info-dark`                       |
| `--breakpoint-xs`              | Extra-small responsive width.    | Stable across themes.                           | `xs:*` responsive variant when processed by Tailwind.  |
| `--breakpoint-2xl`             | Extended large responsive width. | Stable across themes.                           | `2xl:*` responsive variant when processed by Tailwind. |

The exact fallback values are owned by the package source and may evolve before the first stable release. The semantic token names are the supported consumer contract.

### Theme Behavior

The theme contract uses light values by default and dark values under the `.dark` class.

```html
<html class="dark">
  <body>
    <button class="btn primary">Dark themed button</button>
  </body>
</html>
```

Apps are responsible for applying or removing `.dark`. They can manage it manually or with a theme helper such as `@codenhub/theme`.

### Component Classes

The component entrypoints are expected to include reusable classes that depend on the shared token contract.

Planned class groups include:

| Group    | Examples                         | Purpose                                |
| -------- | -------------------------------- | -------------------------------------- |
| Layout   | `.sect`, `.sect-container`       | Common page section layout primitives. |
| Buttons  | `.btn`, `.primary`, `.secondary` | Shared button structure and variants.  |
| Surfaces | `.card`                          | Common bordered content containers.    |
| Forms    | `.ipt`                           | Common input shape and focus behavior. |
| Overlays | `.tooltip`                       | Attribute-driven tooltip styling.      |

### Typography Utilities

The full entrypoints are expected to include Codenhub typography utilities.

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

| Requirement     | Details                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| CSS imports     | Consumer tooling must support package CSS imports.                       |
| Tailwind CSS    | Required only for `@codenhub/styles/tw` entrypoints. Version 4 or newer. |
| Browser runtime | The stylesheet targets browsers. It has no JavaScript runtime behavior.  |
| Dark mode       | Consumers are responsible for applying or removing the `.dark` class.    |
| Accessibility   | Styles do not replace semantic HTML, ARIA, focus management, or labels.  |

## Notes

This package publishes CSS as the public runtime surface. It does not expose JavaScript or TypeScript entrypoints.

Supported surfaces:

| Area            | Status      | Notes                                                             |
| --------------- | ----------- | ----------------------------------------------------------------- |
| Compiled CSS    | Supported   | Canonical drop-in CSS entrypoints under `@codenhub/styles`.       |
| Tailwind source | Supported   | Canonical build-time entrypoints under `@codenhub/styles/tw`.     |
| Tokens          | Supported   | Shared CSS variables available through compiled and source paths. |
| Class inventory | Implemented | Initial classes are based on `@codenhub/ui-kit` style references. |

Lifecycle exception: `@codenhub/styles` intentionally omits `main`, `module`, and `types` from `package.json` because it is a CSS-only package with no JavaScript API. This remains safe to build, test, and publish because every supported consumer import path is listed explicitly in `exports`, build output is generated into `dist`, and package checks validate the CSS build contract.

The package intentionally does not expose private files outside the documented import paths. If the exports change, this README must be updated in the same change.
