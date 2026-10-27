---
title: Saving and Syncing
order: 4
---

# Saving and Syncing

The theme switch already remembers the user's choice and follows the operating system. This page explains how that works, what happens when the browser gets in the way, and how the rest of your code can follow along when the theme changes.

## How the choice is saved

`set()` and `toggle()` save the chosen theme's name in `localStorage`, under the key `"app-theme-preference"` unless you set `storageKey`. On the next visit, `init()` finds it and applies it. `clearPreference()` deletes it and returns to the operating system's setting.

Only a name that matches a configured theme counts. If the saved value names a theme you have since removed, the package ignores it, as if nothing were saved.

While a choice is saved, changes to the operating system's light or dark mode are ignored: the user said what they want. They apply again once `clearPreference()` runs.

## When storage fails

Browsers can refuse `localStorage`: a private window may block it, a user may disable site data, or storage may be full. The package never lets that break your page, and each kind of failure (read, write, delete) is logged once with `console.error`, not on every call:

- **A failed read** counts as no saved choice, so the operating system's setting applies, unless the user already picked a theme with `set()` or `toggle()` on this page, which stays.
- **A failed write** keeps whatever was saved before, if anything. The user's new choice still works for as long as the page is open: after `set()` or `toggle()`, the chosen theme stays, and operating-system changes do not override it. On reload, the previously saved theme, or the operating system's setting, applies again.
- **A failed delete** in `clearPreference()` leaves the old choice saved. The page switches to the system theme, but a reload restores the saved choice, and operating-system changes stay ignored while it is there.

`theme.preference` always reports what storage actually holds, so in that situation it can disagree with the active theme: it stays `null` when storage cannot be read at all, and keeps the previously saved theme when only saving fails, as with a full quota.

## Keeping tabs in agreement

A user with your app open in two tabs who switches the theme in one expects the other to follow. It does, automatically: every tab whose manager has run `init()` with the same `storageKey` listens for changes to the saved choice. When another tab saves, clears, or replaces it, including with `localStorage.clear()`, each tab picks its theme again from storage and the operating system, as `init()` does. A choice a tab could not save is dropped at that point, because storage no longer agrees with it.

Only the theme follows. Token overrides from `setTokens()` belong to the tab that set them.

## Reacting to changes

Other parts of your code may need to know when the theme changes: a chart that redraws in new colors, or an icon that shows a sun or a moon. `subscribe()` calls a function after every change and returns a function that stops it:

```ts
const unsubscribe = theme.subscribe(({ name, theme: active, source }) => {
  console.log(`Now showing ${name}, a ${active.colorScheme} theme, because of ${source}.`);
});

// Later, when it is no longer needed:
unsubscribe();
```

The function receives:

- `name`: the active theme's name.
- `theme`: the same object `theme.get()` returns.
- `source`: what caused the change. It is the method that ran, `"init"`, `"set"`, `"toggle"`, `"clearPreference"`, or `"setTokens"`; `"system"` when the operating system's mode changed; or `"storage"` when another tab changed the saved choice.

`source` matters when your app also saves the theme somewhere else, such as a user profile on your server. React only to `"set"`, `"toggle"`, and `"clearPreference"`, the user's own actions. Otherwise every open tab would repeat the same request when it receives the change through `"storage"`.

A few guarantees make subscribers safe to write:

- A subscriber that throws is logged, and the others still run.
- A subscriber that changes the theme itself, such as by calling `set()`, stops the delivery of the change it received: the subscribers after it receive only the newer change, so none of them acts on a theme that is already gone.
- A subscriber added while a change is being delivered receives only later changes.

### From code without access to the manager

Some code cannot import the manager, such as a third-party widget or a separate script. The package also dispatches a `themechange` event on `window` after every change, with the same information in its `detail`. Import the event name and type instead of writing the string yourself:

```ts
import { THEME_CHANGE_EVENT, type ThemeChangeEvent } from "@codenhub/theme";

window.addEventListener(THEME_CHANGE_EVENT, (event) => {
  const { name } = (event as ThemeChangeEvent).detail;
  console.log(`Now showing ${name}.`);
});
```

The event does not say which manager sent it. If a page runs more than one manager, use `subscribe()` on the one you care about.

Next, [Preventing the flash](preventing-the-flash.md) makes the right theme appear before the page is first drawn.
