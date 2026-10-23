---
title: Tokens, Persistence, and Cross-Tab Sync
---

# Tokens, Persistence, and Cross-Tab Sync

## Token resolution

`tokenSchema` maps typed token names to the CSS custom property each one writes, such as `{ primary: "--color-primary" }`. Each token can come from three sources, in this priority order (last wins):

1. **Computed style** — the value CSS gives the property on `document.documentElement`, for a token not defined in JS.
2. **Theme static tokens** — values set on the active theme's `tokens`.
3. **Runtime overrides** — values passed to `setTokens()`.

`get().tokens` holds the JS sources, 2 and 3, and never reads the DOM. `readTokens()` adds the computed values of the remaining tokens at the time of the call:

```ts
const theme = createTheme({
  themes: {
    light: { colorScheme: "light", tokens: { accent: "#ff6600" } },
    dark: { colorScheme: "dark" },
  },
  tokenSchema: { accent: "--color-accent", surface: "--color-surface" },
}).init();

theme.setTokens({ accent: "#00c853" }); // runtime override wins over the static "#ff6600"
theme.get().tokens; // { accent: "#00c853" }
theme.readTokens(); // { accent: "#00c853", surface: "<computed --color-surface>" }
```

Reading computed values can force a synchronous layout, so prefer `get().tokens` when tokens defined only in CSS are not needed. `readTokens()` skips the read when every token is known in JS.

Token values are strings. A number passed from JavaScript, such as a value read from a JSON config, is written as its string, so `get().tokens` reports `"4"` for `4`; any other value throws.

Runtime overrides apply to every theme and persist across theme changes until `setTokens()` replaces them — pass `{}` to remove them. They are not stored, so they last until the page unloads or `destroy()` runs, and they are not part of the pre-paint script. Passing a token key that is not in `tokenSchema` throws.

## Persistence

An explicit preference set through `set()` or `toggle()` is written to `localStorage` under `storageKey` (default `"app-theme-preference"`). `theme.preference` returns that value when it names a configured theme, or `null` when it is unset, invalid, or storage is unavailable (for example during SSR). `clearPreference()` removes the stored value and applies `theme.system`, the theme the OS preference currently maps to.

Storage reads, writes, and removals that throw — a full quota, a disabled storage API, a private-browsing restriction — are treated the same as unavailable storage; they never throw out of `Theme` methods. Each kind of operation is logged with `console.error` the first time it fails for a manager, so a page with blocked storage logs one error per kind rather than one per read.

While storage is unavailable, a choice made with `set()` or `toggle()` is not stored and `theme.preference` stays `null`, but the manager still remembers the choice for as long as it runs: OS color-scheme changes do not override it until `clearPreference()` or `destroy()` runs.

## Cross-tab sync

Every tab running `createTheme().init()` against the same `storageKey` stays in sync: when another tab sets, clears, or invalidates the stored preference — including through `localStorage.clear()` — each tab re-resolves its theme from storage and the OS preference and notifies with `source: "storage"`. A tab with its own runtime token overrides keeps them; only the active theme changes.

The OS `prefers-color-scheme` media query applies automatically only while no valid stored preference exists. Once a tab (or a previous session) has stored an explicit preference, later system-preference changes are ignored until `clearPreference()` runs.

## Reacting to changes

`subscribe(listener)` registers a callback invoked after every applied change and returns an unsubscribe function:

```ts
const unsubscribe = theme.subscribe(({ name, source }) => {
  console.log(`theme is now "${name}" (${source})`);
});
```

`source` names what caused the change: the method that ran (`"init"`, `"set"`, `"toggle"`, `"clearPreference"`, `"setTokens"`), `"system"` for an OS color-scheme change, or `"storage"` for a change made in another tab. Code that mirrors the preference elsewhere, such as to a user profile, should act on `"set"`, `"toggle"`, and `"clearPreference"` only, so that every open tab does not repeat the same write.

A subscriber that throws is logged and does not stop other subscribers from running. A subscriber that makes another change, such as calling `set()` or `setTokens()`, ends delivery of the change it received: the subscribers after it and the `themechange` event receive only the newer change, so none of them is left holding a superseded theme. Browsers also receive a `window` `CustomEvent` named by the exported `THEME_CHANGE_EVENT` constant (`"themechange"`) carrying the same detail, for code that has no access to the manager. Type it with the exported `ThemeChangeEvent`:

```ts
import { THEME_CHANGE_EVENT, type ThemeChangeEvent } from "@codenhub/theme";

window.addEventListener(THEME_CHANGE_EVENT, (event) => {
  console.log(`theme is now ${(event as ThemeChangeEvent).detail.name}`);
});
```

The event does not identify which manager sent it, so use `subscribe()` when a page runs more than one.
