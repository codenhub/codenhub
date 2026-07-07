# @codenhub/styles Overview

**Status:** IMPLEMENTED
**Last updated:** 2026-06-18
**Scope:** `@codenhub/styles` package.

`@codenhub/styles` is a CSS-only styling foundation for Codenhub interfaces. It provides tokens, base styles, typography utilities, layout helpers, component helper classes, and Tailwind CSS v4 source entrypoints.

The package has no JavaScript runtime. It does not create DOM nodes, attach event listeners, manage focus, validate forms, dismiss toasts, or provide framework components.

## Public Entrypoints

| Path                             | Contents                                                              |
| -------------------------------- | --------------------------------------------------------------------- |
| `@codenhub/styles`               | Full compiled stylesheet: theme, base styles, components, typography. |
| `@codenhub/styles/theme`         | Compiled theme tokens and dark-mode variables.                        |
| `@codenhub/styles/components`    | Compiled theme tokens plus component classes.                         |
| `@codenhub/styles/tw`            | Tailwind v4 source for theme, base styles, components, and utilities. |
| `@codenhub/styles/tw/theme`      | Tailwind v4 source for theme tokens and custom dark variant.          |
| `@codenhub/styles/tw/components` | Tailwind v4 source for theme tokens and component classes.            |
| `@codenhub/styles/tw/surface`    | Tailwind v4 source for surface styles and empty-state utility.        |
| `@codenhub/styles/tw/button`     | Tailwind v4 source for composable button utilities.                   |
| `@codenhub/styles/tw/form`       | Tailwind v4 source for form, inputs, checkbox, and switch utilities.  |
| `@codenhub/styles/tw/feedback`   | Tailwind v4 source for alert, badge, skeleton, and progress.          |
| `@codenhub/styles/tw/loader`     | Tailwind v4 source for loader and activity indicator utilities.       |
| `@codenhub/styles/tw/tooltip`    | Tailwind v4 source for tooltip utility.                               |
| `@codenhub/styles/tw/reset`      | Tailwind v4 source for core resets (scrollbar, body, selection).      |
| `@codenhub/styles/tw/overrides`  | Tailwind v4 source for opt-in classless native element styling.       |
| `@codenhub/styles/tw/typography` | Tailwind v4 source for typography helper classes.                     |
| `@codenhub/styles/tw/utilities`  | Tailwind v4 source for layout primitives and contrast utilities.      |

`components` entrypoints include theme tokens because component classes depend on those variables.

## Class Model

Helper classes are designed as small composable CSS contracts:

- Intent classes define meaning, such as `.primary`, `.success`, `.warning`, `.destructive`, and `.info`.
- Presentation classes define treatment, such as `.out`, `.ghost`, `.soft`, `.sm`, `.lg`, and `.icon`.
- State classes or attributes define current state, such as `.loading`, `.disabled`, `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]`, `[aria-invalid="true"]`, and `[data-state="open"]`.

Button example:

```html
<button class="btn success out">Success outline</button>
<button class="btn destructive ghost">Danger ghost</button>
<button class="btn primary loading" disabled>Saving</button>
```

`out`, `ghost`, and `soft` are presentation choices. They consume active intent tone slots instead of carrying a fixed color intent; for example, `.btn.success.soft` uses success subtle and strong tones.

## Token Model

Component classes use public foundation tokens for shape, motion, focus, surface, and state behavior. Internal scoped variables may exist to compose class variants, but they are not the public customization contract.

Example future-ready profile shape:

```css
.custom-profile {
  --radius-surface: 1.25rem;
  --elevation-low: 0 24px 60px rgb(0 0 0 / 0.18);
  --motion-duration-normal: 240ms;
}
```

Aesthetic profile classes such as `.glassmorphism` or `.brutalism` are not part of the current version. The token foundation that makes them possible is available now.

## Documentation Map

| Document                            | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| [Tokens](./tokens.md)               | Theme and foundation variable contracts.                  |
| [Classes](./classes.md)             | Public helper class behavior and composition rules.       |
| [Accessibility](./accessibility.md) | CSS accessibility hooks and responsibilities outside CSS. |
| [Tests](./tests.md)                 | Build and browser validation strategy.                    |
| [Roadmap](./roadmap.md)             | Draft direction and durable planning context.             |
