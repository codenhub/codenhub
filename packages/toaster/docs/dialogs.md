---
title: Dialogs
description: confirm, prompt, and alert dialogs, what they resolve to, handles, queueing, button labels, dialog instances, and toasts while a dialog is open.
order: 2
---

# Dialogs

A toast tells; a dialog asks. Dialogs block the page until someone answers, so they're for the moments that need a decision: "Delete this note?", "What should we call it?", "Your session expired." This page covers the three dialog kinds, what each one resolves to, how they line up when several are opened, translating their buttons, and how they get along with toasts.

Dialogs come from their own entry point, so an app that only shows toasts doesn't pay for them:

```ts
import { dialog } from "@codenhub/toaster/dialog";
```

They use the same stylesheet as toasts, `@codenhub/toaster/styles`.

## Confirm

`dialog.confirm()` asks a yes-or-no question and resolves to a boolean:

```ts
import { dialog } from "@codenhub/toaster/dialog";

if (await dialog.confirm("Delete this note? This can't be undone.")) {
  await deleteNote(note.id);
}
```

It resolves to `true` when the confirm button is pressed and `false` on any way out: the cancel button, <kbd>Escape</kbd>, a click on the backdrop, or `dismiss()`.

Make it clear what's at stake with a title, specific button labels, and `type: "error"`, which colors the confirm button as destructive:

```ts
const confirmed = await dialog.confirm('Delete "Groceries"? This can\'t be undone.', {
  title: "Delete note",
  type: "error",
  confirmLabel: "Delete note",
  cancelLabel: "Keep it",
});
```

"Delete note" and "Keep it" beat "OK" and "Cancel": nobody has ever had to reread a button that says exactly what it does.

## Prompt

`dialog.prompt()` asks for a line of text. It resolves to the text when submitted, or `null` when cancelled:

```ts
import { dialog } from "@codenhub/toaster/dialog";

const name = await dialog.prompt("New name for this note", {
  title: "Rename note",
  defaultValue: note.title,
  placeholder: "Untitled",
  submitLabel: "Rename",
});

if (name !== null && name.trim() !== "") {
  await renameNote(note.id, name.trim());
}
```

The text comes back exactly as typed, spaces included, and may be empty, so check it before you use it. <kbd>Enter</kbd> in the text field submits, unless the person is in the middle of composing a character with an input method editor, as when typing Japanese or Chinese. <kbd>Escape</kbd> cancels. The message is the text field's label, so screen readers announce it with the field.

## Alert

`dialog.alert()` delivers a message that must be acknowledged before anything else happens. It's an accessible replacement for `window.alert()`, and it resolves to `undefined` once closed:

```ts
import { dialog } from "@codenhub/toaster/dialog";

await dialog.alert("Your session has expired. Sign in again to keep editing.", {
  title: "Session expired",
  okLabel: "Sign in",
});

goToSignIn();
```

An alert has one button, but <kbd>Escape</kbd> and the backdrop close it too. All three resolve the same way, because an alert has nothing to decide.

## Dialog options

All three methods take the message first and an options object second:

| Option            | Dialogs             | Default     | What it does                                                                     |
| ----------------- | ------------------- | ----------- | -------------------------------------------------------------------------------- |
| `title`           | All                 | None        | A heading above the message.                                                     |
| `type`            | All                 | `"primary"` | Color of the main button: `"primary"`, `"secondary"`, `"success"`, or `"error"`. |
| `backdropDismiss` | All                 | `true`      | Whether a click on the backdrop closes the dialog as a cancel.                   |
| `className`       | All                 | None        | Extra CSS classes on the `<dialog>` element.                                     |
| `confirmLabel`    | `confirm`           | `"Confirm"` | Text of the confirm button.                                                      |
| `cancelLabel`     | `confirm`, `prompt` | `"Cancel"`  | Text of the cancel button.                                                       |
| `submitLabel`     | `prompt`            | `"Submit"`  | Text of the submit button.                                                       |
| `okLabel`         | `alert`             | `"OK"`      | Text of the only button.                                                         |
| `defaultValue`    | `prompt`            | `""`        | Text already in the field when the dialog opens.                                 |
| `placeholder`     | `prompt`            | None        | Hint shown while the field is empty.                                             |

Set `backdropDismiss: false` when a stray click shouldn't count as an answer, such as in a form someone spent time filling in. <kbd>Escape</kbd> still cancels; that's how the browser's `<dialog>` works, and keyboard users depend on it.

The message must not be empty. An empty or whitespace-only message throws `Interactive dialog message must not be empty.`

## Handles

Each method returns a `DialogHandle`. You can `await` it directly, as every example so far does. You can also keep it and control the dialog while it's open:

```ts
import { dialog } from "@codenhub/toaster/dialog";

const question = dialog.confirm("Discard unsaved changes?");

// Close it if the note gets saved some other way in the meantime.
onAutosave(() => question.dismiss());

const discard = await question;
```

| Member      | What it is                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `await`     | The answer: `boolean` for confirm, `string \| null` for prompt, `undefined` for alert.                                           |
| `result`    | The same answer as a real `Promise`, for code that wants one rather than a promise-like value.                                   |
| `dismiss()` | Closes the dialog as a cancel. Works on queued dialogs too. Safe to call more than once.                                         |
| `state`     | `"queued"`, `"visible"`, `"hiding"`, or `"hidden"`, the same states [toasts have](toasts.md#state-settled-and-lifecycle-events). |
| `settled`   | A promise that resolves once the closing animation is done and the dialog is cleaned up.                                         |

The handle being awaitable is the point. Many dialog libraries return an object from `confirm()`, and `if (await confirm(...))` is then always true, because an object is always truthy. That bug ships the "Cancel" button that deletes anyway. Here, `await` gives you the actual answer.

Dismissing gives each kind its cancel value: `false` for confirm, `null` for prompt, `undefined` for alert.

## One at a time

A dialogs instance shows one dialog at a time. Calling `confirm()` while another dialog is open doesn't stack a second dialog on top: the new one waits in a queue, with state `"queued"`, and opens when the current one closes. Dismissing a queued dialog removes it from the queue with its cancel value; it never appears.

When a dialog opens, focus goes to its main button: the confirm button, or the OK button of an `alert()`. A prompt focuses its text field instead, so typing can start right away. A `confirm()` with `type: "error"` focuses the **cancel** button, so a reflexive <kbd>Enter</kbd> on a red "Delete" cancels instead of deleting.

When the last dialog in a sequence closes, focus goes back to the element that had it before the first one opened.

If the browser refuses to open a dialog, which is when `showModal()` throws, that dialog's handle rejects with the browser's error, and the next queued dialog still gets its turn. Wrap the `await` in `try`/`catch` if your page can get into a state where that happens.

## Button labels and translation

Rather than passing labels to every call, set them once on a dialogs instance with `createDialogs()`:

```ts
import { createDialogs } from "@codenhub/toaster/dialog";

const dialogs = createDialogs({
  labels: {
    confirm: "Confirmar",
    cancel: "Cancelar",
    submit: "Enviar",
    ok: "Entendido",
  },
});

if (await dialogs.confirm("¿Borrar esta nota?")) {
  await deleteNote(note.id);
}
```

A label passed to a single call still wins over the instance's label. The toast labels, for the close button and the stack's name, are set on the toaster instead; see [Toaster instances](instances.md#configuration).

## Dialog instances

`createDialogs()` makes an independent instance with the same `confirm`, `prompt`, and `alert` methods as `dialog`, which is itself just an instance made with no options. Each instance has its own queue.

| Option      | Default         | What it does                                                             |
| ----------- | --------------- | ------------------------------------------------------------------------ |
| `container` | `document.body` | The element the `<dialog>` is added to. Can't be changed after creation. |
| `labels`    | English         | Default button labels: `confirm`, `cancel`, `submit`, `ok`.              |
| `className` | None            | Extra CSS classes on every dialog from this instance.                    |

`configure()` changes `labels` and `className` later. New labels apply to dialogs called afterwards; a dialog already waiting in the queue keeps the labels it was called with. A new `className` applies to every dialog that opens afterwards, queued ones included. Passing `container` to it throws `Dialogs container cannot be changed after construction.`

`destroy()` closes the open dialog and drops the queued ones, resolving each with its cancel value, and removes the instance's `<dialog>` element. Calling it twice does nothing. Any other call after it throws `This dialogs instance has been destroyed. Create a new one with createDialogs().`

Opening a dialog outside a browser throws `DOM document is not available. Dialogs require a browser environment.` Like toasts, dialogs are safe to import during server-side rendering, just not to open.

## Toasts while a dialog is open

A modal dialog makes the rest of the page inert: nothing behind it can be clicked, focused, or heard by a screen reader. A toast stuck behind the backdrop would be useless, so while a dialog from this package is open, the toasts move into it.

More precisely: every toaster that renders into the same element as the dialog moves its stacks and its screen reader announcements inside the open dialog. Toasts stay in their usual corner, above the backdrop, and remain clickable and announced. They move back as soon as the dialog starts closing. With dialogs opened inside dialogs, the toasts follow the most recent one.

```ts
const deleting = dialog.confirm("Delete this note?");
toast.info("Autosave paused"); // shown above the backdrop, still clickable
```

Toasters with a different container, such as one scoped to a sidebar, don't move. Their toasts stay behind the backdrop, inert and not announced, until the dialog closes, and they aren't announced again afterward.

### Your own modal dialogs

This only works with dialogs from this package. A `<dialog>` your app opens with `showModal()` makes the page inert too, and the package won't move toasts into it. Toasts shown while it's open render behind its backdrop, where nobody can click them and screen readers skip them.

The fix is a toaster that lives inside your dialog. Create it each time the dialog opens and destroy it when it closes, since a destroyed toaster can't be reused:

```ts
import { createToaster } from "@codenhub/toaster";

const settings = document.querySelector<HTMLDialogElement>("#settings")!;

function openSettings() {
  const settingsToaster = createToaster({ container: settings });
  settings.addEventListener("close", () => settingsToaster.destroy(), { once: true });
  settings.showModal();
  return settingsToaster;
}

const settingsToaster = openSettings();
settingsToaster.success("Preferences saved");
```

## Next

The notes app now has toasts and dialogs from the ready-made instances. [Toaster instances](instances.md) covers every configuration option, defaults per toast kind, and separate toasters like the one above.
