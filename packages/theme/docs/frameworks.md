---
title: Frameworks
order: 6
---

# Frameworks

The package has no framework adapter because it does not need one: a manager is a plain object, and its methods can be passed anywhere as callbacks. This page shows the patterns for React and for Tailwind CSS. The same ideas carry over to other frameworks: create one manager for the page, start it once in the browser, and subscribe to it wherever the UI shows the theme.

## React

### One manager for the whole app

Create the manager once, in its own module, and import it wherever you need it. Do not create it inside a component: each render would create a new one.

```ts
// src/theme.ts
import { createTheme } from "@codenhub/theme";

import { themeOptions } from "./theme-options";

export const theme = createTheme(themeOptions).init();
```

In an app that only runs in the browser, such as one built with Vite, calling `init()` right there is fine. Server-rendered apps start it differently; see [With server rendering](#with-server-rendering) below.

### Show the active theme in a component

React re-renders a component when its data changes only if it knows about the change. `useSyncExternalStore` connects React to an outside source like the manager: `theme.subscribe` tells React when to re-read, and `theme.get` is what it reads. `get()` returns the same object until the theme changes, which is exactly what React expects.

```tsx
import { useSyncExternalStore } from "react";

import { theme } from "./theme";

export function useActiveTheme() {
  return useSyncExternalStore(theme.subscribe, theme.get);
}

export function ThemeToggle() {
  const active = useActiveTheme();
  return (
    <button type="button" onClick={theme.toggle}>
      {active.colorScheme === "dark" ? "Switch to light" : "Switch to dark"}
    </button>
  );
}
```

### With server rendering

In a server-rendered app, such as Next.js or Remix, the same module also runs on the server, where there is nothing to start, and React first renders the page in the browser by **hydrating** the server's HTML: it expects the first browser render to match what the server rendered.

Two changes handle that. Start the manager from an effect, which runs only in the browser, and give `useSyncExternalStore` a third argument, `getServerSnapshot`, that returns the theme the server rendered with:

```tsx
// src/theme.ts
import { createTheme } from "@codenhub/theme";
import { useSyncExternalStore } from "react";

import { themeOptions } from "./theme-options";

export const theme = createTheme(themeOptions);

// Taken before init(), so it is the default theme, the one the server renders with.
const serverSnapshot = theme.get();

export function useActiveTheme() {
  return useSyncExternalStore(theme.subscribe, theme.get, () => serverSnapshot);
}
```

```tsx
// In your root client component:
useEffect(() => {
  theme.init();
}, []);
```

Hydration then renders the default theme, matching the server, and the component updates to the user's theme right after `init()` runs. The page itself never shows the wrong colors: the [pre-paint script](preventing-the-flash.md) already applied the right theme to `<html>`, and only components that read `useActiveTheme()` briefly see the default. Calling `init()` more than once does nothing after the first call, so React's development double-run of effects is harmless.

If your server resolves the theme per request instead, such as from a cookie, it renders with that theme, so `getServerSnapshot` must return that same theme, passed to the browser with the page.

### Cleaning up

A manager created once for the whole page lives as long as the page, and needs no cleanup. A manager that belongs to something shorter-lived, such as a component that mounts and unmounts or a test, must be stopped with `destroy()`:

```tsx
useEffect(() => {
  const preview = createTheme(previewOptions).init();
  return () => preview.destroy();
}, []);
```

`destroy()` stops listening to the operating system and other tabs, removes every subscriber, and drops token overrides. It leaves `<html>` and the saved choice as they are, so the page does not change when the component unmounts. Pass `{ revertDom: true }` to also remove the attribute, classes, `color-scheme`, and token properties the manager wrote, leaving no trace. A destroyed manager can be started again with `init()`.

## Tailwind CSS

Tailwind's `dark:` variant, as in `class="bg-white dark:bg-black"`, applies its styles when it decides the page is dark. Set `darkClass: true`, and the package adds a `dark` class to `<html>` whenever the active theme's `colorScheme` is `"dark"`:

```ts
const theme = createTheme({ darkClass: true }).init();
```

Then tell Tailwind to look for that class instead of the operating-system setting, which it uses by default. In Tailwind CSS v4, add this to your main CSS file:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));
```

In Tailwind CSS v3, set it in `tailwind.config.js`:

```js
export default {
  darkMode: "class",
  // …the rest of your configuration
};
```

Because the `dark` class follows `colorScheme` rather than a theme's name, every dark theme you define, such as a `dim` theme, gets `dark:` styles too. `darkClass` works alongside `className`, so `<html>` can carry both `dark` and `theme-dim`, for custom CSS that only the `dim` theme needs.

Next, [Troubleshooting](troubleshooting.md) collects the problems people hit most often.
