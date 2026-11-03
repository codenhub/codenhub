# @codenhub/toaster

Instance-based browser toasts and native interactive dialogs with isolated DOM, configuration, queues, and CSS custom property styles.

> [!WARNING]
>
> This package is experimental. Its API, rendering behavior, CSS, and support level may change before a stable release.

## Installation

```sh
pnpm add @codenhub/toaster
```

## Usage

Import the required stylesheet once in your client entrypoint. Use the pre-configured singletons for zero-boilerplate notifications and dialogs. Dialogs have their own entry point, so an app that only shows toasts does not bundle them:

```ts
import { toast } from "@codenhub/toaster";
import { dialog } from "@codenhub/toaster/dialog";
import "@codenhub/toaster/styles";

// Neutral or semantic notifications
toast("File uploaded");
toast.success("Changes saved", {
  description: "Updated 4 files across 2 repositories.",
  action: {
    label: "Undo",
    onClick: (_event, handle) => {
      revertChanges();
      handle.dismiss();
    },
  },
});

// Promise lifecycle binding
await toast.promise(saveChanges(), {
  loading: "Saving changes...",
  success: "Changes saved",
  error: (err) => `Save failed: ${err instanceof Error ? err.message : String(err)}`,
});

// Interactive modal dialogs
if (await dialog.confirm("Delete workspace?")) {
  await deleteWorkspace();
}
```

For isolated DOM containers, micro-frontends, or custom instances, use `createToaster()`, and `createDialogs()` for dialogs:

```ts
import { createToaster } from "@codenhub/toaster";
import { createDialogs } from "@codenhub/toaster/dialog";

const scopedToaster = createToaster({
  container: document.getElementById("modal-overlay")!,
  maxVisible: 3,
});

scopedToaster.success("Scoped notification");
const dialogs = createDialogs({ labels: { confirm: "Proceed" } });
await dialogs.confirm("Proceed?");
dialogs.destroy();
scopedToaster.destroy();
```

## Documentation

- [Documentation overview](docs/index.md): Entrypoint to all guides, architecture, and quick start.
- [Concepts](docs/concepts.md): Dual-layer architecture, lifecycle handles, and thenables.
- [Toasts guide](docs/toasts.md): Neutral, semantic, loading, structured, and promise notifications.
- [Dialogs guide](docs/dialogs.md): Confirmations, prompts, alerts, and label localization.
- [Styling guide](docs/styling.md): `--toast-color-*` color overrides, `@codenhub/styles` live composition, presentation classes, and CSP.
- [Accessibility and security](docs/accessibility.md): ARIA live regions, focus restoration, reduced motion, and custom content boundaries.
- [Scoped instances](docs/instances.md): Multi-instance coordination, custom containers, and lifecycle teardown.
- [API reference](docs/reference/index.md): Complete TypeScript symbol catalogue compiled from declarations.
- [Changelog](docs/changelog/index.md): Version history, breaking changes, and migration notes.

## Requirements

- Rendering requires a browser DOM and `@codenhub/toaster/styles`. Construction is SSR-safe, but rendering throws without a document.
- Dialogs require native `<dialog>` support.
- `@codenhub/styles >=0.3.0` is an optional peer. When present, toasts and dialogs compose live with its color, presentation, and aesthetic tokens; without it, the package's own defaults apply. See the [styling guide](docs/styling.md).
- If you use `@codenhub/styles`' native-element stylesheet, import it before `@codenhub/toaster/styles`. See [stylesheet ordering](docs/styling.md#classless-native-button-stylesheet-ordering).
- Dark mode follows a `.dark` class or `data-theme="dark"` attribute on an ancestor, as `@codenhub/theme` sets. See [dark mode](docs/styling.md#dark-mode-support).
- Colors are overridden with `--toast-color-*` CSS custom properties, set in your own CSS. The package injects no `<style>` element, so a strict `style-src` Content Security Policy needs no nonce. See [color overrides](docs/styling.md#color-overrides).

## Notes

Configuration, messages, durations, and positions are validated and may throw synchronously. Calls after `destroy()` throw.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.

Bundled Lucide SVG icons use the ISC License. See [NOTICE](NOTICE).
