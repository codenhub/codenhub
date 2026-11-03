---
title: Accessibility
description: Accessibility guarantees, ARIA live regions, focus management, reduced motion, and custom content boundaries in @codenhub/toaster.
order: 5
---

# Accessibility and security

`@codenhub/toaster` is designed to be accessible to assistive technologies by default and renders custom string content as plain text, never as HTML.

## Toast announcements and ARIA live regions

Screen readers hear toasts through two visually hidden live regions that each toaster instance adds to its container: one polite, one assertive. A toast's `role` decides which one speaks its text:

- **`"status"`**, the default for `toast()`, `toast.success()`, `toast.info()`, and `toast.loading()`: announced through the polite region, after any speech in progress.
- **`"alert"`**, the default for `toast.error()` and `toast.warning()`: announced through the assertive region, interrupting speech in progress.

You can override the role per call when needed:

```ts
import { toast } from "@codenhub/toaster";

toast.warning("Storage is almost full", {
  role: "status",
});
```

The announcement is the toast's title, description, or message, or the text of its custom content. When a toast has an `action`, its label follows, as in "Deleted. Undo", so a screen reader user knows there is something to act on. The dismiss button and buttons inside custom content are left out. A toast is announced again when an update changes its text or role, so a promise toast announces both its loading text and its outcome. The visible toast element is not itself a live region.

A live region inserted together with its text is often missed, because assistive technology only announces changes to a region it already tracks. Each region is therefore added empty, and its first text follows 100ms later, as in the [W3C ARIA22 technique](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22.html). Announced text is removed from the region after 7 seconds.

While a dialog from `@codenhub/toaster/dialog` is open, every toaster rendering into the same parent element announces through live regions inside that dialog, because the rest of the page is inert then. Toasts from a toaster with a different container are not announced while the dialog is open, and the library does not repeat them after it closes. The same holds under a modal dialog your application opens itself; see [Your own modal dialogs](concepts.md#your-own-modal-dialogs).

Each toast stack is a `region` landmark named "Notifications", so screen reader users can jump to it to reach a toast's buttons. Set `labels.notifications` to localize the name.

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

`toast.custom()` takes either a string or a DOM node, and each has its own trust boundary:

```
┌──────────────────────────────────────────────────────────┐
│                      toast.custom()                      │
├─────────────────────────────┬────────────────────────────┤
│         Text String         │      Trusted DOM Node      │
│  - Rendered as plain text   │  - Unmodified insertion    │
│  - Never parsed as HTML     │  - Full developer control  │
│  - Safe for untrusted text  │  - Developer owns security │
└─────────────────────────────┴────────────────────────────┘
```

### Text strings

A string passed to `toast.custom()`, or as `content` to a toast or an `update()`, is inserted as a text node. It is never parsed as HTML, so markup in it shows literally and creates no elements:

```ts
import { toast } from "@codenhub/toaster";

// Shows the characters `<b>Saved</b>`, not bold text.
toast.custom("<b>Saved</b>");
```

This makes strings safe for untrusted text such as user names or server messages. A string that is empty or only whitespace throws an error rather than rendering a blank notification.

### Trusted Types and Content Security Policy

The package never assigns to `innerHTML` or any other HTML-parsing sink: strings become text nodes, and built-in toasts, icons, and dialogs are built with DOM APIs. A Content Security Policy with `require-trusted-types-for 'script'` needs no Trusted Types policy for it.

### Trusted DOM nodes

If you need formatting, links, buttons with event listeners, custom SVG icons, or complex layouts, pass a DOM `Node` or a node factory function:

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

Application-supplied DOM nodes are inserted as they are. The caller is responsible for their content's safety, for example by building it with DOM APIs and `textContent` rather than parsing untrusted HTML, and for their accessible names, event listeners, and memory cleanup.
