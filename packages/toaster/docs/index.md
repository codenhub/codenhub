---
title: Overview
---

# Show toasts and dialogs

`@codenhub/toaster` creates isolated managers for semantic, loading, and custom browser toasts plus native confirm, prompt, and alert dialogs. Each manager owns its stacks, queues, DOM, timers, listeners, and token stylesheet.

## Setup

### Installation

```sh
pnpm add @codenhub/toaster
```

### Quick start

Import the required global stylesheet once in the browser entrypoint:

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

Retain handles when a toast must be updated or dismissed. Call `destroy()` when the owning application scope is torn down; later calls on that manager throw.

### Configuration

Pass `ToasterConfig` to `createToaster()` to set position, visible capacity, duration, margins, category defaults, color tokens, or a fixed container. Runtime changes use `configure()`, but the container cannot change. Configuration values are validated and invalid values throw synchronously.

## Requirements

- Rendering requires a browser DOM and `@codenhub/toaster/styles`.
- Construction is SSR-safe unless initial tokens need the DOM. Rendering and DOM-dependent configuration throw without a document.
- Interactive APIs require native `<dialog>` support. No polyfill or non-modal fallback is included.
- `@codenhub/styles >=0.0.4` is an optional peer, and consumers do not need Tailwind configuration either way. Every color here is a lookup, never a computation: toaster reads `@codenhub/styles`' generated `./palette` export — the same pre-composed values its own components render from — and falls back to this package's own `generated-defaults.css` (baked from that same palette at generate time) when the peer isn't installed, so the look is identical either way. Its base radius and border-width tokens (`--radius-control`, `--radius-surface`, `--border-width`) apply as soon as the package is present, and an active aesthetic (e.g. `.glass`, `.neobrutalism`) layers its material tokens (`--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`) on top. The toast body's default look matches `.alert`'s own unstyled default; the dialog's action buttons match `.btn`'s. An active presentation (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) cascades the same way it cascades onto any real styles component, swapping which pre-composed cell toaster reads rather than recomputing anything — only these three named presentations are supported, not arbitrary `--ui-fill`/`--ui-border` percentages. A consumer's own `ToastTokens` color always wins over both sources, except `.ghost`'s background and `.edgeless`'s border, which stay literally transparent regardless — matching how a real ghost or edgeless component's 0% fill or border mixes in 0% of any color, custom or not.
- If also using `@codenhub/styles`' classless native-element mappings (`@codenhub/styles/native` or `/tw/native`), import them before `@codenhub/toaster/styles`: that stylesheet resets every bare `<button>` to the neutral intent at the same zero specificity toaster's dialog buttons use, and import order decides which wins.
- Dark-mode styling activates under a `.dark` class or `data-theme="dark"` attribute on an ancestor (usually `<html>`) — the same DOM contract `@codenhub/theme` produces. Toaster has no dependency on `@codenhub/theme`; any mechanism that sets those attributes works.

## Next steps

- [API, CSS, and lifecycle reference](reference.md): Complete entrypoints, configuration, dispatchers, handles, queueing, validation, SSR, and cleanup.
- [Accessibility and custom content](accessibility-and-content.md): Roles, message guidance, dialogs, reduced motion, focus, trusted DOM nodes, and string sanitization.
