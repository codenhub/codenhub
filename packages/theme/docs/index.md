---
title: Overview
description: What the package is for, how it picks a theme, and the order to read its pages in.
---

# Manage Browser Themes

Almost every app that offers a dark mode ends up writing the same code: check `localStorage` for a saved choice, fall back to the operating system's light or dark setting, put a class or attribute on `<html>` so CSS can react, save the choice when the user clicks a toggle, and keep every open tab in agreement. Then the page flashes white on load for everyone who chose dark, and the code grows a second copy of itself inside an inline script to fix that. Two copies of the same logic, kept in sync by hope.

`@codenhub/theme` is that code, written once. You describe your themes, and it decides which one is active, remembers the user's choice, follows the operating system until the user makes one, and tells the page about it.

## What it does, and what it leaves to you

The package decides **which** theme is active. Your CSS decides what each theme **looks like**.

On every change, it writes the active theme onto the `<html>` element (`document.documentElement`):

```html
<html data-theme="dark" class="theme-dark" style="color-scheme: dark"></html>
```

- `data-theme="dark"`: the theme's name, for CSS selectors such as `[data-theme="dark"]`.
- `class="theme-dark"`: the same name as a `theme-<name>` class, added by default for code that prefers classes (the `className` option changes or removes it). With `darkClass: true`, a `dark` class for Tailwind CSS is added too.
- `color-scheme: dark`: tells the browser to draw its own controls, such as scrollbars and form fields, in dark colors.
- CSS custom properties, such as `--color-primary`, for the tokens you list in `tokenSchema` and give values in JavaScript.

It ships no CSS, no colors, and no toggle button. Those stay in your application, in whatever form you already write them. That also makes a few jobs yours:

- **Accessibility.** The toggle is your element, so its accessible name is yours too: a button that only shows a sun icon needs an `aria-label`, such as "Switch to dark theme". Each theme's text and background colors need enough contrast, which no package can check for you.
- **Security.** Token values are written to the page as inline CSS without being checked as CSS. When a value comes from user input, validate it first; [Design tokens](tokens.md#change-tokens-at-runtime) says what happens otherwise.
- **Performance.** Applying a theme writes a handful of attributes and properties, which is cheap. `readTokens()` is the one call that can make the browser recalculate layout; [Design tokens](tokens.md#read-token-values) covers when to use it.

## How a theme is chosen

When the page starts, the package picks a theme in this order:

1. **The user's saved choice.** Once the user picks a theme, it is saved in the browser's `localStorage` and wins on every later visit.
2. **The operating system's setting.** Until the user picks one, the theme follows the system's light or dark mode, and changes with it.
3. **The default theme.** If neither is available, such as on a server, the default theme applies: `light`, unless you configure another.

## The walkthrough

The pages build one app's theme support from nothing: a toggle first, then a settings screen with a theme menu, a custom accent color, and finally the production setup. Read in order, they take you from an empty page to shipping:

1. [Getting started](getting-started.md): Install the package and build a working light and dark toggle.
2. [Defining themes](themes.md): Add your own themes, decide how the toggle and the system setting pick between them, and read the current state.
3. [Design tokens](tokens.md): Keep theme colors in JavaScript and change them at runtime.
4. [Saving and syncing](persistence-and-sync.md): How the choice is saved, how tabs stay in agreement, and how to react when the theme changes.
5. [Preventing the flash](preventing-the-flash.md): Apply the theme before the first paint, in a static site or a server-rendered one.
6. [Frameworks](frameworks.md): Use the package with React, and with Tailwind CSS's `dark:` variant.
7. [Troubleshooting](troubleshooting.md): What to check when something does not work.

The [API reference](reference/index.md) lists every export with its full signature. Look things up there; read the walkthrough to learn how they fit together.

## Requirements

- **A browser, for the theme to show.** The package uses `document.documentElement`, `localStorage`, `matchMedia`, `storage` events, and `CustomEvent`, and treats any of them that is missing as absent instead of crashing your page. A `localStorage` or `matchMedia` call that throws, as in a private window, is treated the same way. On a server it does nothing that needs a browser; see [Preventing the flash](preventing-the-flash.md#what-the-server-knows).
- **Chrome 93, Firefox 92, Safari 15.4, or newer**, as published. The package is shipped as modern JavaScript: it calls `Object.hasOwn`, so `createTheme()` throws a `TypeError` in a browser that lacks it, and it uses the `??=` operator, so a browser older than Chrome 85, Firefox 79, or Safari 14 cannot load it at all and reports a `SyntaxError` instead. To support an older browser, have your build transpile dependencies and add polyfills for it. The pre-paint script from [Preventing the flash](preventing-the-flash.md) is plain ES5 and still sets the theme's attribute and classes in browsers far below that floor, back to Chrome 24, Firefox 24, and Safari 7. Tokens and `color-scheme` take effect only where the browser supports CSS custom properties and `color-scheme`.
- **TypeScript 5.4 or newer**, if you use TypeScript. The types use `NoInfer`, which older compilers report as `Cannot find name 'NoInfer'`. Plain JavaScript projects need nothing extra.
- **Nothing else.** No dependencies, and no framework.

Ready? [Getting started](getting-started.md) has a toggle working in five steps.
