# @codenhub/styles

Shared Codenhub CSS package with compiled styles, design tokens, theme support, component helper classes, layout helpers, typography utilities, and Tailwind CSS v4 source entrypoints.

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

Use compiled CSS when the app does not process this package through Tailwind.

```css
@import "@codenhub/styles";
```

```html
<main class="stack">
  <p class="text-label">Status</p>
  <h1 class="text-title">Ready to publish</h1>
  <button class="btn primary">Continue</button>
</main>
```

### Tailwind Source CSS

Use Tailwind source CSS when the app already builds Tailwind CSS v4 and needs Codenhub tokens/classes available during that build.

```css
@import "tailwindcss";
@import "@codenhub/styles/tw";

@source "./src";
```

### Theme Classes

Apply `.dark` to any ancestor to switch token values for that subtree.

```html
<html class="dark">
  <body>
    <button class="btn primary">Dark themed button</button>
  </body>
</html>
```

Apps own adding/removing `.dark`. This package only defines styles that respond to it.

## Reference

### Import Paths

| Path                             | Kind                | Contents                                                                       |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `@codenhub/styles`               | Compiled CSS        | Full stylesheet: theme, base styles, components, typography.                   |
| `@codenhub/styles/theme`         | Compiled CSS        | Theme tokens, light/dark variables, Tailwind theme output.                     |
| `@codenhub/styles/components`    | Compiled CSS        | Theme tokens plus component classes.                                           |
| `@codenhub/styles/tw`            | Tailwind source CSS | Full Tailwind v4 source: theme, base styles, components, utilities.            |
| `@codenhub/styles/tw/theme`      | Tailwind source CSS | Theme tokens, light/dark variables, custom dark variant.                       |
| `@codenhub/styles/tw/components` | Tailwind source CSS | Theme tokens plus component classes.                                           |
| `@codenhub/styles/tw/surface`    | Tailwind source CSS | Surface styles and empty-state utility.                                        |
| `@codenhub/styles/tw/button`     | Tailwind source CSS | Composable button utilities.                                                   |
| `@codenhub/styles/tw/form`       | Tailwind source CSS | Form, input, textarea, select, checkbox, switch utilities.                     |
| `@codenhub/styles/tw/feedback`   | Tailwind source CSS | Alert, badge, skeleton, progress utilities.                                    |
| `@codenhub/styles/tw/loader`     | Tailwind source CSS | Loader and activity indicator utilities.                                       |
| `@codenhub/styles/tw/tooltip`    | Tailwind source CSS | Tooltip utility.                                                               |
| `@codenhub/styles/tw/reset`      | Tailwind source CSS | Core resets: scrollbar, selection, body structure.                             |
| `@codenhub/styles/tw/native`     | Tailwind source CSS | Opt-in classless styling for native HTML elements (headings, inputs, buttons). |
| `@codenhub/styles/tw/typography` | Tailwind source CSS | Typography helper classes.                                                     |
| `@codenhub/styles/tw/utilities`  | Tailwind source CSS | Layout primitives and contrast utilities.                                      |

### Detailed Docs

Detailed package reference ships with the package under `docs/`:

| Document                                 | Purpose                                                               |
| ---------------------------------------- | --------------------------------------------------------------------- |
| [Overview](./docs/index.md)              | Package model, entrypoints, and class model.                          |
| [Tokens](./docs/tokens.md)               | Color and foundation token contracts.                                 |
| [Classes](./docs/classes.md)             | Layout, surface, action, form, feedback, loader, and tooltip helpers. |
| [Accessibility](./docs/accessibility.md) | CSS accessibility hooks and non-goals.                                |
| [Tests](./docs/tests.md)                 | Build and browser validation strategy.                                |

### Loader Utilities (`@codenhub/styles/tw/loader`)

Activity indicator classes. Compose with `.loader` (standalone element) or use `.ai` as a low-level mask base on any element.

| Class                  | Animation                                     |
| ---------------------- | --------------------------------------------- |
| `.ai`                  | Base mask utility. Default: circular spinner. |
| `.loader`              | Standalone inline loader. Composes `.ai`.     |
| `.dots-wave`           | Three dots bouncing in a wave.                |
| `.dots-fade`           | Three dots fading in and out.                 |
| `.dots-queue`          | Dot queuing from left to right.               |
| `.dots-rotate`         | Side dots rotating around a center dot.       |
| `.dots-grow`           | Three dots growing and shrinking.             |
| `.dots-grow-alternate` | Outer dots small, center dot pulses.          |
| `.dot-bounce`          | Single dot bouncing with squash effect.       |
| `.bars-wave`           | Three vertical bars scaling in a wave.        |
| `.pulse-ring`          | Two concentric rings pulsing outward.         |

Size variants `.sm` and `.lg` work on `.loader`. Always add `aria-hidden="true"` or a visible label.

```html
<span class="loader" aria-hidden="true"></span>
<span class="loader dots-wave" aria-hidden="true"></span>
<span class="loader bars-wave lg" aria-hidden="true"></span>
```

## Examples

### Composed Buttons

Intent classes set color meaning. Presentation classes set visual treatment and consume active intent tone slots.

```html
<button class="btn primary">Primary</button>
<button class="btn success out">Success outline</button>
<button class="btn destructive ghost">Ghost danger</button>
<button class="btn secondary loading" disabled>Saving</button>
```

### Forms And Feedback

```html
<label class="field">
  <span class="label">Email</span>
  <input class="ipt" type="email" aria-describedby="email-hint" />
  <span class="hint" id="email-hint">Use a work email.</span>
</label>

<div class="alert success" role="status">Saved successfully.</div>
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

The package intentionally does not expose private files outside the documented import paths. If exports change, this README and the related `docs/` documents must be updated in the same change.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.

It includes SVG icons from [Lucide](https://lucide.dev) which are licensed under the [ISC License](https://github.com/lucide-dev/lucide/blob/main/LICENSE). See the [NOTICE](NOTICE) file for details.
