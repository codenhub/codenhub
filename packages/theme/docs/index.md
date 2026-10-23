---
title: Overview
---

# Manage Browser Themes

`@codenhub/theme` owns one thing for a browser application: deciding which theme is active, keeping it in sync with `localStorage` and the OS `prefers-color-scheme` setting, and reflecting it onto the DOM as an attribute, a class, a `color-scheme`, and CSS custom properties. It fits applications that want one place to own that decision instead of scattering `matchMedia` listeners and `localStorage` reads across the codebase, while keeping selectors, visual design, and CSS entirely in application code.

## Setup

### Installation

```sh
pnpm add @codenhub/theme
```

### Quick start

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme().init();

document.querySelector("#theme-toggle")?.addEventListener("click", theme.toggle);
```

`createTheme()` with no arguments configures the built-in `light` and `dark` themes. `init()` resolves the theme to apply — a stored preference if one is valid, otherwise the OS preference — and applies it to `document.documentElement`. Every method is bound to its manager, so `theme.toggle` and `theme.subscribe` can be passed as callbacks directly. Call `destroy()` when the manager's owner is torn down, such as in a framework component's cleanup hook; it stops listening but leaves the DOM and stored preference as they were unless told otherwise (see [SSR, pre-paint, and Tailwind](ssr-and-pre-paint.md)).

### Reading state

| Member             | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| `theme.name`       | Active theme name.                                                                  |
| `theme.get()`      | Active theme — `name`, `colorScheme`, `tokens`, `pairedTheme` — as a frozen object. |
| `theme.preference` | Explicit stored preference, or `null` while the theme follows the OS.               |
| `theme.system`     | Theme the OS preference maps to right now.                                          |

`get()` returns the same object until the next change, so it works directly as a store snapshot. In React:

```ts
import { useSyncExternalStore } from "react";

function useActiveTheme() {
  return useSyncExternalStore(theme.subscribe, theme.get, theme.get);
}
```

### Configuration

Most applications configure their themes and a `tokenSchema` up front:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme({
  themes: {
    light: { colorScheme: "light", tokens: { primary: "#171717" } },
    dark: { colorScheme: "dark", tokens: { primary: "#f9fafb" } },
    dim: { colorScheme: "dark", pairedTheme: "light" },
  },
  tokenSchema: { primary: "--color-primary" },
  storageKey: "app-theme-preference",
  darkClass: true,
}).init();

theme.set("dim");
```

`themes` is keyed by theme name and replaces the built-in list entirely — include `light` and `dark`, or set `defaultTheme` and `systemTheme` to names you do define. Theme names are inferred from its keys, so `defaultTheme`, `systemTheme`, `pairedTheme`, and `set()` accept only configured names at compile time. `tokenSchema` maps the typed token names used in `tokens` to the CSS custom property each one writes to `document.documentElement`. See [Tokens, persistence, and cross-tab sync](tokens-and-persistence.md) for how token values are resolved and stored, and [SSR, pre-paint, and Tailwind](ssr-and-pre-paint.md) for flash-of-unstyled-content prevention, `darkClass`, and `className`.

Construction validates the options and throws on invalid configuration, such as a `themes` or `systemTheme` value that is not a plain object, an empty theme name, a `defaultTheme`, `systemTheme`, or `pairedTheme` name that is not in `themes`, an invalid `colorScheme`, theme tokens outside `tokenSchema`, a `darkClass` that is not a boolean, or, while `className` is `true`, a theme name that cannot form the default `theme-<name>` class. The [API reference](reference/index.md) lists every rule.

An option set to `undefined` uses its default, exactly as an omitted one does. The option types accept `undefined`, so a wrapper that forwards an unset option, such as `storageKey: props.storageKey`, gets the default instead of a construction error. Rejecting `undefined` was the behavior before 0.2.0; it was dropped because it failed at runtime on code the types accept.

## Requirements

- Browser integration uses `document.documentElement`, `localStorage`, `matchMedia`, `storage` events, and `CustomEvent`. Every one of these is read defensively: an unavailable or throwing API is treated as absent rather than crashing the caller.
- SSR is supported by skipping unavailable browser work and using the configured `defaultTheme`. The package cannot produce server HTML attributes or prevent a flash on its own — see [SSR, pre-paint, and Tailwind](ssr-and-pre-paint.md).
- Consumers provide CSS selectors, variables, and visual tokens. The package only ever writes an attribute, optional classes, `color-scheme`, and CSS custom properties — it ships no CSS or token values.

## Next steps

- [Tokens, persistence, and cross-tab sync](tokens-and-persistence.md): How token values are resolved, how preferences persist to `localStorage` and sync across tabs, and how to react to changes.
- [SSR, pre-paint, and Tailwind](ssr-and-pre-paint.md): Preventing a flash of unstyled content before hydration, server-rendering considerations, and the classes the package applies.
- [API reference](reference/index.md): Every exported function, type, and interface member with its full signature.
