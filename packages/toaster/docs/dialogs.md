---
title: Dialogs
description: Guide to native modal dialogs, confirm, prompt, alert, thenable handles, and localization.
order: 3
---

# Interactive modal dialogs

`@codenhub/toaster` provides native HTML5 modal dialogs through the `dialog` singleton and the `toast.dialog` namespace. Dialogs render directly into the browser's top layer via `HTMLDialogElement.showModal()`, guaranteeing proper accessibility, focus containment, backdrop styling, and keyboard handling.

## Why native dialogs?

Rather than simulating modal overlays with complex `z-index` stacks and manual focus traps, `@codenhub/toaster` uses the browser's native `<dialog>` platform primitive:

- **Browser Top Layer**: Always renders above every other element in the DOM tree, regardless of ancestor `z-index` or `overflow: hidden` rules.
- **Inert Document**: The browser automatically disables user interaction with the background document while the modal is open.
- **Focus Trap & Restoration**: Focus is automatically confined within the dialog, and restored to the triggering element when the dialog closes.
- **Escape Key Handling**: Pressing Escape triggers standard dialog dismissal, resolving the operation with its cancel value.

## Confirmation dialogs (`dialog.confirm`)

`dialog.confirm()` prompts the user to confirm or cancel an operation, returning a promise that resolves to a boolean:

```ts
import { dialog } from "@codenhub/toaster";

if (await dialog.confirm("Are you sure you want to discard unsaved changes?")) {
  revertForm();
}
```

### Custom button labels and destructive variants

You can customize the confirm and cancel button text, and specify `type: "error"` for destructive actions (which tints the confirm button with error intent styling):

```ts
import { dialog } from "@codenhub/toaster";

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
import { dialog } from "@codenhub/toaster";

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
import { dialog } from "@codenhub/toaster";

await dialog.alert("Your session has expired. Please sign in again.", {
  title: "Session Expired",
  okLabel: "Sign in",
});

redirectToLogin();
```

## The thenable handle contract

All dialog methods return an `InteractiveToastHandle<T>`. This handle implements `PromiseLike<T>`, meaning you can either `await` the method call directly or capture the handle object for programmatic control:

```ts
import { dialog } from "@codenhub/toaster";

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

Instead of configuring `confirmLabel`, `cancelLabel`, `submitLabel`, and `okLabel` on every call, you can set default dialog labels globally on an instance using `ToasterConfig.labels`:

```ts
import { createToaster } from "@codenhub/toaster";

const toaster = createToaster({
  labels: {
    confirm: "Confirmar",
    cancel: "Cancelar",
    submit: "Enviar",
    ok: "Entendido",
    dismiss: "Fechar notificação",
  },
});

// All dialogs dispatched from this instance use Portuguese button labels:
if (await toaster.dialog.confirm("Deseja prosseguir?")) {
  salvarAlteracoes();
}
```

A label passed directly to a dialog call (`ConfirmOptions.confirmLabel`, etc.) always overrides the instance-level default.
