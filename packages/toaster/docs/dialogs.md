---
title: Dialogs
description: Guide to native modal dialogs, confirm, prompt, alert, thenable handles, and localization.
order: 3
---

# Interactive modal dialogs

`@codenhub/toaster/dialog` provides native HTML5 modal dialogs through the `dialog` singleton and independent instances made with `createDialogs()`. Dialogs have their own entry point so an app that only shows toasts does not bundle them. Dialogs render directly into the browser's top layer via `HTMLDialogElement.showModal()`, guaranteeing proper accessibility, focus containment, backdrop styling, and keyboard handling.

## Why native dialogs?

Rather than simulating modal overlays with complex `z-index` stacks and manual focus traps, `@codenhub/toaster` uses the browser's native `<dialog>` platform primitive:

- **Browser Top Layer**: Always renders above every other element in the DOM tree, regardless of ancestor `z-index` or `overflow: hidden` rules.
- **Inert Document**: The browser automatically disables user interaction with the background document while the modal is open. The toasts of every toaster rendering into the same parent element move into the dialog for that time, so they stay usable (see [Concepts](concepts.md#the-two-presentation-layers)). Your own modal dialogs need a scoped toaster for that (see [Your own modal dialogs](concepts.md#your-own-modal-dialogs)).
- **Focus Trap & Restoration**: Focus is automatically confined within the dialog, and restored to the triggering element when the dialog closes.
- **Escape Key Handling**: Pressing Escape triggers standard dialog dismissal, resolving the operation with its cancel value.

## Confirmation dialogs (`dialog.confirm`)

`dialog.confirm()` prompts the user to confirm or cancel an operation, returning a promise that resolves to a boolean:

```ts
import { dialog } from "@codenhub/toaster/dialog";

if (await dialog.confirm("Are you sure you want to discard unsaved changes?")) {
  revertForm();
}
```

### Custom button labels and destructive variants

You can customize the confirm and cancel button text, and specify `type: "error"` for destructive actions (which tints the confirm button with error intent styling):

```ts
import { dialog } from "@codenhub/toaster/dialog";

const confirmed = await dialog.confirm("Permanently delete this project and all its databases?", {
  title: "Delete Project",
  type: "error",
  confirmLabel: "Delete project",
  cancelLabel: "Keep project",
});

if (confirmed) {
  await deleteProject();
}
```

## Prompt dialogs (`dialog.prompt`)

`dialog.prompt()` displays an interactive text input, resolving to the entered `string` if submitted or `null` if cancelled:

```ts
import { dialog } from "@codenhub/toaster/dialog";

const branchName = await dialog.prompt("Enter a name for the new branch:", {
  title: "Create Branch",
  defaultValue: "feature/",
  placeholder: "feature/branch-name",
  submitLabel: "Create branch",
  cancelLabel: "Cancel",
});

if (branchName !== null && branchName.trim().length > 0) {
  await git.createBranch(branchName);
}
```

Pressing <kbd>Enter</kbd> inside the prompt's text input automatically submits the form, and <kbd>Escape</kbd> cancels the prompt and resolves to `null`.

## Alert dialogs (`dialog.alert`)

`dialog.alert()` provides an accessible replacement for `window.alert()`. It interrupts the user with a message and resolves to `void` when acknowledged:

```ts
import { dialog } from "@codenhub/toaster/dialog";

await dialog.alert("Your session has expired. Please sign in again.", {
  title: "Session Expired",
  okLabel: "Sign in",
});

redirectToLogin();
```

## The thenable handle contract

All dialog methods return an `DialogHandle<T>`. This handle implements `PromiseLike<T>`, meaning you can either `await` the method call directly or capture the handle object for programmatic control:

```ts
import { dialog } from "@codenhub/toaster/dialog";

// Approach 1: Direct await (resolves to boolean)
const confirmed = await dialog.confirm("Proceed with update?");

// Approach 2: Retain the handle
const handle = dialog.confirm("Proceed with update?");

// Inspect dialog state:
console.log(handle.state); // "visible"

// Dismiss programmatically after a timeout:
setTimeout(() => {
  if (handle.state === "visible") {
    handle.dismiss(); // Settles the promise with `false`
  }
}, 10000);

// Await the outcome when needed:
const result = await handle;
await handle.settled; // Resolves once exit animation and cleanup finish
```

### Cancellation fallbacks

When a dialog is dismissed without confirmation (by clicking the Cancel button, pressing <kbd>Escape</kbd>, or calling `handle.dismiss()`), it settles deterministically with:

- `false` for `dialog.confirm()`
- `null` for `dialog.prompt()`
- `undefined` for `dialog.alert()`

## Localization and default labels

Instead of configuring `confirmLabel`, `cancelLabel`, `submitLabel`, and `okLabel` on every call, you can set default dialog labels on an instance using `DialogsConfig.labels`:

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

// All dialogs opened from this instance use Portuguese button labels:
if (await dialogs.confirm("Deseja prosseguir?")) {
  salvarAlteracoes();
}
```

A label passed directly to a dialog call (`ConfirmOptions.confirmLabel`, etc.) always overrides the instance-level default. The `dismiss` and `notifications` labels belong to toasts; set them with `ToasterConfig.labels` (see [Instances](instances.md)).

## Dialog instances (`createDialogs`)

`createDialogs()` returns an independent instance with the same `confirm`, `prompt`, and `alert` methods as the `dialog` singleton. Each instance opens its dialogs one at a time, queuing later calls until the open one closes.

| Option      | Type           | Default          | Description                                                                |
| :---------- | :------------- | :--------------- | :------------------------------------------------------------------------- |
| `container` | `HTMLElement`  | `document.body`  | Element the dialogs are appended to. Cannot be changed after construction. |
| `labels`    | `DialogLabels` | English defaults | Default button labels: `confirm`, `cancel`, `submit`, `ok`.                |
| `className` | `string`       | `undefined`      | Class appended to every dialog in this instance.                           |

`dialogs.configure({...})` changes any option except `container`. `dialogs.destroy()` closes the open dialog and drops queued ones, settling each with its cancel value, and removes the instance's `<dialog>` element; later calls throw. To recolor dialogs, set the `--toast-color-*` custom properties in CSS (see [Styling](styling.md#color-overrides)).

## Toasts while a dialog is open

A modal dialog makes the rest of the page inert, so a toast rendered outside it can be neither clicked nor announced. While a dialog from `@codenhub/toaster/dialog` is open, the toast stacks and live regions of every toaster rendering into the same parent element move inside it, and move back once it starts closing. Nested dialogs hand the toasts to the most recently opened one. The two entry points coordinate through an attribute on the open dialog, so using both costs nothing extra in either bundle.
