---
title: Reference
description: Complete entrypoint and symbol reference for the current UI Kit exports.
---

# Public reference

Both `@codenhub/ui-kit` and `@codenhub/ui-kit/scripts` export every JavaScript
value and TypeScript type below. They are equivalent entrypoints. The only other
public path is the CSS file `@codenhub/ui-kit/styles`.

## Feedback

### `feedback`

Module singleton with:

- `register<T>(result, options?): Result<T>` returns the same
  `@codenhub/error` result and performs feedback side effects.
- `subscribe("success", listener): () => void` receives `{ entry, value }`.
- `subscribe("error", listener): () => void` receives `{ entry, error }`.

`RegisterFeedbackOptions` contains `success?: FeedbackMessage`,
`fallback?: string`, `toast?: boolean`, `log?: boolean`, and
`toastPosition?: ToastOptions["position"]`. `FeedbackMessage` contains `key` and
optional `fallback`. `FeedbackEntry` contains `type: "success" | "error"` and
`message: string | null`. `FeedbackEventMap` describes the two listener payloads.
See [feedback](./feedback.md) for resolution rules and defaults.

## Internationalization

### `I18n<TLocale>`

An `EventTarget` with:

- `new I18n(config)` starts at `config.defaultLocale` and is not ready.
- `locale` returns the current configured locale.
- `ready` reports whether the latest initialization completed.
- `init(options?): Promise<void>` loads and applies an initial locale.
- `setLocale(locale: string): Promise<boolean>` attempts a locale change.
- `translate(key: string): string | undefined` performs a flat-key lookup.

`I18nConfig<TLocale>` requires `defaultLocale`, readonly `locales`,
`getLocaleFile(locale)`, `getLocaleDirection(locale)`, and an `isLocale(value)`
type guard. `I18nInitOptions` has optional `storageKey` and `root: ParentNode`.
`LocaleDictionary` maps string keys to string values. `LocaleDirection` is
`"ltr" | "rtl"`.

`I18nReadyEventDetail` contains `locale` and `translationsAvailable`.
`I18nLocaleChangeEventDetail` contains `locale` and `previousLocale`.

### Active i18n instance

- `setI18nInstance(i18n: I18n | null): void` changes the module-level active
  instance used by feedback.
- `getI18nInstance(): I18n` returns it or throws
  `[I18n] No i18n instance has been configured.`

See [internationalization](./internationalization.md) for loading, DOM, event,
and failure behavior.

## Themes

`Theme` is `"light" | "dark"`.

- `THEME_CHANGE_EVENT` is the string `"themechange"`.
- `getSystemTheme(): Theme` reads the system color scheme with light fallback.
- `getStoredTheme(): Theme | null` reads a valid explicit preference.
- `getTheme(): Theme` returns the singleton's active theme.
- `setTheme(theme: Theme): void` applies and persists a theme.
- `clearThemePreference(): Theme` clears storage and applies the system theme.
- `toggleTheme(): Theme` applies and persists the other color scheme.
- `initTheme(): void` initializes singleton listeners and current state once.

See [themes](./themes.md) for DOM effects, persistence, events, and lifetime.

## Toasts

### `Toast`

`new Toast(options)` validates and snapshots `ToastOptions`. Methods are
`show()`, `hide()`, `onShow(subscriber)`, `onShown(subscriber)`,
`onHide(subscriber)`, and `onHidden(subscriber)`. Each subscription method
returns an unsubscribe function.

`ToastOptions` requires a non-blank message, non-blank string content, or any DOM
node content. Empty elements and empty `DocumentFragment` values are accepted.
Options are:

| Option          | Values and default                                            |
| --------------- | ------------------------------------------------------------- |
| `message`       | Plain text; ignored when `content` is present.                |
| `content`       | Trusted HTML string, DOM `Node`, or factory returning either. |
| `duration`      | Finite milliseconds at least zero; default `4000`.            |
| `autoDismiss`   | Boolean; default `true`.                                      |
| `isDismissable` | Boolean; default `false`.                                     |
| `icon`          | `ToastIcon`; default none and ignored with `content`.         |
| `position`      | Four corner positions; default `top-right`.                   |
| `role`          | `"alert" \| "status"`; default `status`.                      |
| `className`     | Classes appended to the root preset.                          |

`ToastIcon` is `"success" | "error" | "warning" | "info" | "loader"`.

### `SemanticToast`

Extends `Toast`. Its options add optional
`type: "success" | "error" | "warning" | "info"`, defaulting to success, and
omit caller-controlled `icon` and `role`. It presets semantic icon, role, and
classes.

### `LoadingToast`

Extends `Toast`. Its options omit caller-controlled `icon` and `role`. It
presets a loader icon, role `status`, and `autoDismiss: false` while retaining
other toast options.

Constructors throw when both content sources are absent, when the supplied
message or string content is blank, when resolved content is neither a string nor
a DOM node, or when duration is negative or non-finite. Empty node content does
not throw. See [toasts](./toasts.md) for trusted content, stacking, lifecycle,
browser support, and accessibility. See
[styles and icons](./styles-and-icons.md) for rendering requirements.

## CSS entrypoint

`@codenhub/ui-kit/styles` resolves to a compiled CSS file. It has no named CSS
exports and is a complete global style/reset system. Its rules and icon boundary
are documented in [styles and icons](./styles-and-icons.md).
