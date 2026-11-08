---
title: Accessibility and security
description: What screen readers hear, how focus and the keyboard work, reduced motion, what is left to you, and the trust boundary of custom content.
order: 5
---

# Accessibility and security

A toast that only some people can perceive is a toast that only some people get. This page covers what the package does for screen reader and keyboard users without being asked, the few things it leaves to you, and the security line between text and DOM nodes in custom content.

## What screen readers hear

Every toast is announced. Each toaster adds two hidden "live regions" to its container: elements whose changing text screen readers read out automatically. One is polite, the other assertive. A toast's `role` picks which one reads it:

- **`"status"`** is polite: read after whatever the screen reader is currently saying. It's the default for `toast()`, `success()`, `info()`, `loading()`, and `custom()`.
- **`"alert"`** is assertive: read right away, interrupting. It's the default for `error()` and `warning()`.

Change it per toast when the default doesn't fit:

```ts
import { toast } from "@codenhub/toaster";

// A routine warning that doesn't need to interrupt anyone.
toast.warning("Note is getting long", { role: "status" });
```

Any other `role` value throws `Invalid toast role: …`.

What gets read:

- The toast's title, message, and description, or the text inside custom content.
- The action button's label, after the text, as in "Moved to trash. Undo", so the listener knows there's something to act on.
- Not the close button, and not buttons inside custom content.

A toast is announced again whenever an update changes its text or role. That's how a promise toast announces both "Saving…" and "Saved".

Two timing details explain behavior you might notice while testing:

- **The first announcement is slightly delayed.** Screen readers often miss a live region that appears with its text already in it, because they only announce changes to regions they're already watching. So each region is added empty, and its first text arrives 100ms later, following the [W3C ARIA22 technique](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22.html).
- **Announced text is cleared after 7 seconds**, so the hidden regions don't pile up old messages.

The visible toast itself isn't a live region and has no `role` attribute. Tests that find toasts by `role="status"` or `aria-live` need another selector. Find them the way a screen reader user does, through the stack's landmark, described next:

```ts
// Playwright; Testing Library's getByRole works the same way.
const notifications = page.getByRole("region", { name: "Notifications" });
await expect(notifications.getByText("Note saved")).toBeVisible();
```

### Finding the toasts

Each stack is a landmark region named "Notifications". Screen reader users can jump to it from their landmarks list to reach a toast's buttons. A stack with no toasts leaves the list, so nobody lands in an empty region. Translate the name with the toaster's `labels`:

```ts
import { createToaster } from "@codenhub/toaster";

const toaster = createToaster({
  labels: {
    notifications: "Notificações",
    dismiss: "Fechar notificação",
  },
});
```

`dismiss` is the accessible name of the close button on [dismissible](toasts.md#timers-and-auto-dismiss) toasts. It defaults to "Dismiss toast".

### Toasts under a dialog

While a dialog from this package is open, toasts from toasters sharing its container are announced from inside the dialog. Toasts from other toasters, and toasts shown under a modal dialog your app opened itself, aren't announced at all, and aren't announced later either. [Toasts while a dialog is open](dialogs.md#toasts-while-a-dialog-is-open) explains why and how to avoid it.

## Keyboard and focus

Toasts never steal focus. Showing one doesn't move the keyboard anywhere, which is what you want for something that's supposed to stay out of the way.

When someone does move focus into a toast, such as by tabbing to its action button:

- Its timer pauses, and it's [protected from being pushed out](toasts.md#how-the-stack-fills-up) of a full stack.
- If an update changes only its text, focus stays on the button. If the update replaces the action, focus moves to the new button.
- When it closes, focus goes back to whatever had focus when the toast appeared, as long as that element is still on the page. If focus has already moved somewhere else in the meantime, it stays there.

Dialogs use the browser's native `<dialog>` element with `showModal()`, so the browser itself handles:

- **Hiding the rest of the page.** Everything behind the dialog is inert: no clicks, no focus, and screen readers skip it.
- **Keeping focus inside.** <kbd>Tab</kbd> cycles through the dialog's own controls.
- **<kbd>Escape</kbd>**, which cancels.
- **Returning focus.** When the last dialog in a [queue](dialogs.md#one-at-a-time) closes, focus goes back to the element that had it before the first one opened.

The title and message are linked to the dialog as its accessible name and description, and a prompt's message labels its text field.

## Reduced motion

Some people turn on reduced motion in their operating system, because sliding and fading can cause dizziness or nausea. When `prefers-reduced-motion: reduce` is on:

- Toasts appear and disappear without animating.
- Toasts in a stack jump to their new position instead of sliding.
- Dialog backdrops appear and disappear without fading.

Nothing to configure. The setting is read live, so changing it while the page is open takes effect for the next animation.

## What's left to you

The package handles the mechanics, but some choices only you can make:

- **Time to read.** A toast that closes after 4 seconds is fine for "Saved" and too fast for anything someone has to act on or read twice. Give important toasts a longer `duration`, or `autoDismiss: false` with `dismissible: true`. Better still, don't put anything a person must not miss only in a toast.
- **Labels in other languages.** The built-in labels are English. Set the toaster's `labels` and the dialogs' `labels`, as [Dialogs](dialogs.md#button-labels-and-translation) shows.
- **Custom content.** Nodes you pass to `toast.custom()` are yours: give buttons and links accessible names, keep the reading order sensible, and keep interactive elements keyboard-reachable.
- **Color overrides.** Colors you set with `--toast-color-*` need enough contrast against each other. The built-in colors are designed for it; your overrides are on you.

## Custom content and trust

`toast.custom()` and the `content` option of `update()` accept a string or a DOM node, and the two are treated very differently:

| You pass   | What happens                                               | Safe for untrusted input?    |
| ---------- | ---------------------------------------------------------- | ---------------------------- |
| A string   | Shown as plain text. Never parsed as HTML.                 | Yes.                         |
| A node     | Inserted exactly as built.                                 | Only if you built it safely. |
| A function | Called with the handle; its result follows the rows above. | Depends on what it returns.  |

### Strings are text

A string becomes a single text node. Tags in it show up as characters and create no elements:

```ts
import { toast } from "@codenhub/toaster";

// Shows the characters <b>Groceries</b>, not bold text.
toast.custom("<b>Groceries</b>");
```

That makes strings safe for anything users or servers control, such as note titles, user names, and error messages from an API. The same goes for every other text option: `message`, `title`, `description`, action labels, and dialog text are all inserted as text.

### Nodes are trusted

A node is inserted as is. The package doesn't inspect or clean it, so whoever builds it is responsible for its safety. Build it with DOM methods and put untrusted text in through `textContent`, never through `innerHTML`:

```ts
import { toast } from "@codenhub/toaster";

toast.custom((handle) => {
  const wrapper = document.createElement("div");

  const text = document.createElement("span");
  text.textContent = `Shared "${note.title}" with ${recipient.name}`;

  const button = document.createElement("button");
  button.textContent = "Copy link";
  button.addEventListener("click", () => {
    copyShareLink(note.id);
    handle.dismiss();
  });

  wrapper.append(text, button);
  return wrapper;
});
```

Event listeners you attach to your own nodes are yours to manage. They're released with the node when nothing else references it, but anything they hold onto elsewhere, such as a subscription or a timer, needs your own cleanup, for example in `handle.onHidden()`.

### Trusted Types

The package never assigns to `innerHTML` or any other HTML-parsing property. Its own toasts, icons, and dialogs are built with DOM methods. A page enforcing Trusted Types with `require-trusted-types-for 'script'` needs no Trusted Types policy for it. Its styling is CSP-friendly too; see [Content Security Policy](styling.md#content-security-policy).

## Next

That's the whole tour. For exact signatures and types, see the [API reference](reference/index.md). To see what changed between versions, see the [changelog](changelog/index.md). To start over from the top, head back to the [overview](index.md).
