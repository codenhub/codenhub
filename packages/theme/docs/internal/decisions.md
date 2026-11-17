---
status: IMPLEMENTED
last_updated: 2026-11-16
scope: "@codenhub/theme: design decisions behind consumer-visible behavior, and the alternatives they rejected."
---

# Decisions

The public docs describe what the package does. This file records why, so that a later change can judge a decision instead of only obeying or overruling it.

## Missing `light` or `dark` themes are a runtime error, not a type error

Custom `themes` without `light` and `dark` need `defaultTheme` and `systemTheme` naming configured themes. The types do not make those two options required in that case; `createTheme()` throws instead, naming the missing theme.

A conditional parameter type would catch the mistake at compile time. It was rejected because it breaks generic wrappers that forward `ThemeOptions<N>` to `createTheme()`.

## An option set to `undefined` means "use the default"

Every option, token value, and `destroy()` option accepts `undefined` and treats it as omitted, so a wrapper can forward `storageKey: props.storageKey` without checking it.

Rejected: making `createTheme()` throw on an option set to `undefined`, because it fails at runtime on code the types accept, including under `exactOptionalPropertyTypes`.

## An empty token value counts as omitted

A theme or runtime token set to `""` falls back to the theme's static value, or to CSS, instead of being written. The browser removes a custom property set to `""` rather than applying it, so writing it would remove the property while `get().tokens` reports `""`. Treating it as omitted makes `get().tokens` agree with the page, and gives a cleared color-picker input the useful behavior of returning to the theme's color.

## `setTokens()` before the first change only records the overrides

Before any theme is applied, that is before `init()`, `set()`, `toggle()`, or `clearPreference()` first runs, or after `destroy()`, `setTokens()` records the overrides, leaves the DOM alone, and notifies no one. The next change applies them. It still resolves the active theme's classes first, so a custom `className` function runs, and can throw, even then.

Rejected: applying them right away. The only theme the manager knows before `init()` is `defaultTheme`, so applying it would replace the theme the pre-paint script applied and flash the wrong theme until `init()` runs, typically later in a component effect.

Resolving the stored or system theme at that point instead was rejected: it would be `init()` without its listeners, and its `"setTokens"` notification would announce a theme change that is really the initial one.
