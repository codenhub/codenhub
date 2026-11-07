# @codenhub/toaster

Toast notifications and native modal dialogs for the browser. Toasts stack in a corner, queue when there are too many, and close on their own. Dialogs ask a question and give you an answer you can `await`. Both are accessible out of the box, both work with a strict Content Security Policy, and neither needs a framework.

> [!WARNING]
>
> This package is experimental. Its API, rendering, and CSS class names may change before a stable release. The [changelog](docs/changelog/index.md) lists every change.

## Installation

```sh
pnpm add @codenhub/toaster
```

## Usage

Load the stylesheet once where your app starts, then call `toast` from anywhere. Dialogs come from their own entry point, so an app that only shows toasts doesn't bundle them:

```ts
import "@codenhub/toaster/styles";
import { toast } from "@codenhub/toaster";
import { dialog } from "@codenhub/toaster/dialog";

toast.success("Note saved");

// A loading spinner that becomes a success or error toast when the promise settles.
const note = await toast.promise(saveNote(draft), {
  loading: "Saving…",
  success: "Saved",
  error: "Save failed",
});

// Resolves to true or false, not to an always-truthy object.
if (await dialog.confirm("Delete this note?", { type: "error", confirmLabel: "Delete" })) {
  await deleteNote(note.id);
}
```

No provider, no setup call: the first toast creates its own stack. For toasts inside a specific element, or separate settings per area, create your own instances with `createToaster()` and `createDialogs()`.

Calls check their input and throw right away on a mistake, such as an empty message or an unknown position. Showing a toast or dialog outside a browser throws too.

## Documentation

- [Documentation overview](docs/index.md): what the package does and the order to read the guides in.
- [Toasts](docs/toasts.md): every kind of toast, actions, promise toasts, updates, queueing, and timers.
- [Dialogs](docs/dialogs.md): `confirm`, `prompt`, `alert`, queueing, and translated labels.
- [Toaster instances](docs/instances.md): every option and default, scoped toasters, `destroy()`, and SSR.
- [Styling](docs/styling.md): colors, presentation classes, dark mode, and CSP.
- [Accessibility and security](docs/accessibility.md): screen readers, focus, reduced motion, and custom content.
- [API reference](docs/reference/index.md): every exported symbol, generated from the source.
- [Changelog](docs/changelog/index.md): what changed in each release.

## Requirements

- A browser. Importing and creating instances is safe during server-side rendering, but showing a toast or dialog needs a `document`.
- `@codenhub/toaster/styles` loaded once. Without it, toasts have no position, layout, or color.
- Native `<dialog>` support for dialogs, which every current browser has.
- Optional: `@codenhub/styles` 0.3.0 or newer. When present, toasts and dialogs take their colors and look from its theme; otherwise built-in colors apply. If you use its native-element stylesheet, import it **before** `@codenhub/toaster/styles`, or dialog buttons lose their colors. See [Styling](docs/styling.md).
- Instances you create own DOM elements, timers, and listeners. Call `destroy()` when the area they belong to goes away.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.

Bundled Lucide SVG icons use the ISC License. See [NOTICE](NOTICE).
