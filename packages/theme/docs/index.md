# @codenhub/theme

`@codenhub/theme` resolves stored and system theme preferences, applies theme
state to the document root, synchronizes browser tabs, exposes change events,
and maps typed tokens to CSS custom properties.

It fits browser applications that need one owner for theme preference and DOM
synchronization while keeping selectors, visual design, and CSS in application
code.

> [!WARNING]
> This package is experimental. Its API, DOM behavior, and support level may
> change before a stable release.

## Quick Start

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme().init();
theme.set("dark");
```

Call `destroy()` when the manager's owner is removed. The package persists an
explicit preference, follows system preference when appropriate, and skips
unavailable browser work during SSR. It does not provide theme CSS or prevent a
flash before initialization; applications that need pre-paint consistency must
apply matching theme logic before rendering.

## Continue

- [API, persistence, DOM, and SSR behavior](reference.md): Complete exports,
  configuration, tokens, browser synchronization, validation, pre-paint
  concerns, and cleanup.
