---
title: Troubleshooting
order: 7
---

# Troubleshooting

Start with the symptom you see. Each entry says how to confirm the cause, then how to fix it.

## Nothing changes when the theme switches

Open the browser's developer tools and inspect the `<html>` element while you click the toggle.

- **`data-theme` changes, but the page does not.** The package is working; your CSS has no rules for that theme name. Add a `[data-theme="<name>"]` rule for every theme, as in [Getting started](getting-started.md#2-write-the-css-for-each-theme). If you set `attribute`, use that attribute name in your selectors instead.
- **`data-theme` never appears.** If you set `attribute`, look for that attribute instead. If it never appears either, `init()` was not called, or the code calling it never ran. `createTheme()` alone does nothing to the page. Check the console for an error thrown earlier, such as one from `createTheme()` about invalid options.
- **Tailwind `dark:` styles do not apply.** Check for `darkClass: true` in the options, a `dark` class on `<html>`, and the Tailwind configuration from [Frameworks](frameworks.md#tailwind-css). Without that configuration, Tailwind follows the operating-system setting and ignores the class.

## The wrong theme flashes when the page loads

The pre-paint script is missing, blocked, or out of step with your app. In order:

1. View the page source, not the developer tools' element view, and check that the script is inside `<head>`. If it is not there, set it up as in [Preventing the flash](preventing-the-flash.md).
2. Check the console for a Content Security Policy error. If there is one, allow the script with a nonce or a hash; see [Content Security Policy](preventing-the-flash.md#content-security-policy).
3. Check that the script and your app's manager use the same options, especially `storageKey` and `themes`. Importing both from one module keeps them aligned.

## The choice is forgotten after a reload

- **The browser blocks storage**, as some private windows do. The console shows a `[theme]` error the first time saving fails. The choice still works until the page closes; there is nowhere to keep it longer. See [When storage fails](persistence-and-sync.md#when-storage-fails).
- **Another app on the same domain uses the same `storageKey`** and overwrites it. Give your app its own `storageKey`.
- **The saved theme no longer exists**, because it was renamed or removed from `themes`. The package ignores a saved name it does not recognize, so the user falls back to the operating-system setting.

## The theme ignores the operating system

The user has a saved choice, which always wins. `theme.preference` shows it. Call `theme.clearPreference()`, from an "Auto" or "System" option in your UI, to follow the operating system again.

## `createTheme()` throws

The options are invalid, and the error message names the problem. The most common ones:

- **A missing theme.** Custom `themes` without `light` and `dark` also need `defaultTheme` and `systemTheme` naming themes you defined; see [Choose the themes the system picks](themes.md#choose-the-themes-the-system-picks).
- **A `pairedTheme`, `defaultTheme`, or `systemTheme` naming a theme that is not in `themes`.** Check the spelling.
- **A theme name that cannot be a class.** While `className` is `true`, each name becomes part of a `theme-<name>` class, so it cannot contain spaces. Rename the theme, or set `className` to `false` or a function.
- **`tokens` without a `tokenSchema`, or a token not listed in it.** Every token needs an entry in `tokenSchema`; see [Design tokens](tokens.md).

## TypeScript reports `Cannot find name 'NoInfer'`

Your TypeScript version is older than 5.4, which added `NoInfer`. Update TypeScript in your project. Turning on `skipLibCheck` hides the error, but then the types also accept theme names you did not configure.

## A React hydration warning mentions `<html>`

React found the `data-theme`, class, or `style` the pre-paint script added. That difference is expected; add `suppressHydrationWarning` to your `<html>` element, as shown in [Preventing the flash](preventing-the-flash.md#in-a-server-rendered-app).
