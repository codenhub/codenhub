---
title: Concepts
description: Core mental model, dual-layer architecture, lifecycle handles, and thenables in @codenhub/toaster.
order: 1
---

# Mental model and concepts

Understanding how `@codenhub/toaster` coordinates notifications and dialogs helps you structure user feedback, prevent memory leaks, and design reliable asynchronous workflows.

## The two presentation layers

Modern web applications need two fundamentally different kinds of feedback: peripheral notifications that inform without interrupting, and modal interruptions that require an explicit decision before work can continue. `@codenhub/toaster` implements both using dedicated browser mechanisms:

| Surface                 | Presentation Layer                                    | Typical Use Case                                                            | Dismissal Behavior                                                  |
| ----------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Floating Toasts**     | Light DOM stack containers (`[data-toast-container]`) | Background job completion, copy confirmation, system alerts, promise states | Auto-dismiss timer, close button, or programmatic dismissal         |
| **Interactive Dialogs** | Browser Top Layer (`<dialog>` + `showModal()`)        | Destructive confirmations, user prompts, mandatory alerts                   | Explicit action button click, Escape key, or programmatic dismissal |

Because modal dialogs use the platform's native `<dialog>` element and `showModal()`, the browser marks the rest of the document as `inert`. Floating toasts remain visible in the background, but interaction with them (such as clicking a toast's dismiss button) pauses automatically until the modal dialog closes. This behavior is built into the web platform and guarantees that users resolve active modals before attending to secondary notifications.

## Lifecycle states and handles

Every notification and dialog dispatched in `@codenhub/toaster` returns an active handle:

- **`ToastHandle`**: Returned by `toast()`, `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()`, `toast.loading()`, and `toast.custom()`.
- **`InteractiveToastHandle<T>`**: Returned by `dialog.confirm()`, `dialog.prompt()`, and `dialog.alert()`.

A toast notification transitions through four deterministic lifecycle states:

```
[queued] ──> [visible] ──> [hiding] ──> [hidden]
```

1. **`queued`**: The notification is admitted to the toaster queue but cannot render yet because the active stack has reached its configured `maxVisible` limit.
2. **`visible`**: The notification element is attached to the DOM and displayed in its position stack.
3. **`hiding`**: The notification has received a dismissal command and is executing its exit animation.
4. **`hidden`**: The exit animation is complete, DOM elements are detached, and the handle's `settled` promise resolves.

### The settled promise

Both handle types expose a `settled: Promise<void>` property. This promise resolves only when all exit transitions have completed and the underlying DOM elements have been completely removed from the page. Awaiting `handle.settled` gives you a deterministic point to clean up related page resources or trigger follow-up animations.

## Thenables and async operations

A major flaw in traditional toast and dialog libraries is the "truthy object" trap: an interactive method returns a handle object, and calling `if (await dialog.confirm(...))` evaluates to `true` even if the user clicks "Cancel" because an object reference is always truthy.

`@codenhub/toaster` resolves this by making `InteractiveToastHandle<T>` implement `PromiseLike<T>`:

```ts
import { dialog } from "@codenhub/toaster";

// 1. Direct await resolves to the primitive boolean value:
if (await dialog.confirm("Permanently delete this project?")) {
  await executeDeletion();
}

// 2. Retaining the handle gives you both the thenable result AND programmatic controls:
const handle = dialog.confirm("Are you sure?");
console.log("Current state:", handle.state);
const confirmed = await handle;
```

Similarly, `toast.promise` binds a toast notification directly to a Promise lifecycle:

```ts
import { toast } from "@codenhub/toaster";

const data = await toast.promise(fetchUserPayload(), {
  loading: "Loading user profile...",
  success: (res) => `Welcome back, ${res.name}!`,
  error: (err) => `Failed to load profile: ${err.message}`,
});
```

When the underlying promise is pending, the toast renders a persistent loading indicator with auto-dismiss disabled. As soon as the promise resolves or rejects, the toast transitions to a success or error state and automatically re-arms its auto-dismiss timer. The original promise value or rejection is returned directly to the caller.

## The styling model

`@codenhub/toaster` relies on runtime CSS custom property composition rather than compiled utility classes or heavy component runtime frameworks.

When `@codenhub/styles >=0.3.0` is installed on your page, toasts and dialogs live-compose their background, foreground, border, and elevation values directly from `--color-*` tokens and UI presentation axes (`--ui-fill`, `--ui-border`, `--ui-clip`, `--ui-elevation`). If your application changes theme tokens dynamically or applies active presentation classes (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`), already-rendered toasts adapt immediately.

When running standalone without `@codenhub/styles`, the required stylesheet (`@codenhub/toaster/styles`) uses pre-computed fallback colors generated from the same design token palette, ensuring consistent appearance with zero configuration.

## Next steps

- [Toast notifications](toasts.md): Comprehensive guide to dispatching, updating, and queueing toasts.
- [Interactive dialogs](dialogs.md): Deep dive into confirmations, prompts, alerts, and label localization.
- [Styling and theming](styling.md): Presentation axes, token customization, dark mode, and CSP configuration.
- [Accessibility and security](accessibility.md): ARIA announcements, focus restoration, and sanitization boundaries.
- [Scoped instances](instances.md): Multi-instance coordination, custom containers, and lifecycle teardown.
- [API reference](reference/index.md): Complete signature catalogue generated from TypeScript declarations.
