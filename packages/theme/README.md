# @codenhub/theme

Small zero-dependency theme preference helper for browser apps. It applies a theme name to the document and leaves all tokens, variables, and visual styles to your CSS.

This package does not ship design tokens or generated CSS.

## Basic Usage

```ts
import { Theme } from "@codenhub/theme";

const theme = new Theme({ tailwindcss: false, applyClass: true });

theme.init();
theme.set("dark");
theme.toggle();
```

By default, `init()` uses a valid stored preference first. If there is no valid stored preference, it maps the OS color scheme to `light` or `dark`.

## Tokens And Styles

Define your CSS variables and component styles in your app CSS.

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

The built-in theme definitions are only:

```ts
export const lightTheme = { name: "light", colorScheme: "light" };
export const darkTheme = { name: "dark", colorScheme: "dark" };
```

## Options

```ts
new Theme({
  themes: [lightTheme, darkTheme],
  defaultTheme: "light",
  systemTheme: { light: "light", dark: "dark" },
  storageKey: "app-theme-preference",
  attribute: "data-theme",
  tailwindcss: false,
  applyClass: true,
});
```

| Option         | Type                                                   | Description                                                                                             |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `themes`       | `ThemeDefinition[]`                                    | Defines available themes. Each theme has only `name` and `colorScheme`.                                 |
| `defaultTheme` | `string`                                               | The theme to use when browser APIs are unavailable.                                                     |
| `systemTheme`  | `SystemThemeMap`                                       | Maps OS light and dark preferences to configured theme names.                                           |
| `storageKey`   | `string`                                               | Stores the explicit user preference in `localStorage`.                                                  |
| `attribute`    | `string`                                               | Sets the active theme name on `document.documentElement`.                                               |
| `tailwindcss`  | `boolean`                                              | Toggles the `dark` class on `document.documentElement` when the active theme has `colorScheme: "dark"`. |
| `applyClass`   | `boolean` or `(definition: ThemeDefinition) => string` | Adds a custom class to `document.documentElement` when the active theme is applied.                     |

## More Themes

```ts
import { darkTheme, lightTheme, Theme } from "@codenhub/theme";

const theme = new Theme({
  themes: [lightTheme, darkTheme, { name: "high-contrast", colorScheme: "dark" }],
  systemTheme: { light: "light", dark: "high-contrast" },
  applyClass: (definition) => `mode-${definition.name}`,
});

theme.init();
theme.set("high-contrast");
```

## Events

```ts
import { Theme, THEME_CHANGE_EVENT, type ThemeChangeDetail } from "@codenhub/theme";

const theme = new Theme().init();

const unsubscribe = theme.subscribe((event) => {
  console.log(event.name, event.theme, event.source);
});

window.addEventListener(THEME_CHANGE_EVENT, (event) => {
  const detail = (event as CustomEvent<ThemeChangeDetail>).detail;

  console.log(detail);
});

unsubscribe();
```

## API

```ts
theme.init();
theme.get();
theme.set("dark");
theme.toggle();
theme.clearPreference();
theme.getStored();
theme.getSystem();
theme.subscribe(listener);
theme.destroy();
```

All methods are safe to call during SSR. Without `window` or `document`, DOM and storage work is skipped and defaults are returned.
