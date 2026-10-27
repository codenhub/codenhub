---
title: Defining Themes
order: 2
---

# Defining Themes

[Getting started](getting-started.md) used the two built-in themes. Real apps usually want their own: a dimmer dark theme, a high-contrast one, a brand theme. This page adds them, explains how the toggle and the operating system choose between them, and shows how to read what is active.

## Describe your themes

Pass `themes` to `createTheme()`, keyed by theme name:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme({
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
    dim: { colorScheme: "dark" },
  },
}).init();
```

Each name is what lands in `data-theme`, so the CSS from Getting started gains one more block:

```css
[data-theme="dim"] {
  --background: #2b2b33;
  --text: #e4e4e7;
}
```

`colorScheme` says whether a theme is light or dark. It is required, and it does three jobs: the package writes it to `color-scheme` so browser controls match, the toggle uses it to find the opposite theme, and Tailwind's `dark` class follows it.

`themes` replaces the built-in list rather than adding to it. Keep themes named `light` and `dark`, as above, or tell the package which themes to use instead, as the next sections show.

## Switch to a specific theme

`set()` applies a theme and saves it as the user's choice, the same way the toggle does. Use it for a theme menu:

```ts
theme.set("dim");
```

The names come from your `themes` object, so in TypeScript a misspelled name, such as `theme.set("dimm")`, is a compile error. In JavaScript it throws `Theme is not configured: dimm.`

To forget the user's choice and follow the operating system again, for an "Auto" or "System" menu entry, call `clearPreference()`:

```ts
theme.clearPreference();
```

## Choose the themes the system picks

When the user has not chosen a theme, the package follows the operating system: `light` when it is in light mode, `dark` when it is in dark mode. `systemTheme` changes which of your themes those are:

```ts
const theme = createTheme({
  themes: {
    paper: { colorScheme: "light" },
    ink: { colorScheme: "dark" },
  },
  systemTheme: { light: "paper", dark: "ink" },
  defaultTheme: "paper",
});
```

`defaultTheme` is the theme used when there is no system setting to read, such as on a server or in a browser without `matchMedia`, and before `init()` runs. Because these themes are not named `light` and `dark`, both options are needed here; without them, `createTheme()` throws an error naming the missing theme.

## Decide what the toggle does

A toggle switches between two things, but an app can have more than two themes. `toggle()` decides where to go from the active theme:

1. If the active theme has a `pairedTheme`, it goes there.
2. Otherwise, it goes to the system theme of the opposite color scheme: from a dark theme to `systemTheme.light`, from a light theme to `systemTheme.dark`.

With the three themes from the start of this page, toggling from `light` goes to `dark` and back, and `dim` would toggle to `light`, the light system theme. To send `dim` somewhere else, pair it:

```ts
const theme = createTheme({
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
    dim: { colorScheme: "dark", pairedTheme: "light" },
    sepia: { colorScheme: "light", pairedTheme: "dim" },
  },
});
```

Now `sepia` toggles to `dim`, and `dim` toggles back to `light`. A pair goes one way only: give each theme its own `pairedTheme` when the toggle should return to where it came from.

## Read the current state

The manager answers four questions:

| Member             | Answers                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `theme.name`       | Which theme is active, such as `"dim"`.                                                   |
| `theme.get()`      | Everything about the active theme: `name`, `colorScheme`, `tokens`, and `pairedTheme`.    |
| `theme.preference` | Which theme the user saved, or `null` when they have not chosen one.                      |
| `theme.system`     | Which theme the operating system's setting maps to right now, whether or not it is shown. |

`preference` is what makes an "Auto" option possible: a menu shows "Auto" as selected while it is `null`.

```ts
const selected = theme.preference ?? "auto";
```

`preference` reads what is actually saved. While the browser blocks `localStorage`, it stays `null` even after the user picks a theme, although the choice is still applied for as long as the page runs; [Saving and syncing](persistence-and-sync.md#when-storage-fails) covers that case.

`get()` returns a frozen object, and the same object until the theme next changes. That makes it safe to hand to a UI framework as a store snapshot, which [Frameworks](frameworks.md#react) relies on.

## Every option, and its default

All options are optional. An option set to `undefined` gets its default, exactly as an omitted one does, so a wrapper can forward its own optional settings without checking them.

| Option         | Default                                                              | What it controls                                                                                            |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `themes`       | `{ light: { colorScheme: "light" }, dark: { colorScheme: "dark" } }` | The available themes, keyed by name.                                                                        |
| `defaultTheme` | `"light"`                                                            | The theme used when no system setting can be read, and before `init()`.                                     |
| `systemTheme`  | `{ light: "light", dark: "dark" }`                                   | The themes used for the operating system's light and dark modes.                                            |
| `storageKey`   | `"app-theme-preference"`                                             | The `localStorage` key the user's choice is saved under.                                                    |
| `attribute`    | `"data-theme"`                                                       | The attribute on `<html>` that holds the theme name.                                                        |
| `className`    | `true`                                                               | The class on `<html>`: `true` adds `theme-<name>`, `false` adds none, and a function returns a custom one.  |
| `darkClass`    | `false`                                                              | Whether to add a `dark` class while a dark theme is active, for [Tailwind CSS](frameworks.md#tailwind-css). |
| `tokenSchema`  | none                                                                 | The CSS custom properties token values are written to; see [Design tokens](tokens.md).                      |

A few of these deserve a word:

- **`storageKey`**: Every app on the same domain shares one `localStorage`. If two apps on one domain both use this package, give each its own key, such as `"my-app-theme"`, so they do not overwrite each other's choice.
- **`attribute`**: Any attribute name works except `class` and `style`, because writing the theme name there would erase the classes and inline styles your page put on `<html>`. Use `className` to get a class.
- **`className`**: A function receives the theme, including its static tokens, and returns one class name with no spaces. `className: (theme) => theme.name` gives classes like `dark` and `dim` instead of `theme-dark`. A function that returns an empty or space-containing name makes the operation that applied it throw.

## When the configuration is wrong

`createTheme()` checks every option immediately and throws an `Error` describing the first problem it finds, such as a `defaultTheme` or `pairedTheme` that names no configured theme, a `colorScheme` that is neither `"light"` nor `"dark"`, or, while `className` is `true`, a theme name that cannot be part of a class. Nothing reaches the page from invalid options, so a mistake shows up the first time the code runs, not as a theme that silently never applies. The [`createTheme` reference](reference/index.md#createtheme) lists every rule.

Next, [Design tokens](tokens.md) moves theme colors from CSS into JavaScript, for apps that need to change them while running.
