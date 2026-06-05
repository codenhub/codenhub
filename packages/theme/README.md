# @codenhub/theme

Small zero-dependency theme preference helper for browser apps. It applies a theme name to the document and leaves tokens, variables, and visual styles to your CSS.

## Install

```sh
pnpm add @codenhub/theme
```

## Imports

```ts
import { Theme, darkTheme, lightTheme, THEME_CHANGE_EVENT } from "@codenhub/theme";
import type { ThemeChangeDetail, ThemeDefinition, ThemeOptions } from "@codenhub/theme";
```

Supported import paths:

| Path              | Description                         |
| ----------------- | ----------------------------------- |
| `@codenhub/theme` | Main JavaScript and TypeScript API. |

## Quick Start

```ts
import { Theme } from "@codenhub/theme";

const theme = new Theme({ tailwindcss: false, applyClass: true });

theme.init();
theme.set("dark");
theme.toggle();
```

By default, `init()` uses a valid stored preference first. If there is no valid stored preference, it maps the OS color scheme to `light` or `dark`.

## API Reference

### `Theme`

Manages the active theme, storage preference, DOM attributes/classes, system preference listener, and change notifications.

```ts
class Theme {
  constructor(options?: ThemeOptions);
  init(): this;
  get(): ThemeDefinition;
  set(name: string): ThemeDefinition;
  toggle(): ThemeDefinition;
  clearPreference(): ThemeDefinition;
  getStored(): string | null;
  getSystem(): ThemeDefinition;
  subscribe(listener: ThemeChangeListener): () => void;
  destroy(): void;
}
```

Import from `@codenhub/theme`.

The constructor throws `Error` when configured theme names are empty, duplicated, invalid for CSS class application, or referenced by `defaultTheme` or `systemTheme` without being configured.

#### `init()`

Registers the system preference listener, resolves the initial theme, applies it, and emits a change with source `"init"`.

```ts
function init(): this;
```

#### `get()`

Returns the active theme definition.

```ts
function get(): ThemeDefinition;
```

#### `set()`

Activates a configured theme by name and stores the explicit preference when browser storage is available.

```ts
function set(name: string): ThemeDefinition;
```

Throws `Error` when `name` is not configured.

#### `toggle()`

Toggles between the configured system light and dark theme names, then stores the explicit preference when browser storage is available.

```ts
function toggle(): ThemeDefinition;
```

#### `clearPreference()`

Removes the stored preference and activates the current system theme.

```ts
function clearPreference(): ThemeDefinition;
```

#### `getStored()`

Returns the stored theme name when it exists and is configured.

```ts
function getStored(): string | null;
```

Returns `null` during SSR, when storage is unavailable, or when the stored name is not configured.

#### `getSystem()`

Returns the configured theme for the current `prefers-color-scheme` value.

```ts
function getSystem(): ThemeDefinition;
```

Returns the default theme during SSR or when `matchMedia` is unavailable.

#### `subscribe()`

Registers an in-process listener for theme changes.

```ts
function subscribe(listener: ThemeChangeListener): () => void;
```

Returns an unsubscribe function.

#### `destroy()`

Removes the system preference listener and clears in-process subscribers.

```ts
function destroy(): void;
```

Call this during app or test cleanup when the instance is no longer used.

### `ThemeOptions`

```ts
interface ThemeOptions {
  themes?: readonly ThemeDefinition[];
  defaultTheme?: string;
  systemTheme?: SystemThemeMap;
  storageKey?: string;
  attribute?: string;
  tailwindcss?: boolean;
  applyClass?: boolean | ThemeClassResolver;
}
```

| Option         | Type                                              | Default                            | Description                                                                                 |
| -------------- | ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `themes`       | `readonly ThemeDefinition[]`                      | `[lightTheme, darkTheme]`          | Defines available themes.                                                                   |
| `defaultTheme` | `string`                                          | `"light"`                          | Theme used before init and when browser APIs are unavailable.                               |
| `systemTheme`  | `SystemThemeMap`                                  | `{ light: "light", dark: "dark" }` | Maps OS light and dark preferences to configured theme names.                               |
| `storageKey`   | `string`                                          | `"app-theme-preference"`           | Key used for `localStorage`.                                                                |
| `attribute`    | `string`                                          | `"data-theme"`                     | Attribute set on `document.documentElement`.                                                |
| `tailwindcss`  | `boolean`                                         | `false`                            | Toggles the `dark` class when the active theme has `colorScheme: "dark"`.                   |
| `applyClass`   | `boolean` or `(theme: ThemeDefinition) => string` | `true`                             | Adds `theme-${name}`, no class, or a resolver-provided class to `document.documentElement`. |

### `ThemeDefinition`

```ts
interface ThemeDefinition {
  name: string;
  colorScheme: "light" | "dark";
}
```

### `SystemThemeMap`

```ts
interface SystemThemeMap {
  light: string;
  dark: string;
}
```

### `ThemeClassResolver`

Returns the class name applied to `document.documentElement` for a theme.

```ts
type ThemeClassResolver = (theme: ThemeDefinition) => string;
```

The returned class name must be a single non-empty class token without whitespace.

### `ThemeChangeListener`

Listener passed to `theme.subscribe()`.

```ts
type ThemeChangeListener = (detail: ThemeChangeDetail) => void;
```

### `THEME_CHANGE_EVENT`

Window event name dispatched after theme changes in browser environments.

```ts
const THEME_CHANGE_EVENT = "themechange";
```

### `ThemeChangeDetail`

```ts
interface ThemeChangeDetail {
  name: string;
  theme: ThemeDefinition;
  source: "init" | "set" | "toggle" | "clearPreference" | "system";
}
```

### `ThemeChangeSource`

Reason a theme change was emitted.

```ts
type ThemeChangeSource = "init" | "set" | "toggle" | "clearPreference" | "system";
```

### `lightTheme` And `darkTheme`

Built-in theme definitions.

```ts
const lightTheme: ThemeDefinition = { name: "light", colorScheme: "light" };
const darkTheme: ThemeDefinition = { name: "dark", colorScheme: "dark" };
```

## Examples

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
import { Theme, darkTheme, lightTheme } from "@codenhub/theme";

const theme = new Theme({
  themes: [lightTheme, darkTheme, { name: "high-contrast", colorScheme: "dark" }],
  systemTheme: { light: "light", dark: "high-contrast" },
  applyClass: (definition) => `mode-${definition.name}`,
});

theme.init();
theme.set("high-contrast");
```

### Listen For Changes

```ts
import { Theme, THEME_CHANGE_EVENT, type ThemeChangeDetail } from "@codenhub/theme";

const theme = new Theme().init();

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

## Runtime Requirements

- Browser integration uses `document.documentElement`, `window.matchMedia`, `localStorage`, and `CustomEvent`.
- SSR is supported; DOM, storage, media query, and event work is skipped when browser APIs are unavailable.
- Consumers own CSS variables, selectors, visual tokens, and persistence consent requirements.
- No CSS file, design tokens, framework adapter, or peer dependency is provided.

## Limitations And Non-Goals

- Does not provide design tokens or generated CSS.
- Does not provide React, Vue, or other framework bindings.
- Does not provide server-side persistence.
- Does not synchronize theme changes across tabs.
- Does not manage user consent requirements for storage.
