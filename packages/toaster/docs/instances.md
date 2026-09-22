---
title: Scoped Instances
description: Guide to creating isolated toaster instances, custom DOM containers, micro-frontends, SSR safety, and teardown.
order: 6
---

# Scoped instances and lifecycles

While the pre-configured `toast` and `dialog` singletons serve the majority of application feedback needs, `createToaster()` allows you to instantiate independent, scoped instances for micro-frontends, embedded widgets, or isolated testing environments.

## When to create an instance

Consider creating an independent instance when:

- You need notifications contained inside an embedded overlay, side drawer, or iframe rather than the document body.
- You are developing an isolated widget or micro-frontend that must not interfere with host notifications.
- Different sections of your application require different default positions, capacities, or themes.
- You are writing unit or browser tests that require a fresh, deterministic notification stack.

## Creating and configuring an instance

`createToaster(config?)` accepts an optional `ToasterConfig` object:

```ts
import { createToaster } from "@codenhub/toaster";

const panelToaster = createToaster({
  container: document.getElementById("slide-over-panel")!,
  position: "bottom-left",
  maxVisible: 3,
  duration: 6000,
  dismissible: true,
  className: "panel-notifications",
  labels: {
    dismiss: "Close alert",
  },
});

// Dispatch notifications directly on the instance:
panelToaster.success("Panel settings saved");

// Use the instance-scoped dialog controller:
if (await panelToaster.dialog.confirm("Reset panel layout?")) {
  resetPanel();
}
```

### Full configuration options

| Option        | Type                   | Default          | Description                                                                                                                               |
| ------------- | ---------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `container`   | `HTMLElement`          | `document.body`  | Target element holding the toast stack containers. Cannot be changed after construction.                                                  |
| `position`    | `ToastPosition`        | `"top-right"`    | Viewport anchor position (`"top-left"`, `"top-center"`, `"top-right"`, `"bottom-left"`, `"bottom-center"`, `"bottom-right"`, `"center"`). |
| `maxVisible`  | `number`               | `5`              | Maximum number of simultaneously visible toasts before FIFO eviction begins.                                                              |
| `duration`    | `number`               | `4000`           | Default display duration in milliseconds before auto-dismissal.                                                                           |
| `autoDismiss` | `boolean`              | `true`           | Whether toasts close automatically after `duration` expires.                                                                              |
| `dismissible` | `boolean`              | `false`          | Whether to render a close button on toasts (aliased as `closeButton`).                                                                    |
| `margin`      | `string \| { x?, y? }` | safe-area inset  | Spacing between the stack container and the viewport/container edge.                                                                      |
| `className`   | `string`               | `undefined`      | Custom CSS class appended to every toast and dialog in this instance.                                                                     |
| `labels`      | `ToastLabels`          | English defaults | Default text labels for dismiss buttons and dialog action buttons.                                                                        |
| `tokens`      | `ToastTokens`          | `undefined`      | Design token color overrides applied across this instance.                                                                                |
| `nonce`       | `string`               | `undefined`      | Content Security Policy nonce applied to the injected token `<style>` element.                                                            |

## Dynamic reconfiguration (`toaster.configure`)

You can modify an instance's settings at runtime using `toaster.configure()`:

```ts
// Update capacity and durations dynamically:
toaster.configure({
  maxVisible: 8,
  duration: 3000,
  margin: "32px",
});
```

Attempting to pass `container` to `configure()` throws an error: container elements are established during instantiation and cannot be migrated dynamically.

## Teardown and cleanup with `destroy()`

To avoid memory leaks and orphaned DOM elements when an embedded component or test unmounts, invoke `toaster.destroy()`:

```ts
import { createToaster } from "@codenhub/toaster";

function mountWidget(containerEl: HTMLElement) {
  const toaster = createToaster({ container: containerEl });

  return function unmountWidget() {
    // Release all DOM elements, timers, listeners, and styles:
    toaster.destroy();
  };
}
```

### What happens during `destroy()`

Calling `destroy()` is synchronous, deterministic, and idempotent:

1. **Immediate handle settlement**: All visible and queued toast handles settle immediately, transitioning to state `"hidden"` and resolving their `settled` promises without waiting for exit animations.
2. **Modal closure**: Any open modal dialog is closed immediately and detached from the top layer.
3. **DOM cleanup**: All stack containers and token `<style>` nodes owned by the instance are detached from the DOM.
4. **Listener teardown**: All internal event listeners, timers, and window observers are cleared.
5. **Guard activation**: Any subsequent call to the destroyed instance throws an error synchronously.

## Multi-instance isolation

Each `Toaster` instance is fully self-contained. Two instances configured with the same position will render two independent, overlapping container trees:

```ts
const toasterA = createToaster({ position: "top-right" });
const toasterB = createToaster({ position: "top-right" });

toasterA.success("From A");
toasterB.success("From B");
```

Because both instances maintain separate admission queues, they will render on top of each other. In a single application, prefer using a single shared instance (such as the default `toast` export) with per-call overrides, and reserve separate instances for truly separated containers.

## Server-Side Rendering (SSR)

`@codenhub/toaster` is designed to be SSR-safe:

- Calling `createToaster()` or importing `toast` on the server does not throw, provided tokens are not initialized against the DOM.
- Any operation requiring the browser DOM—such as dispatching toasts, opening dialogs, or applying color tokens—checks for `document` and throws an error if called in a server environment.

In frameworks like Next.js, Remix, SvelteKit, or Astro, ensure toast dispatches happen within client event handlers, lifecycle hooks (`useEffect`, `onMount`), or browser-only entrypoints:

```tsx
// React example
"use client";

import { toast } from "@codenhub/toaster";

export function SaveButton() {
  const handleClick = () => {
    toast.success("Saved successfully");
  };

  return <button onClick={handleClick}>Save</button>;
}
```
