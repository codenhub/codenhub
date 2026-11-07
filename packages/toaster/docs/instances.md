---
title: Toaster instances
description: Every toaster option and its default, per-kind defaults, changing settings later, scoped toasters, cleanup with destroy(), and server-side rendering.
order: 3
---

# Toaster instances

So far everything went through `toast`, the ready-made toaster. This page is about making your own with `createToaster()`, and about the options both kinds share: where toasts appear, how long they stay, how many fit, and what their built-in labels say. It also covers cleaning up, which matters the moment a toaster lives inside something that can disappear, and server-side rendering.

## When you need your own

Most apps never need more than `toast`, configured once. Create a separate toaster when:

- Toasts belong inside a specific element, such as a side panel, an embedded widget, or [your own modal dialog](dialogs.md#your-own-modal-dialogs), rather than over the whole page.
- You're building a widget that gets embedded in pages you don't control, and its toasts shouldn't mix with the host page's.
- You want a fresh toaster per test, so one test's leftover toasts can't fail the next.

A container decides where the stacks live in the page, not where they're drawn. Stacks are `position: fixed`, so they still sit at the edges of the viewport, unless the container is a containing block for fixed elements, as one with `transform` or `contain: layout` is. Inside a dialog that's exactly what you want; for a side panel, add `contain: layout` to the panel so the corners are the panel's.

For different settings in different parts of one page, per-call options on `toast` are usually enough. More toasters mean more stacks, and [two toasters in the same corner](#instances-are-independent) end up on top of each other.

## Configuration

`createToaster()` takes an optional configuration object. Every field is optional:

```ts
import { createToaster } from "@codenhub/toaster";

const sidebarToaster = createToaster({
  container: document.querySelector<HTMLElement>("#sidebar")!,
  position: "bottom-left",
  maxVisible: 3,
  duration: 6000,
  dismissible: true,
  labels: { dismiss: "Close notification" },
});

sidebarToaster.success("Folder created");
```

| Option        | Default                         | What it does                                                                                                                                         |
| ------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container`   | `document.body`                 | The element the toast stacks are added to. Can't be changed later.                                                                                   |
| `position`    | `"top-right"`                   | Where toasts appear when a call doesn't say. One of the six [positions](toasts.md#positions-and-margins).                                            |
| `maxVisible`  | `5`                             | How many toasts each position shows at once before the rest [queue](toasts.md#how-the-stack-fills-up). A whole number of 1 or more.                  |
| `duration`    | `4000`                          | Milliseconds before a toast closes itself. 0 or more.                                                                                                |
| `autoDismiss` | `true`                          | Whether toasts close themselves after `duration`.                                                                                                    |
| `dismissible` | `false`                         | Whether toasts get a close button.                                                                                                                   |
| `margin`      | 1rem, or the device's safe area | Distance from the edge, as a CSS length or `{ x, y }`. See [margins](toasts.md#positions-and-margins).                                               |
| `className`   | None                            | Extra CSS classes on every toast from this toaster.                                                                                                  |
| `labels`      | English                         | `dismiss`, the close button's accessible name (`"Dismiss toast"`), and `notifications`, the name screen readers give each stack (`"Notifications"`). |
| `semantic`    | None                            | Defaults for `success`, `error`, `warning`, `info`, and `promise` results. See [Per-kind defaults](#per-kind-defaults).                              |
| `loading`     | None                            | Defaults for `loading` toasts and the loading part of `promise`.                                                                                     |
| `custom`      | None                            | Defaults for `custom` toasts.                                                                                                                        |

The `toast` you import is a toaster created with no options, so these defaults are exactly how it behaves until you `configure()` it.

`createToaster()` copies the configuration. Changing the object you passed in afterwards does nothing; use `configure()` for that.

Bad values throw right away, when the toaster is created:

- `Toaster duration must be a finite number greater than or equal to 0.`
- `Toaster maxVisible must be a positive integer.` A `maxVisible` of 0, 2.5, or -1 all throw.
- `Toaster nested duration must be a finite number greater than or equal to 0.` The same rule for `semantic.duration` and `custom.duration`.
- `Invalid toast position: …` For `position` or any per-kind `position`.

## Per-kind defaults

Sometimes one kind of toast needs different defaults. Errors, for example, often deserve more reading time and a close button, because nobody reads an error message in under 4 seconds, least of all the one about losing their work:

```ts
import { createToaster } from "@codenhub/toaster";

const notesToaster = createToaster({
  duration: 4000,
  semantic: { duration: 8000, dismissible: true },
  loading: { position: "bottom-right" },
  custom: { autoDismiss: false },
});
```

| Group      | Applies to                                                         | Fields                                                                   |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `semantic` | `success`, `error`, `warning`, `info`, and the result of `promise` | `position` (not for `promise`), `duration`, `dismissible`, `autoDismiss` |
| `loading`  | `loading` and the loading part of `promise`                        | `position`, `dismissible`                                                |
| `custom`   | `custom`                                                           | `position`, `duration`, `dismissible`, `autoDismiss`                     |

A plain `toast()` call uses only the instance-wide settings. For every other kind, each setting is looked up in this order, and the first one that's set wins:

1. The option passed to the call itself.
2. The matching per-kind group.
3. The instance-wide setting.
4. The built-in default.

With the configuration above, `notesToaster.error("Sync failed")` stays for 8 seconds with a close button, `notesToaster("Saved")` stays for 4, and `notesToaster.error("Sync failed", { duration: 2000 })` stays for 2. An option set to `undefined` in a call counts as not set, so it doesn't erase the per-kind default.

The result of `promise` bends these rules in two places, because it's the loading toast updated in place rather than a new toast:

- **Position** never changes, so it's wherever the loading toast went: the `loading` options object, then the call's `position`, then the `loading` group, then the instance. `semantic.position` never applies.
- **`autoDismiss`** comes from the result's own options, then `semantic.autoDismiss`, then `true`. The instance-wide `autoDismiss` is skipped, so `createToaster({ autoDismiss: false })` alone doesn't keep promise results open; set `semantic: { autoDismiss: false }` for that.

## Changing settings later

`configure()` changes any option except `container`. Pass only what changes:

```ts
import { toast } from "@codenhub/toaster";

toast.configure({
  position: "bottom-center",
  labels: { dismiss: "Fechar", notifications: "Notificações" },
});
```

Most changes apply to toasts shown afterwards. Three apply right away to toasts already on screen:

- **`maxVisible`**: lowering it closes the oldest toasts beyond the new limit straight away, except [protected ones](toasts.md#how-the-stack-fills-up), which leave when they're released.
- **`margin`**: existing stacks move.
- **`labels.notifications`**: existing stacks are renamed.

`configure()` validates like `createToaster()` does and throws the same errors. Passing `container` throws `Toaster container cannot be changed after construction.` To move toasts somewhere else, create a new toaster there and destroy the old one.

## Cleaning up with `destroy()`

A toaster adds elements, timers, and event listeners to the page. When the thing it belongs to goes away, such as a sidebar closing or a widget unmounting, call `destroy()`:

```ts
import { createToaster } from "@codenhub/toaster";

function mountSidebar(sidebar: HTMLElement) {
  const sidebarToaster = createToaster({ container: sidebar });

  // … use sidebarToaster while the sidebar is open …

  return function unmountSidebar() {
    sidebarToaster.destroy();
  };
}
```

`destroy()` works immediately, with no animations:

1. Every toast, visible or queued, closes at once. Their state becomes `"hidden"` and their `settled` promises resolve.
2. The toaster's stacks and screen reader regions are removed from the page.
3. Its timers and listeners are removed.
4. Every later call on it, except another `destroy()`, throws `This toaster instance has been destroyed. Create a new one with createToaster().`

Calling `destroy()` again does nothing, so it's safe in cleanup code that might run twice. Destroying a toaster doesn't affect any dialogs instance, and destroying a dialogs instance doesn't affect toasters.

You can destroy the ready-made `toast` too, but there's no way to get it back afterwards. Leave it alone unless the whole app is shutting down.

## Instances are independent

Two toasters never coordinate. Each one has its own stacks, its own queue, and its own `maxVisible`, even at the same position:

```ts
const first = createToaster({ position: "top-right" });
const second = createToaster({ position: "top-right" });

first.success("From the first toaster");
second.success("From the second toaster"); // drawn on top of the first one
```

Both stacks sit in the same corner and overlap. Give separate toasters separate positions or containers, or use one toaster with per-call options.

## Server-side rendering

Toaster can be imported anywhere. Creating a toaster, including the ready-made `toast`, doesn't touch the page, so it's safe while rendering on the server. Showing something needs a page, so a toast or dialog call made where there's no `document` throws:

- `DOM document is not available. Toaster operations require a browser environment.`
- `DOM document is not available. Dialogs require a browser environment.`

In Next.js, Remix, SvelteKit, Astro, and similar frameworks, show toasts from code that only runs in the browser: event handlers, effects (`useEffect`, `onMount`), or client-only modules:

```tsx
"use client";

import { toast } from "@codenhub/toaster";

export function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  async function save() {
    try {
      await toast.promise(onSave(), { loading: "Saving…", success: "Saved", error: "Save failed" });
    } catch {
      // The error toast already broke the news.
    }
  }

  return <button onClick={save}>Save</button>;
}
```

## Next

The notes app has all the toasts and dialogs it needs. Time to make them look like they belong: [Styling](styling.md) covers colors, presentation, size, dark mode, and Content Security Policy.
