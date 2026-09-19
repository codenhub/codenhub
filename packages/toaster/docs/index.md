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
- `@codenhub/styles >=0.3.0` is an optional peer, and consumers do not need Tailwind configuration either way. Every toast and dialog color composes live against `@codenhub/styles`' own tokens — `--color-<intent>`, the presentation axis (`--ui-fill`/`--ui-border`), and the aesthetic axis (`--ui-clip`, `--ui-shadow-*`, `--ui-elevation`) — using the same fill/edge formula its own components run, so a runtime change to a `--color-*` token or an active aesthetic class reaches an already-rendered toast the same way it reaches a `.alert` or a `.btn`. When `@codenhub/styles` isn't installed, the identical formula runs against this package's own generated, uncomposed color inputs (`generated-defaults.css`), so standalone rendering stays usable with nothing left to drift from the real thing. The toast body composes like `.alert`'s own unstyled default (a soft, edged surface grounded on the page); the dialog's action buttons compose like `.btn`'s (a solid, edgeless, raised control).
- Presentation (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) works the same way it does on a real styles component: declared as a plain, inheriting custom-property class, so one on the toast or dialog element itself always wins over one only an ancestor carries. A consumer's own `ToastTokens` color always wins over the composed result for the property it sets.
- A restrictive `style-src` Content Security Policy that blocks unnonced inline styles can supply `ToasterConfig.nonce`, applied to the `<style>` element instance color tokens are written through.
- If also using `@codenhub/styles`' classless native-element mappings (`@codenhub/styles/native` or `/tw/native`), import them before `@codenhub/toaster/styles`: that stylesheet resets every bare `<button>` to the neutral intent at the same zero specificity toaster's dialog buttons use, and import order decides which wins.
- Dark-mode styling activates under a `.dark` class or `data-theme="dark"` attribute on an ancestor (usually `<html>`) — the same DOM contract `@codenhub/theme` produces. Toaster has no dependency on `@codenhub/theme`; any mechanism that sets those attributes works. Theme resolution is nested: a `.light`/`.dark` section inside an oppositely-themed ancestor resolves its own colors correctly, standalone or not.

## Next steps

- [API, CSS, and lifecycle reference](reference.md): Complete entrypoints, configuration, dispatchers, handles, queueing, validation, SSR, and cleanup.
- [Accessibility and custom content](accessibility-and-content.md): Roles, message guidance, dialogs, reduced motion, focus, trusted DOM nodes, and string sanitization.
