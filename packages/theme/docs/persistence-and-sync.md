---
title: Saving and Syncing
description: How the choice is saved, what happens when storage fails, how tabs stay in agreement, and how to react to theme changes.
order: 4
---

# Saving and Syncing

The theme switch already remembers the user's choice and follows the operating system. This page explains how that works, what happens when the browser gets in the way, and how the rest of your code, such as a chart that has to redraw in the new colors, can follow along when the theme changes.

## How the choice is saved

`set()` and `toggle()` save the chosen theme's name in `localStorage`, under the key `"app-theme-preference"` unless you set `storageKey`. On the next visit, `init()` finds it and applies it. `clearPreference()` deletes it and returns to the operating system's setting.

A choice made with `set(name, { followSystem: true })` is saved as a small JSON object instead, such as `{"name":"ocean-light","followSystem":true}`. A version of this package from before `followSystem` reads that value as a theme name it does not know, so it ignores it, as described next, rather than misreading it.

Only a name that matches a configured theme counts. If the saved value names a theme you have since removed, the package ignores it, as if nothing were saved. Renaming `sepia` to `parchment` is safe; the users who picked it fall back to their system theme.

While a choice is saved, changes to the operating system's light or dark mode are ignored: the user said what they want. They apply again once `clearPreference()` runs. A choice that [follows the system within a pair](themes.md#follow-the-system-within-a-pair) is the exception: it switches between its two themes as the operating system changes.

## When storage fails

Browsers can refuse `localStorage`: a private window may block it, a user may disable site data, or storage may be full. The package never lets that break your page, and each kind of failure (read, write, delete) is logged once with `console.error`, not on every call:

- **A failed read** counts as no saved choice, so the operating system's setting applies, unless the user already picked a theme with `set()` or `toggle()` on this page, which stays.
- **A failed write** keeps whatever was saved before, if anything. The user's new choice still works for as long as the page is open: after `set()` or `toggle()`, the chosen theme stays, and operating-system changes do not override it. On reload, the previously saved theme, or the operating system's setting, applies again. The one exception is a choice made before `init()`: `init()` reads storage first, so a previously saved theme replaces it.
- **A failed delete** in `clearPreference()` leaves the old choice saved. The page switches to the system theme, but a reload restores the saved choice, and operating-system changes stay ignored while it is there.

`theme.preference` and `theme.followsSystem` report the saved choice when it names one of your themes. When storage cannot be read at all, they report the choice made on this page instead, and `null` and `false` once `clearPreference()` runs or before any choice. When only saving fails, as with a full quota, they report the previously saved theme if there is one, which is also the one operating-system changes and a reload go by, so they can disagree with the active theme.

## Keeping tabs in agreement

A user with your app open in two tabs who switches the theme in one expects the other to follow. It does, automatically: every tab whose manager has run `init()` with the same `storageKey` listens for changes to the saved choice. When another tab saves, clears, or replaces it, including with `localStorage.clear()`, each tab picks its theme again from storage and the operating system, as `init()` does.

A choice a tab could not save is dropped at that point, because storage no longer agrees with it. The exception is a tab where accessing `window.localStorage` itself throws: it ignores these events and keeps its choice. A tab that can reach `localStorage` but fails to read from it drops its choice like any other.

Only the theme follows. Token overrides from `setTokens()` belong to the tab that set them.

## Reacting to changes

Other parts of your code may need to know when the theme changes: the chart that redraws in new colors, or the toggle icon that shows a sun or a moon. `subscribe()` calls a function after every change and returns a function that stops it:

```ts
const unsubscribe = theme.subscribe(({ name, theme: active, source }) => {
  console.log(`Now showing ${name}, a ${active.colorScheme} theme, because of ${source}.`);
});

// Later, when it is no longer needed:
unsubscribe();
```

The function, typed `ThemeChangeListener`, receives a `ThemeChangeDetail`:

- `name`: the active theme's name.
- `theme`: the same object `theme.get()` returns.
- `source`: what caused the change, typed `ThemeChangeSource`. It is the method that ran, `"init"`, `"set"`, `"toggle"`, `"clearPreference"`, or `"setTokens"`; `"system"` when the operating system's mode changed; or `"storage"` when another tab changed the saved choice.

Those types help when the subscriber lives somewhere else:

```ts
import type { ThemeChangeListener } from "@codenhub/theme";

const redrawChart: ThemeChangeListener = ({ theme: active }) => {
  chart.setColors(active.tokens);
};

theme.subscribe(redrawChart);
```

A change is announced even when it lands on the theme that was already active, such as `set("dark")` while `dark` is showing. Compare `name` with the previous one when only a real switch should do work.

`source` matters when your app also saves the theme somewhere else, such as a user profile on your server. React only to `"set"`, `"toggle"`, and `"clearPreference"`, the user's own actions. Otherwise every open tab repeats the same request when it receives the change through `"storage"`, and your server learns about the user's theme once per tab.

A few guarantees make subscribers safe to write:

- A subscriber that throws is logged, and the others still run.
- A subscriber that changes the theme itself, such as by calling `set()`, stops the delivery of the change it received: the subscribers after it receive only the newer change, so none of them acts on a theme that is already gone.
- A subscriber added while a change is being delivered receives only later changes.

### From code without access to the manager

Some code cannot import the manager, such as a third-party widget or a separate script. The package also dispatches a `themechange` event on `window` after every change that a subscriber did not replace with a newer one, with the same `ThemeChangeDetail` in its `detail`. Import the event name and type instead of writing the string yourself:

```ts
import { THEME_CHANGE_EVENT, type ThemeChangeEvent } from "@codenhub/theme";

window.addEventListener(THEME_CHANGE_EVENT, (event) => {
  const { name } = (event as ThemeChangeEvent).detail;
  console.log(`Now showing ${name}.`);
});
```

The event does not say which manager sent it. If a page runs more than one manager, use `subscribe()` on the one you care about.

Next, [Preventing the flash](preventing-the-flash.md) makes the right theme appear before the page is first drawn.
