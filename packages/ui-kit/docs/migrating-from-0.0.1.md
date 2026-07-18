---
title: Migrating from 0.0.1
description: Breaking migration steps from the UI Kit version previously published to npm.
---

# Migrating from published 0.0.1

Version `0.1.0` documents the current repository source and removes accidental
aggregation that existed in the npm-published `0.0.1`. Treat the upgrade as
breaking even though the three package export paths are unchanged.

## 1. Move store imports

Published `0.0.1` re-exported `createStore`, `Store`, and `StoreOptions` from the
package root. They are no longer UI Kit exports. Install and import the dedicated
package:

```sh
pnpm add @codenhub/store
```

```ts
import { createStore } from "@codenhub/store";

const preferences = createStore({
  storageKey: "preferences",
  initialState: { compact: false },
});
```

The old re-export accepted positional `storageKey` and `initialState`
parameters. The current `@codenhub/store` API accepts one options object and has
additional drivers and failure behavior. Migrate calls rather than changing only
the import path.

## 2. Move keyboard imports

Published `0.0.1` exposed `KEYS`, `Keyboard`, `keyboard`, and related keyboard
types from both the root and `/scripts`. They are no longer UI Kit exports. The
replacement `@codenhub/kbd` package is currently available only from this
repository workspace and has not been published to npm. From the workspace root,
add it to a workspace consumer:

```sh
pnpm --filter=<consumer-package> add @codenhub/kbd@workspace:*
```

```ts
import { KEYS, keyboard } from "@codenhub/kbd";

const registration = keyboard.register(KEYS.escape, closeDialog);
registration.unregister();
```

Review the dedicated package's current matching, input-ignore, error handling,
and lifecycle contract rather than assuming the `0.0.1` implementation is
identical. External consumers cannot install this replacement from npm yet.

## 3. Update error imports and registrations

Feedback now consumes `Result` and `AppError` from `@codenhub/error` rather than
the old `@codenhub/helpers` aggregation. Install the dedicated package when your
application constructs results directly and update those imports. Existing
feedback calls should then be checked against the current message resolution,
logging, toast defaults, and listener lifetime in [feedback](./feedback.md).

## 4. Migrate persisted themes and listeners

Published `0.0.1` stored the `app-theme-preference` value as a JSON object such
as `{"theme":"dark"}`. Version `0.1.0` reads and writes the raw string `"light"`
or `"dark"`. Convert a valid old value, or remove an invalid value, before the
first `initTheme()` call:

```ts
const themeStorageKey = "app-theme-preference";
const storedTheme = localStorage.getItem(themeStorageKey);

if (storedTheme !== null && storedTheme !== "light" && storedTheme !== "dark") {
  try {
    const oldPreference: unknown = JSON.parse(storedTheme);
    const oldTheme =
      typeof oldPreference === "object" && oldPreference !== null
        ? (oldPreference as { theme?: unknown }).theme
        : undefined;

    if (oldTheme === "light" || oldTheme === "dark") {
      localStorage.setItem(themeStorageKey, oldTheme);
    } else {
      localStorage.removeItem(themeStorageKey);
    }
  } catch {
    localStorage.removeItem(themeStorageKey);
  }
}

initTheme();
```

The `themechange` event detail also changed. A `0.0.1` listener read the active
string from `event.detail.theme`. In `0.1.0`, `detail.theme` is a
`ThemeDefinition`; read the active string from `event.detail.name`. The complete
current payload is `{ name, theme: ThemeDefinition, source }`, as described in
[themes](./themes.md).

## 5. Audit styles and icons

Keep the style import path, but treat its output as changed:

```ts
import "@codenhub/ui-kit/styles";
```

The current file is the complete global `@codenhub/styles` system with resets,
not isolated toast CSS. Audit page-level styles and reset interactions. Toast
icons also require compatible `ic-*` marker processing; without it, toast
content remains functional but iconless. See
[styles and icons](./styles-and-icons.md).

## 6. Verify browser ownership

The remaining root and `/scripts` APIs are equivalent and cover feedback, i18n,
themes, and toasts. Review their current contracts rather than relying on the
old generated declarations:

- Unsubscribe feedback and instance lifecycle listeners.
- Clear the active i18n instance when its owner is removed.
- Account for the theme singleton's module-long listeners and lack of destroy.
- Do not pass untrusted strings to toast `content`; use `message` for plain text.
- Initialize browser-dependent behavior only where required web APIs exist.

The [public reference](./reference.md) is the complete `0.1.0` export inventory.
