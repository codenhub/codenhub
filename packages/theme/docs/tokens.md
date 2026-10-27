---
title: Design Tokens
order: 3
---

# Design Tokens

So far, every color lived in CSS, keyed by `[data-theme]`. That is the simplest setup and often all an app needs. Some apps need theme values in JavaScript too: colors loaded from a JSON config, a brand color the user picks in a settings screen, or a value a canvas chart reads. **Tokens** cover those cases. A token is a named value, such as `primary`, that the package writes to a CSS custom property, such as `--color-primary`, whenever its theme is active.

## Name your tokens

`tokenSchema` lists the tokens and the custom property each one is written to:

```ts
import { createTheme } from "@codenhub/theme";

const theme = createTheme({
  themes: {
    light: { colorScheme: "light", tokens: { primary: "#171717", surface: "#ffffff" } },
    dark: { colorScheme: "dark", tokens: { primary: "#f9fafb", surface: "#171717" } },
  },
  tokenSchema: { primary: "--color-primary", surface: "--color-surface" },
}).init();
```

Each theme's `tokens` holds its values. When `dark` becomes active, the package sets `--color-primary: #f9fafb` and `--color-surface: #171717` on `<html>`, and your CSS uses them like any other custom property:

```css
button {
  background: var(--color-primary);
  color: var(--color-surface);
}
```

In TypeScript, the keys of `tokenSchema` type every `tokens` object, so a misspelled token name is a compile error. Without a `tokenSchema`, tokens are not allowed at all.

Each `tokenSchema` value must be a custom property name a stylesheet can use as written: `--` followed by letters, digits, `-`, or `_`. Anything else, such as `"--"` alone or a name containing a space, throws from `createTheme()`, as does mapping two tokens to the same property.

## Mix tokens with CSS

A theme does not have to set every token. When the active theme leaves a token out, the package removes that property from `<html>`, and whatever your stylesheet says applies instead. Token values are set as inline styles on `<html>`, so when a theme does set one, it wins over a value for the same property in a `[data-theme]` rule.

That lets you keep most values in CSS and move only the ones JavaScript must control.

## Change tokens at runtime

`setTokens()` overrides token values for every theme, which suits a color the user picks:

```ts
const picker = document.querySelector<HTMLInputElement>("#accent-picker");

picker?.addEventListener("input", () => {
  theme.setTokens({ primary: picker.value });
});
```

Overrides win over the themes' own `tokens`, and they stay in place when the theme changes. Each call replaces all previous overrides, so pass every token you want overridden, and pass `{}` to remove them all.

A few rules keep the values predictable:

- **Overrides are not saved.** They last until the page unloads or `destroy()` runs. To keep a user's color, save it yourself and call `setTokens()` again on the next visit.
- **An empty value means "no override".** A token set to `""` or `undefined` falls back to the theme's own value. A cleared color input therefore returns to the theme color instead of removing it.
- **Numbers are written as strings.** `setTokens({ radius: 4 })` writes `"4"`. Any value that is not a string, a finite number, `undefined`, or `""` throws, as does a token name that is not in `tokenSchema`.
- **Values are not checked as CSS.** A value the browser rejects, such as `"red; color: blue"`, is simply not applied, and the property keeps its previous value. Check values that come from user input before passing them in.
- **Before `init()`, overrides wait.** Called before the first theme is applied, `setTokens()` only records the overrides; the next change, usually `init()`, applies them. This keeps an early call from showing the default theme over the one already on the page.

## Read token values

`theme.get().tokens` holds the values JavaScript knows about: the active theme's `tokens` with your overrides on top. It never reads the page.

`theme.readTokens()` also includes tokens defined only in CSS. For each token JavaScript has no value for, it reads the value the browser computed for the custom property on `<html>`:

```ts
theme.setTokens({ primary: "#00c853" });

// With the light theme active:
theme.get().tokens; // { primary: "#00c853", surface: "#ffffff" }
theme.readTokens(); // the same, plus any token the theme left to CSS
```

Reading computed styles can make the browser recalculate layout, so prefer `get().tokens` unless you need the CSS-only values. `readTokens()` skips the read entirely when JavaScript knows every token.

Next, [Saving and syncing](persistence-and-sync.md) covers how the user's choice is saved and how the rest of your code finds out when the theme changes.
