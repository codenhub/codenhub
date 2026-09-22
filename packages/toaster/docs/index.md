---
title: Overview
description: Overview, architecture, quick start, and documentation guide for @codenhub/toaster.
---

# Toaster documentation

`@codenhub/toaster` provides browser notifications and native interactive modal dialogs with zero-boilerplate singletons, isolated container instances, live `@codenhub/styles` token composition, and strict Content Security Policy compliance.

## Why Toaster?

Modern applications frequently balance transient notifications (build status, sync alerts) and synchronous user interruptions (confirming destructive actions, entering credentials). Most libraries compromise on either accessibility, styling flexibility, or memory safety.

`@codenhub/toaster` coordinates both feedback models through specialized browser primitives:

- **Dual-layer architecture**: Floating toast stacks render in light DOM containers with FLIP animations and FIFO eviction, while confirmation and prompt dialogs render into the browser's native top layer using HTML5 `<dialog>`.
- **Zero-boilerplate singletons**: Import `toast` and `dialog` directly for application-wide notifications, or use `createToaster()` for isolated containers and micro-frontends.
- **First-class Promise workflows**: `toast.promise` coordinates pending, success, and error transitions with automatic timer re-arming; dialog methods return `InteractiveToastHandle<T>` implementing `PromiseLike<T>` so you can `await dialog.confirm(...)` directly.
- **Live token composition**: Toast colors, presentation axes (`.solid`, `.soft`, `.ghost`, `.edged`), and dark mode compose live with `@codenhub/styles` or fall back to standalone generated defaults.

## Setup

### Installation

Install the package using your package manager:

```sh
pnpm add @codenhub/toaster
```

### Quick start

Import the required global stylesheet once in your client entrypoint, then use the pre-configured singletons anywhere in your application:

```ts
import { toast, dialog } from "@codenhub/toaster";
import "@codenhub/toaster/styles";

// 1. Plain neutral or semantic notifications
toast("Draft saved to cache");
toast.success("Profile updated");
toast.error("Failed to sync database");

// 2. Structured notification with action button
toast.success("Branch merged", {
  description: "Pull request #42 was merged into main.",
  action: {
    label: "Undo",
    onClick: (_event, handle) => {
      revertMerge();
      handle.dismiss();
    },
  },
});

// 3. Automated Promise lifecycle binding
await toast.promise(publishArticle(), {
  loading: "Publishing article...",
  success: "Article published live!",
  error: (err) => `Publication failed: ${err.message}`,
});

// 4. Interactive modal dialogs with native await
if (await dialog.confirm("Delete this workspace permanently?")) {
  await deleteWorkspace();
}
```

## Documentation guide

Explore the focused guides below to master every aspect of the package:

| Guide                               | Description                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Concepts](concepts.md)             | The dual-layer mental model, lifecycle states (`queued`, `visible`, `hiding`, `hidden`), settled promises, and thenables. |
| [Toasts](toasts.md)                 | Complete guide to dispatching neutral, semantic, loading, structured, and promise-driven notifications.                   |
| [Dialogs](dialogs.md)               | Deep dive into native modal confirmations, prompts, alerts, thenable handles, and label localization.                     |
| [Styling](styling.md)               | CSS custom property composition with `@codenhub/styles`, presentation classes, standalone fallback, dark mode, and CSP.   |
| [Accessibility](accessibility.md)   | ARIA live regions, ARIA22 technique, native dialog focus trapping, reduced motion, and content sanitization.              |
| [Scoped Instances](instances.md)    | Creating isolated instances with `createToaster()`, custom DOM containers, micro-frontends, and SSR safety.               |
| [API Reference](reference/index.md) | Complete TypeScript API catalogue generated automatically from package declarations.                                      |
| [Changelog](changelog/index.md)     | Release history, breaking changes, and migration notes across versions.                                                   |

## Requirements and runtime compatibility

- **Browser DOM**: Rendering notifications and modal dialogs requires a browser DOM environment. Construction is SSR-safe, but invoking rendering methods in Node.js or SSR runtimes throws an error.
- **Native `<dialog>`**: Interactive dialogs require browser support for `HTMLDialogElement.showModal()`.
- **CSS Import**: `@codenhub/toaster/styles` must be loaded once in the application to render layout, positioning, and animation rules.
- **Styles Integration**: `@codenhub/styles >=0.3.0` is an optional peer dependency. When present, toaster colors and presentation axes compose live; when absent, toaster renders using built-in standalone palette defaults.
- **Content Security Policy**: Applications with strict CSP `style-src` restrictions can pass a `nonce` in `ToasterConfig` to authorize token `<style>` injection.
