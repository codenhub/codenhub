---
title: Overview
description: Entry points, setup, and operational boundaries for the UI Kit.
---

# Build browser interfaces with UI Kit

Use `@codenhub/ui-kit` to add feedback, internationalization, light and dark
themes, toasts, and the shared Codenhub style system to a browser application.

## Setup

### Installation

Version `0.1.0` is currently available from this repository workspace, not npm.
The npm `latest` tag resolves to incompatible version `0.0.1`. From the workspace
root, add the current package to a workspace consumer:

```sh
pnpm --filter=<consumer-package> add @codenhub/ui-kit@workspace:*
```

External consumers should not run an unversioned
`pnpm add @codenhub/ui-kit` until `0.1.0` is published. After publication, use
the explicit version `pnpm add @codenhub/ui-kit@0.1.0`.

### Quick start

Import the global styles once near the application entrypoint, initialize the
theme, and display UI feedback where the application needs it:

```ts
import "@codenhub/ui-kit/styles";
import { SemanticToast, initTheme } from "@codenhub/ui-kit";

initTheme();

new SemanticToast({
  type: "success",
  message: "Saved successfully.",
}).show();
```

The stylesheet has page-wide effects. Review [styles and icons](./styles-and-icons.md)
before adding it to an existing design system.

### Configuration

There is no package-wide configuration object. Configure internationalization
with an `I18nConfig`, install its active instance for feedback translation, and
use the fixed light/dark theme helpers independently. Toasts are configured per
instance.

Choose the entrypoint that matches the integration:

| Import path                | Purpose                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `@codenhub/ui-kit`         | All public JavaScript values and TypeScript types.                                            |
| `@codenhub/ui-kit/scripts` | Exactly the same JavaScript and type surface as the root.                                     |
| `@codenhub/ui-kit/styles`  | Full compiled global styles, including tokens, components, utilities, typography, and resets. |

## Requirements

- The package targets browser applications. Toast display requires a document
  and window timers; the Web Animations API is optional.
- Internationalization initialization requires Fetch, AbortController, timers,
  `structuredClone`, `EventTarget`, and `CustomEvent`. Local storage is optional;
  locale persistence is unavailable when storage cannot be used.
- `@codenhub/ui-kit/styles` is a full global style and reset system, not
  toast-only CSS.
- Built-in toast graphics are `ic-*` markers. A compatible build-time icon
  processor must replace them with SVG or the controls remain functional but
  iconless.

### Runtime boundaries

Importing a JavaScript entrypoint does not itself render DOM. Theme operations
tolerate missing browser globals and use light as the server fallback. Theme
preferences are not persisted when local storage is unavailable. I18n skips DOM
translation when `document` is absent and continues without locale persistence
when local storage is unavailable, but initialization still needs the other host
APIs listed above. Toast display and feedback that displays a toast require a
document; custom string toast content also requires a document during
construction.

No framework adapter or automatic component teardown is provided. Consumers
must unsubscribe callbacks and DOM event listeners they register, retain toast
instances they need to hide, and explicitly clear the active i18n singleton when
its owner is removed. The theme manager is a module singleton without an exposed
destroy method after initialization.

## Next steps

- [Feedback](./feedback.md) connects `Result` values to translated messages,
  logging, toast display, and subscriptions.
- [Internationalization](./internationalization.md) loads locale dictionaries,
  persists locale selection, and translates leaf DOM elements.
- [Themes](./themes.md) manages the built-in light and dark themes.
- [Toasts](./toasts.md) covers rendering, accessibility roles, lifecycle, custom
  content, and queue limits.
- [Styles and icons](./styles-and-icons.md) explains the global CSS and required
  icon-marker processing.
- [Reference](./reference.md) lists every current public export and default.
- [Migration from 0.0.1](./migrating-from-0.0.1.md) covers the breaking changes
  from the only version previously published to npm.
