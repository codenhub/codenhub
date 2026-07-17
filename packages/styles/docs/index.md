# @codenhub/styles

`@codenhub/styles` is a CSS-only foundation for building Codenhub interfaces.
Use it when an application needs shared design tokens, base styles, typography
and layout utilities, or composable classes for common UI elements.

> **Experimental:** Public tokens, class names, and import-path composition may
> change while the styling system is stabilized.

## Start with the full stylesheet

For most applications, import the compiled package and compose the helper
classes in markup:

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

Applications using Tailwind CSS v4 can process `@codenhub/styles/tw` instead.
Focused compiled and Tailwind source entrypoints are available when an
application needs only tokens, components, reset, typography, utilities, or a
specific component domain. The [class reference](./classes.md) lists those
supported imports and their composition rules.

## How composition works

Helper classes are designed as small composable CSS contracts:

- Intent classes define meaning, such as `.primary`, `.success`, `.warning`, `.destructive`, and `.info`.
- Presentation classes define treatment, such as `.out`, `.ghost`, `.soft`, `.sm`, `.lg`, and `.icon`.
- State classes or attributes define current state, such as `.loading`, `.disabled`, `[disabled]`, `[aria-disabled="true"]`, `[data-disabled]`, `[aria-invalid="true"]`, and `[data-state="open"]`.

`out`, `ghost`, and `soft` are presentation choices. They consume active intent tone slots instead of carrying a fixed color intent; for example, `.btn.success.soft` uses success subtle and strong tones.

Component classes use public foundation tokens for shape, motion, focus,
surface, and state behavior. Internal scoped variables may help compose
variants, but they are not the public customization contract. Aesthetic profile
classes such as `.glassmorphism` or `.brutalism` are not part of the current
version.

## Choose where to go next

- [Tokens](./tokens.md) explains theme values, dark mode, and the public
  customization contract.
- [Classes](./classes.md) covers supported imports, helper classes, component
  states, and composition rules.
- [Accessibility](./accessibility.md) separates the hooks supplied by CSS from
  the semantics and behavior an application must provide.

The package has no JavaScript runtime. It does not create DOM nodes, attach
event listeners, manage focus, validate forms, dismiss toasts, or provide
framework components. Component entrypoints include theme tokens because their
classes depend on those variables. Native entrypoints also include the reset
and classless mappings for common native elements.
