---
title: Defining Themes
description: Add your own themes, choose what the system setting and the toggle pick, read the current state, and every option with its default.
order: 2
---

# Defining Themes

[Getting started](getting-started.md) used the two built-in themes. Real apps tend to want more: a dimmer dark theme for night owls, a high-contrast one, a brand theme that gets renamed twice before launch. This page adds them and builds a theme menu for a settings screen, with an "Auto" entry that follows the operating system. Along the way it explains how the toggle and the system setting choose between themes, and how to read what is active.

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

Each entry is a `ThemeDefinition`, the exported type for one theme. `colorScheme` says whether a theme is light or dark. It is required, and it does three jobs: the package writes it to `color-scheme` so browser controls match, the toggle uses it to find the opposite theme, and Tailwind's `dark` class follows it.

`themes` replaces the built-in list rather than adding to it. Keep themes named `light` and `dark`, as above, or tell the package which themes to use instead, as the next sections show.

## Switch to a specific theme

`set()` applies a theme and saves it as the user's choice, the same way the toggle does. It is what a theme menu calls:

```ts
const menu = document.querySelector<HTMLSelectElement>("#theme-menu");

menu?.addEventListener("change", () => {
  if (menu.value === "auto") {
    theme.clearPreference();
  } else {
    theme.set(menu.value as "light" | "dark" | "dim");
  }
});
```

The names come from your `themes` object, so in TypeScript a misspelled name, such as `theme.set("dimm")`, is a compile error. In JavaScript it throws `Theme is not configured: dimm.`

`clearPreference()`, used above for the "Auto" entry, forgets the user's choice and follows the operating system again.

## Choose the themes the system picks

When the user has not chosen a theme, the package follows the operating system: `light` when it is in light mode, `dark` when it is in dark mode. `systemTheme` changes which of your themes those are. Its type is exported as `SystemThemeMap`:

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

A toggle switches between two things, but an app can have more than two themes, and the toggle has to go somewhere. `toggle()` decides from the active theme:

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

## Follow the system within a pair

Some apps offer theme families, each with a light and a dark variant, and let the user pick a family while the operating system still picks light or dark. Pair the variants, then pass `followSystem` to `set()`:

```ts
const theme = createTheme({
  themes: {
    light: { colorScheme: "light" },
    dark: { colorScheme: "dark" },
    "ocean-light": { colorScheme: "light", pairedTheme: "ocean-dark" },
    "ocean-dark": { colorScheme: "dark", pairedTheme: "ocean-light" },
  },
}).init();

theme.set("ocean-light", { followSystem: true });
```

The active theme is now `ocean-light` or `ocean-dark`, whichever has the operating system's color scheme, and it switches when the operating system does, reporting `source: "system"`. Either variant names the same choice. Without `matchMedia`, the theme you passed applies. The choice is saved, so it survives a reload and reaches other tabs, and [the pre-paint script](preventing-the-flash.md) applies the right variant before the first paint.

`followSystem` needs a theme whose `pairedTheme` has the opposite `colorScheme`; for any other theme, `set()` throws and changes nothing. A plain `set()` or `toggle()` saves a fixed choice again, and `clearPreference()` goes back to `systemTheme`. If you later remove the pair from a saved choice's theme, that theme stays applied as a fixed choice.

## Read the current state

The theme menu needs to show which entry is selected. The manager answers five questions:

| Member                | Answers                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `theme.name`          | Which theme is active, such as `"dim"`.                                                                                                 |
| `theme.get()`         | Everything about the active theme: `name`, `colorScheme`, `tokens`, and `pairedTheme`.                                                  |
| `theme.preference`    | Which theme the user saved, or `null` when nothing is saved, storage cannot be read, or the saved name is no longer one of your themes. |
| `theme.followsSystem` | Whether the saved choice follows the operating system within its pair, as `set(name, { followSystem: true })` saves it.                 |
| `theme.system`        | Which theme the operating system's setting maps to right now, whether or not it is shown.                                               |

`preference` is what makes the "Auto" entry possible: the menu shows "Auto" as selected while it is `null`. Run that on every change too, so the menu keeps up when the toggle or another tab changes the theme behind its back:

```ts
const showSelection = () => {
  if (menu) {
    menu.value = theme.preference ?? "auto";
  }
};

showSelection();
theme.subscribe(showSelection);
```

`preference` reads what is actually saved. While the browser blocks `localStorage`, it stays `null` even after the user picks a theme, although the choice is still applied for as long as the page runs; [Saving and syncing](persistence-and-sync.md#when-storage-fails) covers that case.

`get()` returns an `ActiveTheme`: a frozen object, and the same object until the theme next changes. That makes it safe to hand to a UI framework as a store snapshot, which [Frameworks](frameworks.md#react) relies on.

## Every option, and its default

All options are optional, and their type is exported as `ThemeOptions`. An option set to `undefined` gets its default, exactly as an omitted one does, so a wrapper can forward its own optional settings without checking them.

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

- **`storageKey`**: Every app on the same domain shares one `localStorage`. If two apps on one domain both use this package, give each its own key, such as `"my-app-theme"`, or they will take turns overwriting each other's choice.
- **`attribute`**: Any valid HTML attribute name works, one without spaces, quotes, `/`, `>`, or `=`, except `class` and `style`, because writing the theme name there would erase the classes and inline styles your page put on `<html>`. Use `className` to get a class.
- **`className`**: A function, typed `ThemeClassResolver`, receives the theme, including its static tokens, and returns one class name with no spaces. `className: (theme) => theme.name` gives classes like `dark` and `dim` instead of `theme-dark`. The package asks the function for every theme's class at once, the first time one is needed, usually in `init()` or `getPrePaintScript()`. A function that returns an empty or space-containing name for any theme makes that call throw, even when the theme it rejects is not the one being applied.

## When the configuration is wrong

`createTheme()` checks every option immediately and throws an `Error` describing the first problem it finds, such as a `defaultTheme` or `pairedTheme` that names no configured theme, a `colorScheme` that is neither `"light"` nor `"dark"`, or, while `className` is `true`, a theme name that cannot be part of a class. Nothing reaches the page from invalid options, so a mistake shows up the first time the code runs, not as a theme that silently never applies. The [`createTheme` reference](reference/index.md#createtheme) lists every rule, and [Troubleshooting](troubleshooting.md#createtheme-throws) covers the common ones with their fixes.

Next, [Design tokens](tokens.md) adds an accent color picker to the settings screen, which means moving some colors from CSS into JavaScript.
