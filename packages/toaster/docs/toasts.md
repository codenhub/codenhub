---
title: Toasts
description: Guide to dispatching neutral, semantic, loading, structured, and promise-driven toast notifications.
order: 2
---

# Toast notifications

`@codenhub/toaster` provides a callable `toast` dispatcher supporting plain neutral notifications, semantic variants, structured layouts, inline action controls, persistent loaders, and automatic Promise lifecycle binding.

## Dispatching notifications

The pre-configured `toast` singleton is callable directly for neutral notifications and exposes shorthand methods for semantic variants:

```ts
import { toast } from "@codenhub/toaster";

// Neutral notification (no severity icon or tint)
toast("Draft saved automatically");

// Semantic shorthands with built-in icons and intent styling
toast.success("Project settings published");
toast.error("Unable to connect to database");
toast.warning("Storage usage reached 85%");
toast.info("Scheduled maintenance tonight at 02:00 UTC");
```

All methods accept either a message string and an optional options object, or a single options object:

```ts
toast.success("Profile updated", { duration: 5000 });

toast.success({
  message: "Profile updated",
  duration: 5000,
});
```

## Structured content and actions

Toasts can render an optional primary title, a secondary description, and an interactive action button without requiring manual DOM manipulation:

```ts
import { toast } from "@codenhub/toaster";

toast.success("Deployment successful", {
  title: "Production v2.4.0",
  description: "All 12 edge services are healthy and receiving traffic.",
  duration: 8000,
  action: {
    label: "View logs",
    onClick: (_event, handle) => {
      openDeploymentLogs();
      handle.dismiss();
    },
  },
});
```

### Action button behavior

The `action` property renders a native `<button>` element inside the toast. When clicked, its `onClick` callback receives the standard DOM `MouseEvent` and the active `ToastHandle`. The toast does not automatically close when the action is triggered; invoke `handle.dismiss()` if you want the action to dismiss the toast.

## Loading states and Promise binding

### Manual loading toasts

`toast.loading()` dispatches a persistent toast with an animated SVG spinner. Unlike standard toasts, loading toasts do not automatically dismiss by default:

```ts
import { toast } from "@codenhub/toaster";

const loading = toast.loading("Generating analytics export...");

try {
  await generateReport();
  loading.update({
    type: "success",
    title: "Report ready",
    message: "Analytics exported to CSV.",
    autoDismiss: true,
    duration: 5000,
  });
} catch (err) {
  loading.update({
    type: "error",
    title: "Export failed",
    message: err instanceof Error ? err.message : "Unknown error",
    autoDismiss: true,
    duration: 6000,
  });
}
```

### Automated Promise binding (`toast.promise`)

`toast.promise()` automates loading state transitions, re-arming auto-dismiss, and error handling for any Promise-like operation. It returns the original Promise's resolved value so you can integrate it seamlessly into application logic:

```ts
import { toast } from "@codenhub/toaster";

const user = await toast.promise(updateUserProfile(payload), {
  loading: "Saving profile changes...",
  success: (updatedUser) => `Profile saved for ${updatedUser.username}!`,
  error: (err) => `Failed to update profile: ${err.message}`,
});
```

The `success` and `error` handlers can return either a simple string or a structured `ToastOptions` object:

```ts
await toast.promise(syncRepository(), {
  loading: "Syncing changes with remote...",
  success: (result) => ({
    title: "Repository synchronized",
    description: `Fetched ${result.commits} new commits across ${result.branches} branches.`,
    action: {
      label: "View diff",
      onClick: (_event, handle) => {
        showDiffViewer();
        handle.dismiss();
      },
    },
  }),
  error: (err) => ({
    title: "Sync conflict",
    description: err.message,
    duration: 10000,
  }),
});
```

## Programmatic control with ToastHandle

Every toast dispatch returns a `ToastHandle` providing real-time lifecycle inspection, mutation, and event subscription:

```ts
import { toast } from "@codenhub/toaster";

const handle = toast("Uploading document (0%)...", {
  autoDismiss: false,
});

// Update content dynamically as progress occurs:
onUploadProgress((percentage) => {
  handle.update({
    message: `Uploading document (${percentage}%)...`,
  });
});

// Transform into a success toast once upload finishes:
onUploadComplete(() => {
  handle.update({
    type: "success",
    message: "Document uploaded successfully!",
    autoDismiss: true,
    duration: 4000,
  });
});

// Dismiss the toast programmatically at any time:
cancelButton.addEventListener("click", () => {
  handle.dismiss();
});
```

### Lifecycle subscribers

You can listen to specific transitions in the toast's lifecycle:

```ts
handle.onShow(() => console.log("Toast element inserted into the DOM"));
handle.onShown(() => console.log("Toast entrance animation completed"));
handle.onHide(() => console.log("Toast dismissal requested, exit animation starting"));
handle.onHidden(() => console.log("Toast removed from the DOM"));

// Or await complete settlement:
await handle.settled;
console.log("Toast is completely removed from the page");
```

## Stack positioning and margins

By default, toasts are rendered at `"top-right"`. You can configure a different position per call or globally:

```ts
toast("Centered alert", { position: "top-center" });
toast("Bottom notification", { position: "bottom-right" });
```

Supported positions are:

- `"top-left"`, `"top-center"`, `"top-right"`
- `"bottom-left"`, `"bottom-center"`, `"bottom-right"`
- `"center"`

### Margin and safe-area insets

Toasts automatically respect device safe-area insets (`env(safe-area-inset-*)`), preventing corner stacks from overlapping with mobile notches or home indicators. You can specify custom margins per call or per instance:

```ts
toast("Offset notification", {
  margin: "24px",
});

// Or independent horizontal and vertical margins:
toast("Offset notification", {
  margin: { x: "16px", y: "32px" },
});
```

## Admission control and queueing

Each toast position manages a vertical stack with a default capacity of `maxVisible: 5`. When additional toasts are dispatched beyond this capacity:

1. New toasts enter a first-in, first-out (FIFO) queue.
2. The oldest eligible toast in the visible stack begins its exit animation to make room for the new arrival.
3. If an active toast is **currently hovered**, **currently focused**, or in an **active loading state**, it is protected against eviction and will not be dismissed early.
4. When the available viewport height is smaller than the stack's total height, the stack scrolls internally without showing platform scrollbars, ensuring all toasts remain accessible.

## Clearing and dismissing toasts

To clear notifications across the instance:

```ts
import { toast } from "@codenhub/toaster";

// Dismiss all visible and queued toasts:
toast.clear();

// Dismiss an individual toast by handle:
toast.dismiss(handle);

// Dismiss all toasts (identical to clear()):
toast.dismiss();
```

## Custom content

When text formatting, custom icons, or complex controls are required, use `toast.custom()`:

```ts
import { toast } from "@codenhub/toaster";

// 1. Sanitized HTML string:
toast.custom('<p>Visit our <a href="/changelog">new release notes</a>!</p>');

// 2. Direct DOM node:
const container = document.createElement("div");
container.className = "flex items-center gap-2";
container.textContent = "Custom node layout";
toast.custom(container);

// 3. Node factory receiving the active handle:
toast.custom((handle) => {
  const button = document.createElement("button");
  button.textContent = "Close me";
  button.onclick = () => handle.dismiss();
  return button;
});
```

Read [Accessibility and security](accessibility.md) for full details on the string sanitization allowlist and Trusted Types boundaries.
