---
title: Overview
---

# Style Codenhub interfaces

`@codenhub/styles` provides CSS-only design tokens, base styles, typography and
layout utilities, and composable classes for common UI elements.

## Setup

### Installation

```sh
pnpm add @codenhub/styles
```

### Quick start

Import the compiled stylesheet for the complete token, reset, utility, and
component-class surface, then compose helper classes in markup:

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

The full stylesheet applies global reset, native-element, and focus-visible
rules. Import focused entrypoints instead when those global rules are not
appropriate. The [class reference](./classes.md) lists every supported compiled
and Tailwind source import and explains their composition.

### Configuration

Apply `.dark` to any ancestor to use dark token values for that subtree. Apps
own adding and removing the class.

```html
<html class="dark">
  <body>
    ...
  </body>
</html>
```

Customize the public CSS properties documented in [Tokens](./tokens.md). Do not
depend on component-scoped implementation variables.

## Requirements

- Consumer tooling must resolve package CSS imports.
- Tailwind CSS 4 or newer is required only for `/tw` source entrypoints.
- The package has no JavaScript runtime. Apps must provide semantic HTML, ARIA,
  keyboard behavior, focus management, validation, and announcements.
- Component entrypoints include theme tokens because their classes depend on
  those variables. Native entrypoints also include the reset and classless
  mappings for common native elements.

## Next steps

- [Tokens](./tokens.md) explains theme values, dark mode, and the public
  customization contract.
- [Classes](./classes.md) covers supported imports, helper classes, component
  states, and composition rules.
- [Accessibility](./accessibility.md) separates the hooks supplied by CSS from
  the semantics and behavior an application must provide.
