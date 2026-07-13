# @codenhub/theme

Small zero-dependency theme preference helper for browser apps. It applies a theme name to the document, updates `document.documentElement.style.colorScheme`, and supports managing dynamic CSS tokens.

## Installation

```sh
pnpm add @codenhub/theme
npm install @codenhub/theme
yarn add @codenhub/theme
bun add @codenhub/theme
```

## Usage

By default, `init()` uses a valid stored preference first. If there is no valid stored preference, it maps the OS color scheme to `light` or `dark`.

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme({ isTailwindCss: false, shouldApplyClass: true });

theme.init();
theme.set("dark");
theme.toggle();
```

Call `destroy()` during app or test cleanup when the instance is no longer used.

### Preventing Flash of Unstyled Content (FOUC)

Because the client-side JS bundle loads asynchronously, there can be a brief flash of the default theme before the theme manager initializes. To prevent this, inject a tiny blocking script in your HTML `<head>` before any stylesheet or content:

```html
<script>
  (function () {
    try {
      const key = "app-theme-preference";
      const attribute = "data-theme";
      let theme = "light";
      try {
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
          theme = "dark";
        }
      } catch (_) {}
      try {
        const stored = localStorage.getItem(key);
        // Add all your configured theme names here to validate the stored value.
        const allowed = ["light", "dark"];
        if (stored && allowed.includes(stored)) {
          theme = stored;
        }
      } catch (_) {}
      document.documentElement.setAttribute(attribute, theme);

      // List the names of all your dark-scheme themes here.
      // Using an explicit set avoids false matches from substring checks (e.g. "midnight" is dark
      // but would not match "dark"; "darkroom" would match but may not be a dark theme).
      const darkThemes = new Set(["dark"]);
      const isDark = darkThemes.has(theme);
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
      document.documentElement.classList.add("theme-" + theme);

      // If using Tailwind CSS, also toggle "dark" class:
      // document.documentElement.classList.toggle("dark", isDark);
    } catch (_) {}
  })();
</script>
```

> [!WARNING]
> If you customize `systemTheme`, `themes`, `storageKey`, or `attribute` in `createTheme`, make sure to update the inline FOUC script to match those values. Mismatched configurations will cause a flash of the wrong theme. Also, if you set `shouldApplyClass` to `false` or use a custom class resolver, update or remove the FOUC class application block (`classList.add`) accordingly to prevent visual shifts on initialization.

## Reference

### `@codenhub/theme`

Primary entrypoint for the theme preference API.

```ts
import { createTheme, DARK_THEME, LIGHT_THEME, THEME_CHANGE_EVENT } from "@codenhub/theme";
import type {
  SystemThemeMap,
  Theme,
  ThemeChangeDetail,
  ThemeChangeListener,
  ThemeChangeSource,
  ThemeClassResolver,
  ThemeDefinition,
  ThemeOptions,
} from "@codenhub/theme";
```

Supported import paths:

| Path              | Description                         |
| ----------------- | ----------------------------------- |
| `@codenhub/theme` | Main JavaScript and TypeScript API. |

#### `createTheme()`

Factory function that returns a `Theme` manager instance.

```ts
function createTheme<TSchema extends Record<string, string> = Record<string, string>>(
  options?: ThemeOptions<TSchema>,
): Theme<TSchema>;
```

#### `Theme`

Manages the active theme, storage preference, DOM attribute, `colorScheme` style, classes, system preference listener, dynamic tokens, and change notifications.

```ts
interface Theme<TSchema extends Record<string, string> = Record<string, string>> {
  init(tokens?: Partial<Record<keyof TSchema, string>>): this;
  get(): ThemeDefinition<TSchema>;
  set(name: string, tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema>;
  toggle(tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema>;
  clearPreference(): ThemeDefinition<TSchema>;
  getStored(): string | null;
  getSystem(): ThemeDefinition<TSchema>;
  subscribe(listener: ThemeChangeListener<TSchema>): () => void;
  destroy(): void;
}
```

Import from `@codenhub/theme`.

The factory throws `Error` when configured theme names are empty, duplicated, invalid for CSS class application, or referenced by `defaultTheme` or `systemTheme` without being configured.

##### `init()`

Registers the system preference listener, resolves the initial theme, applies it, and emits a change with source `"init"`. Can optionally accept initial token value overrides.

```ts
function init(tokens?: Partial<Record<keyof TSchema, string>>): this;
```

Repeated calls do not register duplicate system preference listeners.

##### `get()`

Returns the active theme definition including any active merged tokens. If a token in `tokenSchema` is not defined in JS for the active theme, its value is dynamically resolved from the computed styles of the DOM in browser environments.

```ts
function get(): ThemeDefinition<TSchema>;
```

##### `set()`

Activates a configured theme by name, applies any dynamic token overrides, and stores the explicit preference when browser storage is available. Active overrides persist across subsequent theme changes unless cleared (by passing new overrides or an empty object).

```ts
function set(name: string, tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema>;
```

Throws `Error` when `name` is not configured.

##### `toggle()`

Toggles between the configured system light and dark themes based on the active theme's `colorScheme`, applies any dynamic token overrides, then stores the explicit preference when browser storage is available. The target name is always taken from `systemTheme.light` or `systemTheme.dark`, not by cycling the active theme name. In multi-theme setups where the active theme is not one of the system themes, `toggle()` still targets `systemTheme.light` or `systemTheme.dark`. Active overrides persist across subsequent theme changes unless cleared (by passing new overrides or an empty object).

```ts
function toggle(tokens?: Partial<Record<keyof TSchema, string>>): ThemeDefinition<TSchema>;
```

##### `clearPreference()`

Removes the stored preference and activates the current system theme.

```ts
function clearPreference(): ThemeDefinition<TSchema>;
```

##### `getStored()`

Returns the stored theme name when it exists and is configured.

```ts
function getStored(): string | null;
```

Returns `null` during SSR, when storage is unavailable, when storage access throws, or when the stored name is not configured.

##### `getSystem()`

Returns the configured theme for the current `prefers-color-scheme` value.

```ts
function getSystem(): ThemeDefinition<TSchema>;
```

Returns the default theme during SSR or when `matchMedia` is unavailable.

##### `subscribe()`

Registers an in-process listener for theme changes.

```ts
function subscribe(listener: ThemeChangeListener<TSchema>): () => void;
```

Returns an unsubscribe function.

##### `destroy()`

Removes the system preference listener, clears in-process subscribers, and resets active tokens and the active theme name to `defaultTheme`. Safe to call before re-initializing with `init()`.

```ts
function destroy(): void;
```

Call this during app or test cleanup when the instance is no longer used.

#### `ThemeOptions`

```ts
interface ThemeOptions<TSchema extends Record<string, string> = Record<string, string>> {
  themes?: readonly ThemeDefinition<TSchema>[];
  defaultTheme?: string;
  systemTheme?: SystemThemeMap;
  storageKey?: string;
  attribute?: string;
  isTailwindCss?: boolean;
  shouldApplyClass?: boolean | ThemeClassResolver<TSchema>;
  tokenSchema?: TSchema;
}
```

| Option             | Type                                              | Default                            | Description                                                                                 |
| ------------------ | ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `themes`           | `readonly ThemeDefinition[]`                      | `[LIGHT_THEME, DARK_THEME]`        | Defines available themes.                                                                   |
| `defaultTheme`     | `string`                                          | `"light"`                          | Theme used before init and when browser APIs are unavailable.                               |
| `systemTheme`      | `SystemThemeMap`                                  | `{ light: "light", dark: "dark" }` | Maps OS light and dark preferences to configured theme names.                               |
| `storageKey`       | `string`                                          | `"app-theme-preference"`           | Key used for `localStorage`.                                                                |
| `attribute`        | `string`                                          | `"data-theme"`                     | Attribute set on `document.documentElement`.                                                |
| `isTailwindCss`    | `boolean`                                         | `false`                            | Toggles the `dark` class when the active theme has `colorScheme: "dark"`.                   |
| `shouldApplyClass` | `boolean` or `(theme: ThemeDefinition) => string` | `true`                             | Adds `theme-${name}`, no class, or a resolver-provided class to `document.documentElement`. |
| `tokenSchema`      | `TSchema`                                         | `undefined`                        | Schema mapping theme token names to their corresponding CSS Custom Property names.          |

When class application is enabled, each theme application removes classes for all configured themes, then adds the class for the active theme.

#### `ThemeDefinition`

```ts
interface ThemeDefinition<TSchema extends Record<string, string> = Record<string, string>> {
  name: string;
  colorScheme: "light" | "dark";
  tokens?: Partial<Record<keyof TSchema, string>>;
}
```

| Field         | Type                                     | Description                                                      |
| ------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `name`        | `string`                                 | Unique theme name used for storage, attributes, and class names. |
| `colorScheme` | `"light" \| "dark"`                      | Browser color scheme applied through `style.colorScheme`.        |
| `tokens`      | `Partial<Record<keyof TSchema, string>>` | Optional theme-specific static token values.                     |

#### `SystemThemeMap`

```ts
interface SystemThemeMap {
  light: string;
  dark: string;
}
```

| Field   | Type     | Description                                                 |
| ------- | -------- | ----------------------------------------------------------- |
| `light` | `string` | Configured theme name used when the OS preference is light. |
| `dark`  | `string` | Configured theme name used when the OS preference is dark.  |

#### `ThemeClassResolver`

Returns the class name applied to `document.documentElement` for a theme.

```ts
type ThemeClassResolver<TSchema extends Record<string, string> = Record<string, string>> = (
  theme: ThemeDefinition<TSchema>,
) => string;
```

The returned class name must be a single non-empty class token without whitespace.

`init()`, `set()`, `toggle()`, `clearPreference()`, or system preference changes throw `Error` if the resolver returns an empty class name or a class name containing whitespace.

#### `ThemeChangeListener`

Listener passed to `theme.subscribe()`.

```ts
type ThemeChangeListener<TSchema extends Record<string, string> = Record<string, string>> = (
  detail: ThemeChangeDetail<TSchema>,
) => void;
```

#### `THEME_CHANGE_EVENT`

Window event name dispatched after theme changes in browser environments.

```ts
const THEME_CHANGE_EVENT = "themechange";
```

#### `ThemeChangeDetail`

```ts
interface ThemeChangeDetail<TSchema extends Record<string, string> = Record<string, string>> {
  name: string;
  theme: ThemeDefinition<TSchema>;
  source: ThemeChangeSource;
}
```

| Field    | Type                | Description                               |
| -------- | ------------------- | ----------------------------------------- |
| `name`   | `string`            | Active theme name after the change.       |
| `theme`  | `ThemeDefinition`   | Active theme definition after the change. |
| `source` | `ThemeChangeSource` | Reason the theme change was emitted.      |

#### `ThemeChangeSource`

Reason a theme change was emitted.

```ts
type ThemeChangeSource = "init" | "set" | "toggle" | "clearPreference" | "system";
```

| Value               | Emitted when                                       |
| ------------------- | -------------------------------------------------- |
| `"init"`            | `init()` resolves and applies the initial theme.   |
| `"set"`             | `set()` applies an explicit theme preference.      |
| `"toggle"`          | `toggle()` switches between system light and dark. |
| `"clearPreference"` | `clearPreference()` removes stored preference.     |
| `"system"`          | OS color scheme changes with no stored preference. |

#### Built-In Themes

Built-in theme definitions.

```ts
const LIGHT_THEME: ThemeDefinition = { name: "light", colorScheme: "light" };
const DARK_THEME: ThemeDefinition = { name: "dark", colorScheme: "dark" };
```

## Examples

### Dynamic CSS Tokens

```ts
import { createTheme } from "@codenhub/theme";

// 1. Define schema
const tokenSchema = {
  primary: "--color-primary",
  background: "--color-bg",
} as const;

// 2. Initialize with schema and optional theme static token values
const theme = createTheme({
  tokenSchema,
  themes: [
    {
      name: "light",
      colorScheme: "light",
      tokens: { primary: "#0070f3", background: "#ffffff" },
    },
    {
      name: "dark",
      colorScheme: "dark",
      tokens: { primary: "#3291ff", background: "#000000" },
    },
  ],
});

theme.init();

// 3. Switch theme and pass runtime overrides (e.g. from dynamic branding API)
theme.set("dark", { primary: "#ff007f" });
```

### Define CSS Tokens

```css
:root,
[data-theme="light"] {
  --color-background: white;
  --color-foreground: black;
}

[data-theme="dark"] {
  --color-background: black;
  --color-foreground: white;
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
}
```

### Add More Themes

```ts
import { createTheme, DARK_THEME, LIGHT_THEME } from "@codenhub/theme";

const theme = createTheme({
  themes: [LIGHT_THEME, DARK_THEME, { name: "high-contrast", colorScheme: "dark" }],
  systemTheme: { light: "light", dark: "high-contrast" },
  shouldApplyClass: (definition) => `mode-${definition.name}`,
});

theme.init();
theme.set("high-contrast");
```

### Listen For Changes

```ts
import { createTheme, THEME_CHANGE_EVENT, type ThemeChangeDetail } from "@codenhub/theme";

const theme = createTheme().init();

const unsubscribe = theme.subscribe((detail) => {
  console.log(detail.name, detail.theme, detail.source);
});

window.addEventListener(THEME_CHANGE_EVENT, (event) => {
  const detail = (event as CustomEvent<ThemeChangeDetail>).detail;

  console.log(detail.name);
});

unsubscribe();
theme.destroy();
```

## Requirements

- Browser integration uses `document.documentElement`, `document.documentElement.style.colorScheme`, `window.matchMedia`, `localStorage`, and `CustomEvent`.
- SSR is supported; DOM, storage, media query, and event work is skipped when browser APIs are unavailable.
- System preference changes update the active theme only when there is no valid stored preference.
- `localStorage` read, write, and remove errors are logged to the console via `console.error` and treated as unavailable storage.
- Consumers own CSS variables, selectors, visual tokens, and persistence consent requirements.
- No CSS file, design tokens, framework adapter, or peer dependency is provided.

## Notes

- Does not provide design tokens or generated CSS.
- Does not provide React, Vue, or other framework bindings.
- Does not provide server-side persistence.
- Does not manage user consent requirements for storage.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
