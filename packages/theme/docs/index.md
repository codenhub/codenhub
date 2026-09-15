---
title: Overview
---

# Manage Browser Themes

`@codenhub/theme` owns one thing for a browser application: deciding which theme is active, keeping it in sync with `localStorage` and the OS `prefers-color-scheme` setting, and reflecting it onto the DOM as an attribute, a class, and CSS custom properties. It fits applications that want one place to own that decision instead of scattering `matchMedia` listeners and `localStorage` reads across the codebase, while keeping selectors, visual design, and CSS entirely in application code.

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

`createTheme()` with no arguments configures the built-in `light` and `dark` themes. `init()` resolves the theme to apply — a stored preference if one is valid, otherwise the OS preference — and applies it to `document.documentElement`. Call `destroy()` when the manager's owner is torn down, such as in a framework component's cleanup hook; it stops listening but leaves the DOM and stored preference as they were unless told otherwise (see [Tokens, persistence, and cross-tab sync](tokens-and-persistence.md)).

### Configuration

Most applications configure at least `themes` and `tokenSchema` up front:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme({
  themes: [
    { name: "light", colorScheme: "light", tokens: { primary: "#171717" } },
    { name: "dark", colorScheme: "dark", tokens: { primary: "#f9fafb" } },
  ],
  tokenSchema: { primary: "--color-primary" },
  storageKey: "app-theme-preference",
  isTailwindCss: true,
}).init();
```

`themes` replaces the built-in list entirely — include `light` and `dark` (or whatever names `defaultTheme` and `systemTheme` point at) when defining custom themes. `tokenSchema` maps the typed token names used in `ThemeDefinition.tokens` and `get()` to the CSS custom property each one writes to `document.documentElement`. See [Tokens, persistence, and cross-tab sync](tokens-and-persistence.md) for how token values are resolved and stored, and [SSR, pre-paint, and Tailwind](ssr-and-pre-paint.md) for flash-of-unstyled-content prevention and OS-preference-only applications like `isTailwindCss`.

Construction validates every option and throws on invalid configuration: empty or duplicate theme names, a `defaultTheme` or `systemTheme` name that is not in `themes`, an invalid `colorScheme`, or a `shouldApplyClass` resolver that would produce an empty or whitespace-containing class.

## Requirements

- Browser integration uses `document.documentElement`, `localStorage`, `matchMedia`, `storage` events, and `CustomEvent`. Every one of these is read defensively: an unavailable or throwing API is treated as absent rather than crashing the caller.
- SSR is supported by skipping unavailable browser work and using the configured `defaultTheme`. The package cannot produce server HTML attributes or prevent a flash on its own — see [SSR, pre-paint, and Tailwind](ssr-and-pre-paint.md).
- Consumers provide CSS selectors, variables, and visual tokens. The package only ever writes an attribute, optional classes, and CSS custom properties — it ships no CSS or token values beyond the built-in `light`/`dark` definitions' names.

## Next steps

- [Tokens, persistence, and cross-tab sync](tokens-and-persistence.md): How `get()` resolves token values, how preferences persist to `localStorage` and sync across tabs, and how to read or clear the stored preference.
- [SSR, pre-paint, and Tailwind](ssr-and-pre-paint.md): Preventing a flash of unstyled content before hydration, server-rendering considerations, and toggling Tailwind's `dark` class.
- [API reference](reference/index.md): Every exported function, type, and interface member with its full signature.
