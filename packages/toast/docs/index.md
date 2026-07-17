# @codenhub/toast

`@codenhub/toast` creates isolated browser toast managers for semantic, loading,
custom, and native-dialog interactions. Each manager owns its stacks, queues,
DOM, timers, listeners, and token stylesheet.

Use it when an application needs transient status messages, tracked loading
feedback, or simple confirm, prompt, and alert flows with explicit instance
ownership.

> [!WARNING]
> This package is experimental. Its API, rendering behavior, CSS, and support
> level may change before a stable release.

## Quick Start

Import the required stylesheet once in the browser entrypoint:

```ts
import { createToaster } from "@codenhub/toast";
import "@codenhub/toast/styles";

const toaster = createToaster();
toaster.semantic.success("Changes saved");
```

Retain handles when you need to update or dismiss a toast, and call `destroy()`
during teardown. Rendering requires a browser DOM and the package stylesheet;
interactive APIs additionally require native `<dialog>` support.

## Continue

- [API, CSS, and lifecycle reference](reference.md): Complete entrypoints,
  configuration, dispatchers, handles, queueing, validation, SSR, and cleanup.
- [Accessibility and custom content](accessibility-and-content.md): Roles,
  message guidance, dialogs, reduced motion, focus, trusted nodes, and string
  sanitization.
