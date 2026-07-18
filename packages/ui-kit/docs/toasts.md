---
title: Toasts
description: Render base, semantic, and loading toasts with lifecycle and content safety guidance.
---

# Toasts

Use `Toast` for a neutral notification, `SemanticToast` for status intent, and
`LoadingToast` for indefinite progress.

```ts
import { SemanticToast } from "@codenhub/ui-kit";

const toast = new SemanticToast({
  type: "success",
  message: "Saved successfully.",
  isDismissable: true,
  position: "top-right",
});

toast.show();
```

## Options and defaults

Every toast requires a non-blank `message`, non-blank string `content`, or any
DOM `Node` content. Empty elements and empty `DocumentFragment` values are valid
node content. Base defaults are a 4000 ms duration, automatic dismissal, no
dismiss button, `top-right`, and role `status`. Positions are `top-left`,
`top-right`, `bottom-right`, and `bottom-left`. `duration` must be finite and at
least zero.

`className` appends classes to the preset root and is the only public styling
hook. Caller mutations to the original options object do not alter normalized
toast behavior.

`SemanticToast` defaults to `success`. Types `success` and `info` use role
`status` with polite announcements; `warning` and `error` use role `alert` with
assertive announcements. Its type controls icon, role, and intent classes, so
callers cannot override `icon` or `role` through the typed constructor.

`LoadingToast` uses role `status`, a loader marker, and does not auto-dismiss by
default. Call `hide()` when the operation completes. Its typed constructor also
omits `icon` and `role`.

## Plain messages and custom content

`message` is assigned through `textContent` and is safe for untrusted text.
`content` takes precedence and owns the full inner markup, suppressing the
message and leading icon. A DOM node is moved, not cloned, so its state and
listeners remain intact. A `DocumentFragment` contributes its current child
nodes. Use a factory to create fresh nodes for multiple toast instances.

```ts
const toast = new Toast({
  content: () => {
    const button = document.createElement("button");
    button.textContent = "Undo";
    button.addEventListener("click", undo);
    return button;
  },
});
```

String `content` is parsed with `innerHTML` during construction. It is an
explicit trusted-HTML boundary: never pass user input or unsanitized external
content. Content factories also run during construction and throw immediately
if they return blank string content or a value other than a string or DOM node.
Any returned node is accepted even when it has no text or child nodes.

## Lifecycle and stacking

Subscribe on the toast instance:

```ts
const unsubscribe = toast.onHidden(() => {
  console.log("Toast removed");
});

toast.show();

// If this owner no longer needs notifications:
unsubscribe();
```

Events occur as `show`, `shown`, `hide`, and `hidden`. `show` runs before DOM
insertion, `shown` after entry animation, `hide` before removal, and `hidden`
after cleanup. The auto-dismiss timer starts after `shown`. Lifecycle callbacks
are ordinary callbacks: exceptions are not isolated and may interrupt the
current operation. Lifecycle events are not dispatched on toast DOM elements.

Calling `show()` while visible or hiding is a no-op. Calling `hide()` when idle
or already hiding is a no-op. A toast can be shown again after it is fully
hidden. Each position displays at most five toasts. Showing another asks the
oldest toast to hide and queues the new toast until that slot is released;
hiding the queued toast cancels it.

Containers are appended to `document.body` or the document root and remain even
when empty. The package does not expose bulk dismissal or container cleanup.
Retain instances when manual dismissal is required.

## Browser and accessibility requirements

`show()` requires a DOM and `window` timers. Message-only construction does not
touch the DOM, but custom string or node validation uses browser DOM classes.
The Web Animations API is optional; show/hide falls back to immediate completion
when animation support is missing or throws.

Toast roots set `aria-live` and `aria-atomic`. Dismiss buttons have the accessible
name `Dismiss toast`. Consumers remain responsible for choosing appropriate
urgency, avoiding excessive announcements, and ensuring custom content is
keyboard accessible. See [styles and icons](./styles-and-icons.md) for required
CSS and icon handling.
