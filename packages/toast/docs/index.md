---
title: Overview
---

# Show toasts and dialogs

`@codenhub/toast` creates isolated managers for semantic, loading, and custom
browser toasts plus native confirm, prompt, and alert dialogs. Each manager owns
its stacks, queues, DOM, timers, listeners, and token stylesheet.

## Setup

### Installation

```sh
pnpm add @codenhub/toast
```

### Quick start

Import the required global stylesheet once in the browser entrypoint:

```ts
import { createToaster } from "@codenhub/toast";
import "@codenhub/toast/styles";

const toaster = createToaster();
const saving = toaster.loading.show({ message: "Saving..." });

await saveChanges();
saving.dismiss();
toaster.semantic.success("Changes saved");

// Release DOM, timers, listeners, dialogs, and token styles on teardown.
toaster.destroy();
```

Retain handles when a toast must be updated or dismissed. Call `destroy()` when
the owning application scope is torn down; later calls on that manager throw.

### Configuration

Pass `ToasterConfig` to `createToaster()` to set position, visible capacity,
duration, appearance, margins, category defaults, color tokens, or a fixed
container. Runtime changes use `configure()`, but the container cannot change.
Configuration values are validated and invalid values throw synchronously.

## Requirements

- Rendering requires a browser DOM and `@codenhub/toast/styles`.
- Construction is SSR-safe unless initial tokens need the DOM. Rendering and
  DOM-dependent configuration throw without a document.
- Interactive APIs require native `<dialog>` support. No polyfill or non-modal
  fallback is included.
- `@codenhub/styles >=0.0.4` is an optional peer. Standalone fallback colors are
  included, and consumers do not need Tailwind configuration.

## Next steps

- [API, CSS, and lifecycle reference](reference.md): Complete entrypoints,
  configuration, dispatchers, handles, queueing, validation, SSR, and cleanup.
- [Accessibility and custom content](accessibility-and-content.md): Roles,
  message guidance, dialogs, reduced motion, focus, trusted DOM nodes, and
  string sanitization.
