---
title: SSR, Pre-Paint, and Tailwind
---

# SSR, Pre-Paint, and Tailwind

## Preventing a flash of unstyled content

A client-side `init()` call runs after the page has already painted once, which is visible as a flash from the default theme to the resolved one. `getPrePaintScript()` returns a synchronous, minified inline IIFE string that repeats the same stored-preference-then-system-preference resolution and applies the configured attribute, `color-scheme`, classes, and static tokens before the browser paints:

```ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

const script = createTheme(themeOptions).getPrePaintScript();
```

`createTheme()` is safe to call on the server, so one options module can build the script there and the manager in the browser, keeping the two in agreement. Inject the returned string into a blocking `<script>` in the document `<head>`, before any stylesheet or content that depends on the theme:

```html
<head>
  <script>
    /* inline the string returned by getPrePaintScript() here */
  </script>
</head>
```

The script handles storage and `matchMedia` failures the same way `init()` does: blocked storage still applies the system theme, and a missing `matchMedia` applies `defaultTheme`. It removes the classes of other configured themes, so a class rendered by the server is replaced rather than joined. It serializes only **static** tokens from each theme's `tokens`; runtime overrides from `setTokens()` exist only in the running page and cannot be part of a script that runs before any application code.

## Server-side rendering

Without browser APIs, `Theme` methods skip storage reads/writes, DOM updates, and listener registration; `theme.system` falls back to `defaultTheme`. Every member remains safe to use during SSR — nothing throws for a missing `window`, `document`, or `localStorage` — but the package cannot produce server-rendered HTML attributes on its own. To avoid a flash on a server-rendered page, either:

- Render the server markup with the same attribute/class the pre-paint script would apply (requiring the server to read the same cookie or header a real theme service would use), or
- Rely on the pre-paint script above to correct the DOM before first paint, accepting that server-rendered markup itself does not carry theme state.

Keep any server-side resolution logic — stored names, system mapping, storage key, attribute, classes, color scheme — aligned with the options passed to `createTheme()`; a mismatch reintroduces the flash it exists to prevent.

## Tailwind's `dark` class

Set `darkClass: true` to add a `dark` class to `document.documentElement` while a theme whose `colorScheme` is `"dark"` is active, as Tailwind CSS's class-based `dark:` variant expects. This is independent of `className` (below) — a Tailwind app commonly wants both the `dark` class and, when `className` is left at its default, a `theme-<name>` class for custom per-theme CSS.

## Classes and cleanup

`className` controls the class applied to `document.documentElement` alongside the attribute: `true` (the default) applies `theme-<name>`, `false` applies no class, and a `ThemeClassResolver` function receives the theme with its static tokens and returns one custom class token. Code moving from a library configured with `attribute: "class"` wants `className: (theme) => theme.name` instead: `attribute` cannot be `class` or `style`, because writing the theme name there would replace every class or inline style the page put on `<html>`. A resolver runs once per theme, on first use rather than at construction, and the operation that triggered it throws if it returns an empty or whitespace-containing string.

`destroy(options?)` removes the media-query and storage listeners and clears in-process subscribers and runtime tokens, leaving the instance safe to `init()` again. By default it does **not** touch the DOM or stored preference. Pass `{ revertDom: true }` to also remove the configured attribute, classes, `color-scheme`, and CSS custom properties from `document.documentElement` — useful when unmounting a scoped theme manager that should leave no trace, such as in a component test or a preview pane.
