---
title: Tokens, Persistence, and Cross-Tab Sync
---

# Tokens, Persistence, and Cross-Tab Sync

## Token resolution

`tokenSchema` maps typed token names to the CSS custom property each one writes, such as `{ primary: "--color-primary" }`. Once configured, `get()` returns the active `ThemeDefinition` with every schema key resolved from three sources, in this priority order (last wins):

1. **Computed style** — for a token not defined in JS, the value is read from `window.getComputedStyle(document.documentElement)` in browser environments.
2. **Theme static tokens** — values set on the active theme's own `ThemeDefinition.tokens`.
3. **Runtime overrides** — values passed to `init()`, `set()`, or `toggle()`.

```ts
const theme = createTheme({
  themes: [{ name: "brand", colorScheme: "light", tokens: { accent: "#ff6600" } }],
  tokenSchema: { accent: "--color-accent" },
}).init();

theme.set("brand", { accent: "#00c853" }); // runtime override wins over the static "#ff6600"
theme.get().tokens?.accent; // "#00c853"
```

Reading computed values can force a synchronous layout reflow. Pass `{ skipComputed: true }` to `get()` to skip that source and avoid the reflow when only the JS-known values are needed.

Runtime overrides persist across subsequent theme changes until explicitly replaced — pass a new object, including `{}`, to `init()`, `set()`, or `toggle()` to clear or replace them. Passing a token key that is not in `tokenSchema` throws.

## Persistence

An explicit preference set through `set()` or `toggle()` is written to `localStorage` under `storageKey` (default `"app-theme-preference"`). `getStored()` returns that value when it names a currently configured theme, or `null` when it is unset, invalid, or storage is unavailable (for example during SSR). `clearPreference()` removes the stored value and re-applies whichever theme `getSystem()` currently resolves to.

Storage reads, writes, and removals that throw — a full quota, a disabled storage API, a private-browsing restriction — are logged with `console.error` and treated the same as unavailable storage; they never throw out of `Theme` methods.

## Cross-tab sync

Every tab running `createTheme().init()` against the same `storageKey` stays in sync: a `storage` event fires in every other tab when one tab writes a new preference, and each one applies the change if it names a valid configured theme. A tab with its own runtime token overrides keeps them — only the active theme name changes from cross-tab sync, not tokens passed in-process.

The OS `prefers-color-scheme` media query applies automatically only while no valid stored preference exists. Once a tab (or a previous session) has stored an explicit preference, later system-preference changes are ignored until `clearPreference()` runs.

## Reacting to changes

`subscribe(listener)` registers a callback invoked after every applied change — from `init()`, `set()`, `toggle()`, `clearPreference()`, or an accepted `system` or cross-tab update — and returns an unsubscribe function:

```ts
const unsubscribe = theme.subscribe(({ name, source }) => {
  console.log(`theme is now "${name}" (${source})`);
});
```

A subscriber that throws is logged and does not stop other subscribers from running. Browsers also receive a `window` `CustomEvent` named by the exported `THEME_CHANGE_EVENT` constant (`"themechange"`) carrying the same detail, for code that prefers DOM events over `subscribe()`.
