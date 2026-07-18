---
title: Reference
---

# Theme API, Persistence, DOM, and SSR Behavior

## Create and Initialize

`createTheme<TSchema>(options?): Theme<TSchema>` validates configuration and
creates a manager. `ThemeOptions` contains:

- `themes`: definitions, defaulting to `LIGHT_THEME` and `DARK_THEME`.
- `defaultTheme`: pre-init and SSR fallback, default `"light"`.
- `systemTheme`: configured names for light/dark OS preference.
- `storageKey`: `localStorage` key, default `"app-theme-preference"`.
- `attribute`: document-root attribute, default `"data-theme"`.
- `isTailwindCss`: toggle the root `dark` class, default `false`.
- `shouldApplyClass`: add `theme-${name}` by default, disable classes, or return
  one custom class token with a `ThemeClassResolver`.
- `tokenSchema`: maps typed token names to CSS custom-property names.

`ThemeDefinition` has a unique `name`, `colorScheme` (`light` or `dark`), and
optional static tokens. `SystemThemeMap` maps OS light and dark preferences.

`init(tokens?)` is idempotent until `destroy()`. It registers media-query and
cross-tab storage listeners, selects valid stored preference before system
preference, applies the theme, and emits an `"init"` change.

## Theme Operations

- `get()` returns the active definition. Tokens merge computed CSS values,
  static theme values, then runtime overrides. Reading computed values can force
  style calculation.
- `set(name, tokens?)` applies and persists a configured theme; unknown names
  throw.
- `toggle(tokens?)` switches by active `colorScheme` between the names in
  `systemTheme`, then persists the choice.
- `clearPreference()` removes storage and applies the current system theme.
- `getStored()` returns a valid configured stored name or `null`.
- `getSystem()` returns the mapped system theme, or `defaultTheme` when media
  queries are unavailable.

Runtime token overrides persist across theme changes. Passing a new object,
including `{}`, replaces them. Tokens require a schema and unknown token keys
throw.

## DOM, Persistence, and Events

Applying a theme sets the configured root attribute and
`document.documentElement.style.colorScheme`, updates configured theme classes,
toggles Tailwind's `dark` class when enabled, and writes mapped token values as
CSS custom properties. The package supplies no CSS or token values beyond the
built-in light/dark definitions.

Explicit preferences use `localStorage`. `storage` events synchronize valid
changes from other tabs. OS preference changes apply only while no valid stored
preference exists. Storage read/write/remove failures are logged with
`console.error` and treated as unavailable.

`subscribe(ThemeChangeListener)` returns an unsubscribe function. Subscribers
receive `ThemeChangeDetail` with `name`, `theme`, and `ThemeChangeSource`:
`"init"`, `"set"`, `"toggle"`, `"clearPreference"`, or `"system"`. Subscriber
errors are logged and do not stop later listeners. Browsers also receive a
window `CustomEvent` named by `THEME_CHANGE_EVENT` (`"themechange"`).

## Validation and Cleanup

Creation throws for invalid attributes/storage keys, malformed or duplicate
themes, invalid color schemes/classes/token schemas, and missing default/system
theme names. Applying a custom class resolver can throw if it returns an empty
or whitespace-containing class. Runtime token calls throw without a matching
schema.

`destroy()` removes media-query and storage listeners, clears in-process
subscribers and runtime tokens, and resets internal active state. It does not
remove persisted preference or revert attributes, classes, custom properties,
or `colorScheme` already applied to the document.

## SSR and Pre-Paint Behavior

Without browser APIs, storage, DOM, events, and listeners are skipped;
`getSystem()` uses `defaultTheme`. Calls remain usable but cannot produce server
HTML attributes. To avoid a flash, applications must apply equivalent validated
storage/system logic in a blocking pre-paint script or render matching server
markup. Keep that logic aligned with custom names, mappings, storage key,
attribute, classes, and color scheme.

## Public Exports

The root exports `createTheme`, `THEME_CHANGE_EVENT`, `LIGHT_THEME`, and
`DARK_THEME`, plus `Theme`, `ThemeDefinition`, `SystemThemeMap`,
`ThemeClassResolver`, `ThemeChangeSource`, `ThemeChangeDetail`,
`ThemeChangeListener`, and `ThemeOptions` types.
