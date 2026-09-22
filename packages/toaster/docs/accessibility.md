---
title: Accessibility
description: Accessibility guarantees, ARIA live regions, focus management, reduced motion, and content sanitization in @codenhub/toaster.
order: 5
---

# Accessibility and security

`@codenhub/toaster` is designed to be accessible to assistive technologies by default and enforces strict security boundaries around custom markup.

## Toast announcements and ARIA live regions

Screen readers and assistive devices receive toast updates through ARIA live regions:

- **Informational and loading toasts** (`toast()`, `toast.success()`, `toast.info()`, `toast.loading()`): Default to `role="status"`. Assistive technology announces the update at the next grace period without interrupting ongoing speech.
- **Error and warning toasts** (`toast.error()`, `toast.warning()`): Default to `role="alert"`. Assistive technology immediately interrupts to communicate the urgent notification.

You can override the role per call when needed:

```ts
import { toast } from "@codenhub/toaster";

toast.info("Low-priority sync completed", {
  role: "status",
});
```

### The ARIA22 live-region technique

A common bug in client-rendered live regions is inserting an element with `role="status"` and its content at the exact same moment. Many screen readers miss the announcement because the region was not being monitored prior to the mutation.

`@codenhub/toaster` follows the [W3C ARIA22 technique](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22.html): it inserts the empty live region container into the DOM first, giving assistive technology time to attach its observer before the text content is populated.

### Accessible dismiss buttons

When a toast is dismissible (`dismissible: true`), its close button includes an accessible `aria-label="Dismiss toast"`. You can localize this label across an entire instance:

```ts
import { createToaster } from "@codenhub/toaster";

const toaster = createToaster({
  labels: {
    dismiss: "Fechar notificação",
  },
});
```

## Native dialog accessibility

Interactive modal dialogs leverage browser-level accessibility:

- **Top layer semantics**: Rendered with `<dialog>` and `showModal()`, automatically hiding background content from the accessibility tree via browser `inert`.
- **Focus trapping**: Tab navigation cycles strictly within the active dialog, preventing focus from escaping to hidden background elements.
- **Focus restoration**: When the dialog closes, focus returns automatically to the element that was focused immediately before the dialog was opened.
- **Dismissal controls**: Pressing <kbd>Escape</kbd> triggers cancellation automatically.

## Reduced motion (`prefers-reduced-motion`)

Users with vestibular disorders or motion sensitivities often enable reduced motion in their operating systems.

`@codenhub/toaster` listens to `matchMedia("(prefers-reduced-motion: reduce)")`. When active:

- Entrance and exit animations resolve with 0ms duration.
- FLIP layout transitions update element positions immediately without transitional sliding.
- Dialog backdrops appear and disappear without fade transitions.

## Custom content security boundaries

When presenting custom user interface content, choose the appropriate trust boundary:

```
┌──────────────────────────────────────────────────────────┐
│                      toast.custom()                      │
├─────────────────────────────┬────────────────────────────┤
│     Sanitized HTML String   │      Trusted DOM Node      │
│  - Allowlist filtered       │  - Unmodified insertion    │
│  - Strips scripts/styles    │  - Full developer control  │
│  - Guarded by Trusted Types │  - Developer owns security │
└─────────────────────────────┴────────────────────────────┘
```

### Sanitized HTML strings

Passing an HTML string to `toast.custom()` passes it through a strict DOM-based sanitizer:

```ts
import { toast } from "@codenhub/toaster";

toast.custom('Documentation updated. <a href="/docs">Read the guide</a>');
```

The sanitizer enforces the following security rules:

- **Allowed elements**: `a`, `b`, `br`, `code`, `div`, `em`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `i`, `li`, `ol`, `p`, `pre`, `span`, `strong`, `ul`.
- **Allowed attributes**: Only `href`, `target`, and `rel` are permitted on anchor elements. All other attributes (including `onclick`, `style`, and `id`) are stripped.
- **Protocol restrictions**: Anchor `href` attributes are restricted to `http:`, `https:`, `mailto:`, `tel:`, and relative paths. Dangerous protocols like `javascript:` or `data:` are stripped.
- **External link protection**: Anchors with `target="_blank"` automatically receive `rel="noopener noreferrer"`.
- **Active script stripping**: `<script>`, `<style>`, `<iframe>`, `<object>`, and `<embed>` elements are completely removed alongside their contents.
- **Empty content guard**: If a string sanitizes down to zero renderable text or tags (e.g. `<script>alert(1)</script>`), `toast.custom()` throws an error rather than rendering a blank notification.

### Trusted Types and Content Security Policy

HTML strings are parsed via `Element.innerHTML`. If your site enforces a Content Security Policy with:

```http
Content-Security-Policy: require-trusted-types-for 'script';
```

You must provide a default Trusted Types policy in your application, or pass trusted DOM nodes instead of strings. Built-in semantic toasts and dialogs do not use `innerHTML` and are unaffected by Trusted Types policies.

### Trusted DOM nodes

If you need buttons with event listeners, custom SVG icons, or complex layouts, pass a DOM `Node` or a node factory function:

```ts
import { toast } from "@codenhub/toaster";

toast.custom((handle) => {
  const container = document.createElement("div");
  container.className = "custom-toast-layout";

  const text = document.createElement("span");
  text.textContent = "Review pending requests";

  const button = document.createElement("button");
  button.textContent = "Review";
  button.onclick = () => {
    openReviewModal();
    handle.dismiss();
  };

  container.append(text, button);
  return container;
});
```

Application-supplied DOM nodes bypass string sanitization. The caller is responsible for ensuring the node's accessible names, event listeners, and memory cleanup.
