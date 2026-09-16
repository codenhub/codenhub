# @codenhub/toaster

Instance-based browser toasts and native interactive dialogs with isolated DOM, configuration, queues, and token styles.

> [!WARNING] This package is experimental. Its API, rendering behavior, CSS, and support level may change before a stable release.

## Installation

```sh
pnpm add @codenhub/toaster
```

## Usage

Import the required stylesheet once in the browser entrypoint.

```ts
import { createToaster } from "@codenhub/toaster";
import "@codenhub/toaster/styles";

const toaster = createToaster();
const saving = toaster.loading.show({ message: "Saving..." });

await saveChanges();
saving.dismiss();
toaster.semantic.success("Changes saved");

// Release DOM, timers, listeners, dialogs, and token styles on teardown.
toaster.destroy();
```

## Documentation

- [Documentation overview](docs/index.md)
- [API, CSS, and lifecycle reference](docs/reference.md)
- [Accessibility and custom content](docs/accessibility-and-content.md)

## Requirements

- Rendering requires a browser DOM and `@codenhub/toaster/styles`.
- Interactive APIs require native `<dialog>` support. Construction is SSR-safe, but rendering operations throw without a document.
- `@codenhub/styles >=0.0.4` is an optional peer; standalone fallback colors are included. When present, an active aesthetic (e.g. `.glass`, `.neobrutalism`) also cascades its material tokens (`--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`) into toast and dialog radius, border width, and shadow.
- Dark-mode styling activates under a `.dark` class or `data-theme="dark"` attribute on an ancestor (usually `<html>`) — the same DOM contract `@codenhub/theme` produces. Toaster has no dependency on `@codenhub/theme`; any mechanism that sets those attributes works.

## Notes

Configuration, messages, durations, positions, and color tokens are validated and may throw synchronously. Calls after `destroy()` throw.

## License

Licensed under Apache-2.0.

Bundled Lucide SVG icons use the ISC License. See [NOTICE](NOTICE).
