# @codenhub/styles Overview

`@codenhub/styles` is a CSS-only styling foundation for Codenhub interfaces. It provides tokens, base styles, typography utilities, layout helpers, component helper classes, and Tailwind CSS v4 source entrypoints.

The package has no JavaScript runtime. It does not create DOM nodes, attach event listeners, manage focus, validate forms, dismiss toasts, or provide framework components.

## Public Entrypoints

- Compiled CSS: `@codenhub/styles`, `/theme`, `/components`, and `/native`.
- Full Tailwind CSS v4 source: `@codenhub/styles/tw` and `/tw/native`.
- Focused Tailwind source: `/tw/theme`, `/tw/components`, `/tw/surface`, `/tw/button`, `/tw/form`, `/tw/feedback`, `/tw/loader`, `/tw/tooltip`, `/tw/reset`, `/tw/typography`, and `/tw/utilities`.

`components` entrypoints include theme tokens because component classes depend on those variables.

The native entrypoint also includes the reset. It maps headings, form controls, buttons, `table`, `kbd`, `blockquote`, `q`, `code`, `pre`, and `hr` to package helper styles.

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
