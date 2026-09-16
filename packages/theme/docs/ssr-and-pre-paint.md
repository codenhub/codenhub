---
title: SSR, Pre-Paint, and Tailwind
---

# SSR, Pre-Paint, and Tailwind

## Preventing a flash of unstyled content

A client-side `init()` call runs after the page has already painted once, which is visible as a flash from the default theme to the resolved one. `getPrePaintScript()` — available as a method on an existing manager, or as the standalone `getPrePaintScript(options)` export when no manager exists yet — returns a synchronous, minified inline IIFE string that duplicates the same stored-preference-then-system-preference resolution, and applies the configured attribute, classes, and any static tokens before the browser paints:

```ts
import { getPrePaintScript } from "@codenhub/theme";

const script = getPrePaintScript({ storageKey: "app-theme-preference" });
```

Inject the returned string into a blocking `<script>` in the document `<head>`, before any stylesheet or content that depends on the theme:

```html
<head>
  <script>
    /* inline the string returned by getPrePaintScript() here */
  </script>
</head>
```

Pass the same `themes`, `tokenSchema`, `defaultTheme`, `systemTheme`, `storageKey`, `attribute`, `shouldApplyClass`, and `isTailwindCss` options used to construct the manager, so the pre-paint script and the later `init()` call resolve to the same theme. `getPrePaintScript()` only serializes **static** tokens from each theme's `ThemeDefinition.tokens` — and only when `tokenSchema` is passed to it — runtime overrides passed to `init(tokens)` are applied after hydration, during client-side execution, and cannot be part of a script that runs before any application code.

## Server-side rendering

Without browser APIs, `Theme` methods skip storage reads/writes, DOM updates, and listener registration; `getSystem()` falls back to `defaultTheme`. Every method call remains safe to make during SSR — nothing throws for a missing `window`, `document`, or `localStorage` — but the package cannot produce server-rendered HTML attributes on its own. To avoid a flash on a server-rendered page, either:

- Render the server markup with the same attribute/class the pre-paint script would apply (requiring the server to read the same cookie or header a real theme service would use), or
- Rely on the pre-paint script above to correct the DOM before first paint, accepting that server-rendered markup itself does not carry theme state.

Keep any server-side resolution logic — stored names, system mapping, storage key, attribute, classes, color scheme — aligned with the options passed to `createTheme()` and `getPrePaintScript()`; a mismatch reintroduces the flash it exists to prevent.

## Tailwind's `dark` class

Set `isTailwindCss: true` to toggle Tailwind CSS's `dark` class on `document.documentElement` alongside the configured attribute, for every theme whose `colorScheme` is `"dark"`. This is independent of `shouldApplyClass` (below) — a Tailwind app commonly wants both the `dark` class for Tailwind's `dark:` variant and, when `shouldApplyClass` is left at its default, a `theme-${name}` class for custom per-theme CSS.

## Classes and cleanup

`shouldApplyClass` controls whether and how a class is applied to `document.documentElement` alongside the attribute: `true` (the default) applies `theme-${name}`, `false` applies no class, and a `ThemeClassResolver` function receives the active `ThemeDefinition` and returns one custom class token — throwing if it returns an empty or whitespace-containing string.

`destroy(options?)` removes the media-query and storage listeners and clears in-process subscribers and runtime tokens, leaving the instance safe to `init()` again. By default it does **not** touch the DOM or stored preference. Pass `{ revertDom: true }` to also remove the configured attribute, classes, and CSS custom properties from `document.documentElement` — useful when unmounting a scoped theme manager that should leave no trace, such as in a component test or a preview pane.
