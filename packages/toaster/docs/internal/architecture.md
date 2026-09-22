---
status: IMPLEMENTED
last_updated: 2026-09-22
scope: Internal engine architecture, invariants, and implementation design for @codenhub/toaster.
---

# Toaster Architecture and Invariants

This document records the internal architecture, DOM isolation strategies, lifecycle guarantees, and invariants governing `@codenhub/toaster`.

## Architectural Overview

`@codenhub/toaster` coordinates two independent presentation layers in the browser while maintaining zero external runtime dependencies and full strict Content Security Policy (CSP) compliance:

1. **Floating Toast Stacks (Light DOM)**: Asynchronous, transient notifications rendered into position-anchored container elements attached to `document.body` or a scoped consumer-provided container element. Managed by `ToastManager` and rendered by `Toast`, `SemanticToast`, and `LoadingToast`.
2. **Interactive Modal Dialogs (Top Layer)**: Modal confirmation, prompt, and alert dialogs rendered as native `<dialog>` elements displayed via `HTMLDialogElement.showModal()`. Managed by `ModalController`.

```
                ┌──────────────────────────────────────────────┐
                │          Public Entrypoint (@codenhub/toaster) │
                │          - toast singleton                   │
                │          - dialog singleton                  │
                │          - createToaster()                   │
                └──────────────────────┬───────────────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────────┐
                        │         ToastManager         │
                        └──────┬────────────────┬──────┘
                               │                │
             ┌─────────────────┴────┐      ┌────┴─────────────────┐
             │   Floating Stacks    │      │   Top Layer Modals   │
             │   - Toast            │      │   - ModalController  │
             │   - SemanticToast    │      │   - <dialog> element │
             │   - LoadingToast     │      │   - showModal()      │
             └──────────────────────┘      └──────────────────────┘
```

## Core Subsystems and Invariants

### 1. Dual-Layer Isolation

- **Floating Toasts**: Toast containers are `<div>` elements tagged with `[data-toast-container]` and `[data-toast-instance]`. Each instance owns its own container hierarchy at each used `ToastPosition`. Toasts within a container stack vertically, automatically responding to safe-area insets (`env(safe-area-inset-*)`) and viewport bounds.
- **Top-Layer Modals**: Native `<dialog>` elements are rendered into the browser's top layer. Because `showModal()` makes the rest of the document inert according to the HTML specification, background toasts pause user interaction (such as dismiss button clicks) while any modal dialog is active, resuming once all dialogs close.
- **Independence**: Two separate `Toaster` instances configured to the same position render independent, isolated DOM trees. They do not synchronize stacks or share admission queues.

### 2. Admission Control, Capacity, and Eviction Safety

- **FIFO Queue**: When the number of active toasts at a position reaches `maxVisible`, incoming toasts trigger eviction of the oldest eligible toast.
- **Eviction Protection**: A toast is explicitly protected against eviction if:
  1. It represents an active loading state (`LoadingToast`).
  2. It currently holds mouse hover (`:hover`).
  3. It or any of its children currently holds keyboard focus (`:focus-within`).
- **Dynamic Capacity Reconciliation**: Lowering `maxVisible` at runtime via `configure({ maxVisible })` immediately reconciles existing occupancy according to these protection rules.

### 3. Layout, Internal Scrolling, and Animations

- **FLIP Layout Transitions**: When toasts are added, dismissed, or updated in size, sibling toasts adjust position using First-Last-Invert-Play (FLIP) layout calculations.
- **Web Animations API**: Toast entrance, exit, and displacement animations use the Web Animations API when available. If unsupported, or if an animation throws, transitions resolve immediately without hanging promises.
- **Reduced Motion**: If `matchMedia("(prefers-reduced-motion: reduce)")` matches, animation durations drop to 0ms and transitions resolve synchronously.
- **Internal Scroll Container**: When the cumulative height of toasts exceeds the viewport's available space, the stack container scrolls internally without displaying default platform scrollbars, keeping all notifications reachable.

### 4. Thenable Interactive Handles (`PromiseLike<T>`)

- `InteractiveToastHandle<T>` implements the `PromiseLike<T>` interface.
- Awaiting the return value of `dialog.confirm(...)`, `dialog.prompt(...)`, or `dialog.alert(...)` directly invokes its `.then()` implementation, resolving to `boolean`, `string | null`, or `void` upon user interaction.
- If a consumer retains the handle object rather than immediately awaiting it, they retain access to programmatic control (`handle.dismiss()`), lifecycle inspection (`handle.state`), and cleanup monitoring (`handle.settled`).
- If dismissed programmatically or cancelled via the ESC key, the dialog settles with its canonical fallback value (`false` for confirm, `null` for prompt, `undefined` for alert).

### 5. Styling and Live Custom-Property Composition

- **Zero-Dependency Styling**: CSS rules in `@codenhub/toaster/styles` read semantic intent colors (`--color-success`, `--color-error`, etc.) and UI axes (`--ui-fill`, `--ui-border`, `--ui-clip`, `--ui-elevation`).
- **Live Peer Composition**: When `@codenhub/styles >=0.3.0` is present on the page, toaster elements compose against its shared theme variables. Changes to custom properties or active classes (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) update rendered toasts automatically.
- **Standalone Fallback**: When `@codenhub/styles` is absent, toaster falls back to pre-calculated, uncomposed static defaults in `generated-defaults.css`, generated by `scripts/generate-toast-defaults.mjs`.
- **Precedence**: An explicit property in `ToastTokens` always overrides the composed color for that specific property.

### 6. Security and Content Boundaries

- **Sanitized HTML Strings**: Custom content passed as a string is parsed into a temporary template and sanitized through an allowlist of tags (`a`, `b`, `br`, `code`, `div`, `em`, `h1`-`h6`, `i`, `li`, `ol`, `p`, `pre`, `span`, `strong`, `ul`) and attributes (`href`, `target`, `rel`).
- **Trusted Types Sink**: String parsing passes through `Element.innerHTML`. Under strict CSP `require-trusted-types-for 'script'`, applications providing strings must define a Trusted Types default policy.
- **Trusted DOM Nodes**: An explicit `Node` or node factory function passed to `toast.custom()` is trusted and inserted directly without sanitization, placing full responsibility for event cleanup and security on the author.
- **Strict CSP Nonce**: If a Content Security Policy restricts unnonced inline stylesheets, `ToasterConfig.nonce` supplies a nonce applied to the injected `<style>` element used for custom token overrides.

### 7. Teardown and Resource Cleanup

- Calling `toaster.destroy()` is idempotent and executes synchronous cleanup:
  - All active toasts settle immediately (`state` becomes `"hidden"` and `settled` resolves), canceling pending animations.
  - All active modal dialogs are closed and removed from the top layer.
  - Owned container elements, event listeners, resize observers, and token `<style>` nodes are removed from the DOM.
  - Any subsequent API call on a destroyed instance throws synchronously.
