---
title: Toasts
description: Every kind of toast, actions, loading and promise toasts, handles and updates, positions, queueing, timers, and the errors toasts throw.
order: 1
---

# Toasts

This page covers everything a toast can do: the different kinds, buttons, loading spinners, updating a toast after it appears, where toasts show up, and what happens when too many arrive at once. The examples follow a notes app, starting with the most important feature any notes app has: telling you it saved.

Every example assumes `@codenhub/toaster/styles` is loaded once, as the [overview](index.md#a-first-toast) shows.

## Your first toasts

`toast` is a ready-made toaster. Call it directly for a neutral toast, or use one of its four shortcuts for a toast with a meaning:

```ts
import { toast } from "@codenhub/toaster";

toast("Note saved");
toast.success("Note published");
toast.error("Could not reach the server");
toast.warning("You are offline. Changes will sync later.");
toast.info("A new version is available");
```

`toast()` gives a neutral toast with no icon. The other four each get a matching icon and color, and differ in how urgently screen readers read them out:

| Call              | Read out by screen readers         |
| ----------------- | ---------------------------------- |
| `toast()`         | Politely, after the current speech |
| `toast.success()` | Politely, after the current speech |
| `toast.info()`    | Politely, after the current speech |
| `toast.warning()` | Right away, interrupting           |
| `toast.error()`   | Right away, interrupting           |

Warnings and errors interrupt because they're usually the thing the person needs to hear now. You can change that per toast with `role`; [Accessibility](accessibility.md#what-screen-readers-hear) explains how.

A toast closes itself after 4 seconds. If you'd rather it stayed, read [Timers](#timers-and-auto-dismiss) below.

### Two ways to call it

`toast()`, `success()`, `error()`, `warning()`, `info()`, and `loading()` all take either a message plus an optional options object, or a single options object:

```ts
toast.success("Note saved", { duration: 6000 });

toast.success({ message: "Note saved", duration: 6000 });
```

They do the same thing. The first reads better for a quick message. The second is handy when the toast is built from data, or when it has a `title` and no `message`.

## Titles, descriptions, and an action button

A toast can hold more than one line. `title` goes on top in bold, `message` is the main text, and `description` sits underneath in smaller print. `action` adds a button:

```ts
import { toast } from "@codenhub/toaster";

toast.success("Moved to trash", {
  title: "Groceries",
  description: "Notes in the trash are deleted after 30 days.",
  action: {
    label: "Undo",
    onClick: (_event, handle) => {
      restoreNote("groceries");
      handle.dismiss();
    },
  },
});
```

`onClick` gets the click's `MouseEvent` and the toast's handle. **Clicking the action does not close the toast.** That's on purpose: some actions should leave it open, like "Show details". When the action is done with the toast, call `handle.dismiss()`, as above.

A toast needs something to say. Calling one with neither a `message` nor a `title` throws `Toast requires a non-empty message or content.` A `description` alone doesn't count: it's the small print, and small print with no headline is just a mystery.

## Loading toasts

Some work takes a while. `toast.loading()` shows a spinner and stays on screen until you change it:

```ts
const syncing = toast.loading("Syncing notes…");
```

A loading toast has no timer and no close button by default, because "still working" shouldn't vanish while the work is still going. To finish it, call `update()` on the handle and turn it into a normal toast:

```ts
import { toast } from "@codenhub/toaster";

const syncing = toast.loading("Syncing notes…");

try {
  const count = await syncNotes();
  syncing.update({
    type: "success",
    message: `${count} notes synced`,
    autoDismiss: true,
  });
} catch {
  syncing.update({
    type: "error",
    message: "Sync failed. Your notes are safe on this device.",
    autoDismiss: true,
  });
}
```

Changing `type` swaps the spinner for the matching icon and color. Leaving the loading state also starts the timer the loading toast never had, so the result closes after its `duration` on its own. The `autoDismiss: true` above just says so out loud; pass `autoDismiss: false` instead if the result should stay until someone dismisses it.

`toast.loading()` takes `title`, `message`, `description`, `position`, `dismissible`, `className`, and `margin`. It has no `duration` or `autoDismiss` option, since it never closes on its own; set them in the `update()` that finishes it.

## Promise toasts

That try-and-update pattern is so common it has a shortcut. `toast.promise()` shows a loading toast while a promise runs, then turns it into a success or error toast:

```ts
import { toast } from "@codenhub/toaster";

const note = await toast.promise(saveNote(draft), {
  loading: "Saving…",
  success: (saved) => `Saved "${saved.title}"`,
  error: (error) => `Save failed: ${error instanceof Error ? error.message : String(error)}`,
});
```

It returns the original promise's result, so `note` is whatever `saveNote()` resolved with. If `saveNote()` rejects, `toast.promise()` shows the error toast and then rejects with the same error, so your own `try`/`catch` still runs. The toast is a side effect; your control flow doesn't change.

The rejection reaches `error` typed as `unknown`, because JavaScript lets a promise reject with anything, not just an `Error`. Check before you read `.message`, as above.

What each option takes:

- **`loading`**: a string, or the same options object `toast.loading()` takes.
- **`success`** and **`error`**: a string, a toast options object, or a function that receives the result (or the error) and returns either one. Return an object when you want a title, description, or action:

```ts
await toast.promise(syncNotes(), {
  loading: "Syncing notes…",
  success: (result) => ({
    title: "Sync complete",
    description: `${result.updated} notes updated, ${result.added} added.`,
  }),
  error: () => ({
    message: "Sync failed",
    duration: 10000,
    action: { label: "Retry", onClick: () => syncAgain() },
  }),
});
```

- **`position`**, **`className`**, and **`margin`** apply to the toast the whole way through.
- **`duration`** and **`dismissible`** apply to the result toast. Left unset, they come from the instance's `semantic` defaults, then from the instance itself. [Per-kind defaults](instances.md#per-kind-defaults) explains that chain.

The result toast closes on its own after its `duration`, even though the loading toast before it didn't, unless the instance's `semantic.autoDismiss` is `false`. To decide per call, return `autoDismiss` from `success` or `error`; that beats both.

If your `success` or `error` function throws, the loading toast is dismissed and the error is reported to the browser as an uncaught error, so it shows in the console and in error trackers. `toast.promise()` still resolves or rejects with the original promise's outcome, so a typo in a message doesn't break the save.

## Handles: controlling a toast after it appears

Every toast method except `toast.promise()`, which returns the promise's result, returns a `ToastHandle`. Keep it when you want to change, close, or watch the toast later:

```ts
import { toast } from "@codenhub/toaster";

const upload = toast("Uploading attachment… 0%", { autoDismiss: false });

onProgress((percent) => {
  upload.update({ message: `Uploading attachment… ${percent}%` });
});

onDone(() => {
  upload.update({ type: "success", message: "Attachment uploaded", autoDismiss: true });
});

cancelButton.addEventListener("click", () => upload.dismiss());
```

### `update()`

`update()` changes a toast in place. Pass only what you want to change:

- `title`, `message`, `description`: new text, or `null` to remove that line.
- `action`: a new button, or `null` to remove it.
- `type`: `"success"`, `"error"`, `"warning"`, `"info"`, or `"default"`. Changes the color, the icon, and how urgently screen readers announce it.
- `icon`: `"success"`, `"error"`, `"warning"`, `"info"`, or `"loader"` to pick a different icon, or `null` for none. When you change `type` without `icon`, the icon follows the type.
- `content`: replaces everything with custom content, as described in [Custom content](#custom-content). When given, `message` and `icon` in the same call are ignored.
- `duration`, `autoDismiss`, `dismissible`: change timing and the close button.
- `className`: adds more CSS classes.

Some details that matter in practice:

- **A queued toast keeps its updates.** If the toast is still waiting for room in the stack, the update is stored and applied when it appears.
- **A settled toast ignores updates.** Once the toast has fully closed, `update()` does nothing and doesn't throw. Calling it late is harmless.
- **Focus stays where it was.** If someone has focus on the action button when an update changes only the text, focus stays on the button. If the update replaces the action itself, focus moves to the new button.
- **Changed text is announced again**, so a screen reader hears both "Uploading…" and "Attachment uploaded".

`update()` throws if `duration` isn't a finite number of 0 or more, if `type` isn't one of the five above, or if `content` is empty.

### `dismiss()`

`dismiss()` starts the toast's exit animation. It's safe to call more than once, and safe to call on a toast that's still queued, which then never appears.

### State, `settled`, and lifecycle events

A toast moves through four states, readable from `handle.state`:

```text
queued → visible → hiding → hidden
```

- **`queued`**: waiting for room in a full stack. A toast with room skips straight to `visible`.
- **`visible`**: on screen.
- **`hiding`**: playing its exit animation.
- **`hidden`**: gone from the page.

`handle.settled` is a promise that resolves once the toast is `hidden` and its element is removed. Await it when something should happen only after the toast is fully gone.

For finer timing, subscribe to each step. Each method returns a function that unsubscribes:

```ts
const handle = toast("Note archived");

handle.onShow(() => console.log("added to the page"));
handle.onShown(() => console.log("entrance animation finished"));
handle.onHide(() => console.log("exit animation starting"));
const stop = handle.onHidden(() => console.log("removed from the page"));

stop(); // changed our mind about that last one
```

A subscriber added after its step already happened is called right away, so you can't miss an event by subscribing late. If a subscriber throws, the toast still finishes closing, and the error is reported as an uncaught error.

## Positions and margins

Toasts appear at the top right by default. Choose another spot per toast with `position`:

```ts
toast("Copied to clipboard", { position: "bottom-center" });
```

The six positions are `"top-left"`, `"top-center"`, `"top-right"`, `"bottom-left"`, `"bottom-center"`, and `"bottom-right"`. Anything else throws `Invalid toast position: …`. Each position has its own stack. To change the default for every toast, configure the toaster; see [Toaster instances](instances.md#configuration).

`margin` sets the distance from the edge of the screen. It takes one CSS length for both directions, or `x` and `y` separately:

```ts
toast("Saved", { margin: "24px" });
toast("Saved", { margin: { x: "16px", y: "4rem" } });
```

The margin belongs to the stack, not to one toast. Every toast at the same position shares one margin, so the most recent toast that set it moves the whole stack, and a toast that doesn't set it leaves the stack where it is. Without a margin, a stack sits 1rem from the edge, or further when the device has a notch or rounded corners that need more room.

Every toast is 22.25rem (356px) wide, shrinking to fit narrow screens. [Styling](styling.md#size) shows how to change it.

## How the stack fills up

Each position shows at most 5 toasts at once. Set `maxVisible` on the toaster to change that. When a sixth arrives:

1. The new toast joins a first-in, first-out queue.
2. The oldest toast that's allowed to leave starts closing to make room.
3. The queued toast appears in its place.

Some toasts aren't allowed to leave early, because pulling them out from under someone would be rude:

- A toast the pointer is hovering over.
- A toast with keyboard focus inside it, such as on its action button.
- A toast showing the loading spinner. It stands for work that's still running.

If every visible toast is protected, new ones wait in the queue until one of them is released or closes. When a stack is taller than the screen, it scrolls on its own, without showing a scrollbar, so every toast stays reachable.

## Timers and auto-dismiss

A toast closes itself after `duration` milliseconds, 4000 by default:

```ts
toast("Reminder set", { duration: 8000 });
toast("Read this carefully", { autoDismiss: false });
```

`autoDismiss: false` keeps a toast open until it's dismissed. `duration` must be a finite number of 0 or more, or the call throws.

The countdown pauses while the pointer is over the toast, while focus is inside it, and while the browser tab is in the background. When it resumes, it continues with the time that was left; it doesn't start over. The clock also doesn't start until the entrance animation has finished.

A toast that stays open should have a way out. Set `dismissible: true` to add a close button:

```ts
toast.error("Your note is too long to save", { autoDismiss: false, dismissible: true });
```

## Clearing toasts

```ts
toast.clear(); // closes every toast from this toaster, visible and queued
toast.dismiss(handle); // the same as handle.dismiss()
toast.dismiss(); // the same as toast.clear()
```

These only touch toasts from the same toaster. A [separate instance](instances.md) keeps its own toasts.

## Custom content

When the built-in layout doesn't fit, `toast.custom()` takes your own content. It comes in three forms:

```ts
import { toast } from "@codenhub/toaster";

// 1. A string, shown as plain text.
toast.custom("Week 12 notes exported");

// 2. A DOM node, inserted as is.
const message = document.createElement("p");
const link = document.createElement("a");
link.href = "/trash";
link.textContent = "the trash";
message.append("Deleted. You can still find it in ", link, ".");
toast.custom(message);

// 3. A function that receives the handle and returns a string or a node.
toast.custom((handle) => {
  const button = document.createElement("button");
  button.textContent = "Got it";
  button.addEventListener("click", () => handle.dismiss());
  return button;
});
```

A string is never parsed as HTML: `toast.custom("<b>Hi</b>")` shows the tags as characters. That makes strings safe for text you don't control, such as a note's title. A node goes in exactly as you built it, so its safety is your responsibility. [Accessibility and security](accessibility.md#custom-content-and-trust) explains that boundary.

`toast.custom()` takes `position`, `duration`, `dismissible`, `autoDismiss`, `className`, `role`, and `margin`, either as a second argument or together with `content` in one object. A custom toast has no icon and is announced politely by default.

What custom content can't be:

- An empty or whitespace-only string. It throws `Toast content must not be an empty string.` rather than show an empty box.
- A node other than an element, a text node, or a `DocumentFragment`. Comments and documents throw `Toast content Node must be an Element, Text, or DocumentFragment.`
- A function that returns something other than a string or a node. That throws `Toast content must resolve to a string or DOM Node.`

## When toast calls throw

Toasts check their input when you call them, so a mistake fails right where you made it, not some time later in the browser. Every error is a plain `Error`:

| Message starts with                              | Cause                                         | Fix                                                                             |
| ------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------- |
| `Toast requires a non-empty message or content.` | No `message` or `title`, or both are empty.   | Give the toast some text.                                                       |
| `Toast duration must be a finite number…`        | `duration` is negative, `NaN`, or `Infinity`. | Use 0 or more. For "never", use `autoDismiss: false`.                           |
| `Invalid toast position: …`                      | A position not in the list of six.            | Use one of the six [positions](#positions-and-margins).                         |
| `Invalid toast role: …`                          | `role` is not `"status"` or `"alert"`.        | Use one of those two.                                                           |
| `Invalid semantic toast type: …`                 | `type` isn't a known severity.                | Use `"success"`, `"error"`, `"warning"`, `"info"`, `"default"`.                 |
| `Toast content …`                                | Empty or unsupported custom content.          | See [Custom content](#custom-content).                                          |
| `DOM document is not available…`                 | Showing a toast where there's no `document`.  | Show toasts only in the browser; see [SSR](instances.md#server-side-rendering). |
| `This toaster instance has been destroyed…`      | Calling a toaster after `destroy()`.          | Create a new one with `createToaster()`.                                        |

## Next

Toasts inform; sometimes you need to ask. [Dialogs](dialogs.md) cover `confirm`, `prompt`, and `alert`, which the notes app uses to ask before deleting a note and to rename one.
