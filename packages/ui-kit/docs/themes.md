---
title: Themes
description: Initialize and control the built-in light and dark theme singleton.
---

# Themes

The theme helpers wrap one module-level light/dark theme manager. Call
`initTheme()` once in the browser to apply a stored preference or the operating
system color scheme and begin observing system and cross-tab storage changes.

```ts
import { THEME_CHANGE_EVENT, initTheme, toggleTheme } from "@codenhub/ui-kit";

initTheme();

const button = document.querySelector("#theme-toggle");
button?.addEventListener("click", () => {
  toggleTheme();
});

window.addEventListener(THEME_CHANGE_EVENT, (event) => {
  const { name, source } = (event as CustomEvent).detail;
  console.log(name, source);
});
```

## State and DOM effects

The only theme names are `"light"` and `"dark"`. The manager stores explicit
preferences under `app-theme-preference`. Applying a theme sets
`data-theme` and `color-scheme` on the document root and toggles the root
`dark` class for Tailwind-compatible dark mode.

| API                      | Behavior                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `initTheme()`            | Initializes once from storage or the system and installs system/storage listeners. |
| `getTheme()`             | Returns the active theme; initially `"light"` before initialization.               |
| `getSystemTheme()`       | Returns the current system choice, or `"light"` when unavailable.                  |
| `getStoredTheme()`       | Returns a valid explicit preference or `null`.                                     |
| `setTheme(theme)`        | Applies and persists `"light"` or `"dark"`. Invalid JavaScript input throws.       |
| `toggleTheme()`          | Switches by active color scheme, persists, and returns the new theme.              |
| `clearThemePreference()` | Removes the preference, applies the system theme, and returns it.                  |

Theme changes dispatch `THEME_CHANGE_EVENT` (`"themechange"`) on `window` after
the update when browser event APIs are available. Its detail has the current
source shape `{ name, theme, source }`:

- `name` is the active theme name, `"light"` or `"dark"` in UI Kit.
- `theme` is the active `ThemeDefinition`, including `name`, `colorScheme`, and
  optional `tokens`.
- `source` is the `ThemeChangeSource`: `"init"`, `"set"`, `"toggle"`,
  `"clearPreference"`, or `"system"`.

The source package names the full payload `ThemeChangeDetail`. UI Kit does not
re-export `ThemeChangeDetail`, `ThemeDefinition`, or `ThemeChangeSource`. Remove
any window listener you add during owner teardown.

## Lifetime and SSR

The underlying manager is a package singleton. `initTheme()` is idempotent, but
the UI Kit exposes no destroy method, so its system and storage listeners remain
for the module lifetime after initialization. This is suitable for one
application-wide theme owner, not isolated per-request or per-component theme
managers.

Theme reads and mutations tolerate missing `window` and `document`. Without
system APIs, `getSystemTheme()` resolves to light; without storage, preferences
are not persisted; without a document, no DOM attributes or classes are
changed. Server calls still mutate the singleton's in-memory active theme, so do
not share request-specific theme state through it.
