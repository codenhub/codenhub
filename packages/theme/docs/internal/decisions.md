---
status: IMPLEMENTED
last_updated: 2026-10-26
scope: "@codenhub/theme: design decisions behind consumer-visible behavior, and the alternatives they rejected."
---

# Decisions

The public docs describe what the package does. This file records why, so that a later change can judge a decision instead of only obeying or overruling it. Each entry was moved here from the public docs when they were rewritten as a walkthrough; the behavior is unchanged.

## Missing `light` or `dark` themes are a runtime error, not a type error

Custom `themes` without `light` and `dark` need `defaultTheme` and `systemTheme` naming configured themes. The types do not make those two options required in that case; `createTheme()` throws instead, naming the missing theme.

A conditional parameter type would catch the mistake at compile time. It was rejected because it breaks generic wrappers that forward `ThemeOptions<N>` to `createTheme()`.

## An option set to `undefined` means "use the default"

Every option, token value, and `destroy()` option accepts `undefined` and treats it as omitted, so a wrapper can forward `storageKey: props.storageKey` without checking it.

Before 0.2.0, an option set to `undefined` made `createTheme()` throw. That was dropped because it failed at runtime on code the types accept, including under `exactOptionalPropertyTypes`.

## An empty token value counts as omitted

A theme or runtime token set to `""` falls back to the theme's static value, or to CSS, instead of being written. The browser removes a custom property set to `""` rather than applying it, so writing it removed the property while `get().tokens` reported `""`. Treating it as omitted makes `get().tokens` agree with the page, and gives a cleared color-picker input the useful behavior of returning to the theme's color.

## `setTokens()` before the first change only records the overrides

Before any theme is applied, that is before `init()`, `set()`, `toggle()`, or `clearPreference()` first runs, or after `destroy()`, `setTokens()` records the overrides, leaves the DOM alone, and notifies no one. The next change applies them.

Applying right away was the earlier behavior. The only theme the manager knows before `init()` is `defaultTheme`, so applying it replaced the theme the pre-paint script had applied and flashed the wrong theme until `init()` ran, typically later in a component effect.

Resolving the stored or system theme at that point instead was rejected: it would be `init()` without its listeners, and its `"setTokens"` notification would announce a theme change that is really the initial one.
