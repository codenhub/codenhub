---
title: Overview
---

# Manage Browser Themes

`@codenhub/theme` resolves stored and system theme preferences, applies theme
state to the document root, synchronizes browser tabs, exposes change events,
and maps typed tokens to CSS custom properties.

It fits browser applications that need one owner for theme preference and DOM
synchronization while keeping selectors, visual design, and CSS in application
code.

## Setup

### Installation

```sh
pnpm add @codenhub/theme
```

### Quick start

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme().init();
theme.set("dark");
```

Call `destroy()` when the manager's owner is removed. The package persists an
explicit preference and follows system preference when appropriate.

## Requirements

- Browser integration uses `document.documentElement`, `localStorage`,
  `matchMedia`, `storage` events, and `CustomEvent`.
- SSR is supported by skipping unavailable browser work and using the configured
  default theme.
- Consumers provide CSS selectors, variables, visual tokens, and any pre-paint
  script needed to prevent a theme flash.

The package cannot produce server HTML attributes or prevent a flash before
initialization. Applications that need pre-paint consistency must apply matching
theme logic before rendering.

## Next steps

- [API, persistence, DOM, and SSR behavior](reference.md): Complete exports,
  configuration, tokens, browser synchronization, validation, pre-paint
  concerns, and cleanup.
