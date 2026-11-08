---
status: IMPLEMENTED
last_updated: 2026-11-07
scope: Internal engine architecture, invariants, and implementation design for @codenhub/toaster.
---

# Toaster Architecture and Invariants

This document records the internal architecture, DOM isolation strategies, lifecycle guarantees, and invariants governing `@codenhub/toaster`.

## Architectural Overview

`@codenhub/toaster` coordinates two independent presentation layers in the browser while maintaining zero external runtime dependencies and full strict Content Security Policy (CSP) compliance, with no injected `<style>` element and no HTML-parsing sink:

1. **Floating Toast Stacks (Light DOM)**: Asynchronous, transient notifications rendered into position-anchored container elements attached to `document.body` or a scoped consumer-provided container element. Managed by `ToastManager` and rendered by `Toast`, `SemanticToast`, and `LoadingToast`.
2. **Interactive Modal Dialogs (Top Layer)**: Modal confirmation, prompt, and alert dialogs rendered as native `<dialog>` elements displayed via `HTMLDialogElement.showModal()`. Managed by `ModalController`, behind `createDialogs()` in the separate `@codenhub/toaster/dialog` entry point.

```
  ┌─────────────────────────────┐      ┌─────────────────────────────┐
  │ @codenhub/toaster           │      │ @codenhub/toaster/dialog    │
  │ - toast singleton           │      │ - dialog singleton          │
  │ - createToaster()           │      │ - createDialogs()           │
  └──────────────┬──────────────┘      └──────────────┬──────────────┘
                 ▼                                    ▼
  ┌─────────────────────────────┐      ┌─────────────────────────────┐
  │ ToastManager                │      │ ModalController             │
  │ - Toast, SemanticToast,     │      │ - <dialog> + showModal()    │
  │   LoadingToast              │      │                             │
  └──────────────┬──────────────┘      └──────────────┬──────────────┘
                 └──── layer-host.ts (DOM attribute) ─┘
```

The two entries share helpers (ids, `layer-host.ts`) but neither imports the other's manager, so each bundles alone.

## Core Subsystems and Invariants

### 1. Dual-Layer Isolation

- **Floating Toasts**: Toast containers are `<div>` elements tagged with `[data-toast-container]` and `[data-toast-instance]`. Each instance owns its own container hierarchy at each used `ToastPosition`. Toasts within a container stack vertically, automatically responding to safe-area insets (`env(safe-area-inset-*)`) and viewport bounds.
- **Top-Layer Modals**: Native `<dialog>` elements are rendered into the browser's top layer. Because `showModal()` makes the rest of the document inert according to the HTML specification, the toast stacks and live regions of every toaster rendering into the dialog's parent element move into the dialog while it is open, and back once it starts closing. A toaster with a different container, or under a modal dialog the application opened, stays inert and unannounced until it closes.
- **Layer-host protocol**: An open dialog marks itself with `data-toast-layer-host="<n>"`, where `n` grows with each dialog opened on the page. A toaster renders its stacks and live regions into the parent's child with the highest `n`, or into the parent when there is none. Opening a dialog moves the existing stacks from the previous host into it; releasing one moves them to the next-highest host. Both sides live in `layer-host.ts`.
  - **Why**: dialogs live in their own entry point so toast-only bundles do not carry them (about 7 KB minified, 2 KB gzipped, measured 2026-11-02), and dialogs have no owning toaster any more, so the handoff cannot be a method call between objects. An attribute on the DOM costs neither entry any code from the other, keeps working when a page loads two copies of the package, and needs no module state shared between entries.
  - **Rejected**: a registry the dialog module writes and the toast module reads, which breaks when a bundler duplicates the shared chunk or a page loads two copies, and leaves a toast-only bundle carrying the hook; keeping dialogs a property of the toaster, which no bundler can drop; moving only one owner's toasts, which no longer has an owner to name and left every other toaster's toasts inert and unannounced behind the dialog.
- **Independence**: Two separate `Toaster` instances configured to the same position render independent, isolated DOM trees. They do not synchronize stacks or share admission queues.

### 2. Admission Control, Capacity, and Eviction Safety

- **FIFO Queue**: When the number of active toasts at a position reaches `maxVisible`, incoming toasts trigger eviction of the oldest eligible toast.
- **Eviction Protection**: A toast is explicitly protected against eviction if:
  1. It represents an active loading state (`LoadingToast`).
  2. It currently holds mouse hover (`:hover`).
  3. It or any of its children currently holds keyboard focus (`:focus-within`).
- **Dynamic Capacity Reconciliation**: Lowering `maxVisible` at runtime via `configure({ maxVisible })` immediately reconciles existing occupancy according to these protection rules.

### 3. Layout, Internal Scrolling, and Animations

- **FLIP Layout Transitions**: When a toast is added or removed, sibling toasts slide to their new positions using First-Last-Invert-Play (FLIP) layout calculations. An `update()` that changes a toast's size moves its siblings without animating them.
- **Web Animations API**: Toast entrance, exit, and displacement animations use the Web Animations API when available. If unsupported, or if an animation throws, transitions resolve immediately without hanging promises.
- **Reduced Motion**: If `matchMedia("(prefers-reduced-motion: reduce)")` matches, animation durations drop to 0ms and transitions resolve synchronously.
- **Internal Scroll Container**: When the cumulative height of toasts exceeds the viewport's available space, the stack container scrolls internally without displaying default platform scrollbars, keeping all notifications reachable. The available space is measured in `dvh`, the height left by a mobile browser's toolbars, the same unit dialogs use.
- **Empty Stacks**: A stack with no toasts is hidden with `display: none`, which also takes its region landmark out of the accessibility tree.
  - **Why**: an empty "Notifications" region stayed in landmark navigation after the last toast left, one per position used. Hiding it in CSS covers every way a toast leaves, and the element keeps its margin.
  - **Rejected**: removing the element when it empties, which needs the same check on every removal path and loses a margin set by an earlier dispatch.

### 4. Thenable Interactive Handles (`PromiseLike<T>`)

- `DialogHandle<T>` implements the `PromiseLike<T>` interface.
- Awaiting the return value of `dialog.confirm(...)`, `dialog.prompt(...)`, or `dialog.alert(...)` directly invokes its `.then()` implementation, resolving to `boolean`, `string | null`, or `void` upon user interaction.
- If a consumer retains the handle object rather than immediately awaiting it, they retain access to programmatic control (`handle.dismiss()`), lifecycle inspection (`handle.state`), and cleanup monitoring (`handle.settled`).
- If dismissed programmatically or cancelled via the ESC key, the dialog settles with its canonical fallback value (`false` for confirm, `null` for prompt, `undefined` for alert).

### 5. Styling and Live Custom-Property Composition

- **Zero-Dependency Styling**: CSS rules in `@codenhub/toaster/styles` read semantic intent colors (`--color-success`, `--color-error`, etc.) and UI axes (`--ui-fill`, `--ui-border`, `--ui-clip`, `--ui-elevation`).
- **Live Peer Composition**: When `@codenhub/styles >=0.3.0` is present on the page, toaster elements compose against its shared theme variables. Changes to custom properties or active classes (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) update rendered toasts automatically.
- **Standalone Fallback**: When `@codenhub/styles` is absent, toaster falls back to pre-calculated, uncomposed static defaults in `generated-defaults.css`, generated by `scripts/generate-toast-defaults.mjs`.
- **Precedence**: A `--toast-color-*` custom property a consumer sets always overrides the composed color for that specific property. The package never sets these properties itself; a consumer sets them in CSS, globally, on a container, or on a class passed through `className`.
  - **Why**: the stylesheet already read these properties, so they were the styling contract; the runtime `tokens` option only wrote them through an injected `<style>` element and inline styles, which cost a toast-only bundle about 2.8 KB minified and 870 bytes gzipped (measured 2026-11-02), needed a CSP nonce, and duplicated what plain CSS does.
  - **Rejected**: keeping the runtime `tokens` and `nonce` options, which validated colors and managed an owned `<style>` element per instance for values a consumer can set in CSS with no package code.

- **Root `color-scheme`**: `generated-defaults.css` sets `color-scheme: light dark` on `:root`, and `light` or `dark` under the `.light`, `.dark`, `.theme-light`, `.theme-dark`, `[data-theme="light"]`, and `[data-theme="dark"]` selectors, the same rules `@codenhub/styles` sets.
  - **Why**: every standalone default color is a `light-dark()` pair, which resolves against the element's computed `color-scheme`. Without the root rule, standalone toasts would stay light under a dark system preference, and a nested `.light` section in a `.dark` page would not resolve back to light.
  - **Cost**: the rule is page-wide, so a light-only page that loads the stylesheet gets dark scrollbars, form fields, and canvas under a dark system preference. Such a page sets `:root { color-scheme: light; }` after the stylesheet, which keeps its toasts light as well. `docs/styling.md` says so.
  - **Rejected**: scoping the rule to the package's own elements, which breaks a theme class set on a page ancestor; and defaulting to light with dark mode as an opt-in, which leaves standalone toasts light on dark pages until each consumer finds the option.

### 6. Security and Content Boundaries

- **Text Strings**: Custom content passed as a string becomes one text node, never parsed as HTML, so markup in it renders literally. An empty or whitespace-only string throws.
  - **Why**: no HTML parsing of strings means no sanitizer to trust or keep current, and no `Element.innerHTML` sink for Trusted Types to guard. Dropping the allowlist sanitizer also cut about 1.35 KB minified and 450 bytes gzipped from a toast-only bundle (measured 2026-11-02).
  - **Rejected**: keeping the allowlist sanitizer for strings, which every toast bundle paid for whether or not it passed markup, and which made a string look safe for untrusted HTML only as long as the allowlist had no gap.
- **No HTML Sinks**: The package assigns to no HTML-parsing sink (`innerHTML`, `insertAdjacentHTML`, and the like); toasts, icons, and dialogs are built with DOM APIs, so a `require-trusted-types-for 'script'` policy needs no Trusted Types policy for it.
- **Trusted DOM Nodes**: An explicit `Node` or node factory function passed to `toast.custom()` is trusted and inserted as it is, placing full responsibility for event cleanup and security on the author.
- **No Injected Stylesheets**: The package injects no `<style>` element and writes styles only as individual CSSOM properties (`element.style.setProperty`), which a `style-src` policy does not block, so a strict Content Security Policy needs no nonce for it.

### 7. Teardown and Resource Cleanup

- Calling `toaster.destroy()` is idempotent and executes synchronous cleanup:
  - All active toasts settle immediately (`state` becomes `"hidden"` and `settled` resolves), canceling pending animations.
  - Owned container elements and live regions are removed from the DOM, and event listeners are detached. A first announcement still waiting for its delay is dropped.
  - Any subsequent API call on a destroyed instance throws synchronously.
- Calling `dialogs.destroy()` on a dialogs instance closes its open dialog and drops queued ones, settling each with its cancel value, removes its `<dialog>` element, and makes later calls throw. Destroying a toaster leaves dialogs alone, and the reverse.

### 8. Option Semantics

- **`undefined` resets**: an option passed as `undefined`, to `createToaster()` or `configure()`, takes its default, the same as leaving it out of the constructor. `configure()` applies the reset to the stacks already showing too, so `configure({ margin: undefined })` clears their margin.
  - **Why**: `configure({ position: undefined })` already reset `position`, while `margin` and `maxVisible` given as `undefined` changed new toasts but left the showing stacks as they were, so one call left the page in two states. Conditional code such as `configure({ margin: compact ? "8px" : undefined })` expects the reset.
  - **Rejected**: treating `undefined` as "leave unchanged", which would make `position: undefined` stop resetting and would need a separate way to clear an option.
- **Duration limit**: every `duration` must be a number from 0 to 2147483647 milliseconds (about 24.8 days), or the call throws.
  - **Why**: browsers store a `setTimeout` delay as a signed 32-bit integer and fire a longer one at once, so `duration: 3_000_000_000` closed the toast immediately in Chromium and Firefox (measured 2026-11-07).
  - **Rejected**: clamping to the limit, which silently changes a value instead of reporting it; `autoDismiss: false` already means "never".
- **Leaving the loading state**: when an `update()` turns a loading toast into another kind, its `autoDismiss` and `duration` fall back to the kind it became: a semantic type takes the instance's `semantic` defaults, then the instance-wide ones; `"default"` takes the instance-wide ones. A value given in the same `update()` wins. `toast.promise()` goes through the same path.
  - **Why**: the loading toast has no timer of its own, and forcing `autoDismiss: true` with the instance `duration` ignored `createToaster({ autoDismiss: false })` and `semantic.duration`, which the same toast shown with `toast.success()` respects.
- **Promise outcome options**: `success` and `error` take `ToastOptions` without `position`, `margin`, `role`, and `type`.
  - **Why**: the result is the loading toast updated in place, so it keeps its stack, and the outcome sets its type and role. Those four options were accepted and silently ignored.
  - **Rejected**: honoring `position` and `margin` by moving the toast to another stack mid-flight, which no consumer asked for and which `update()` does not support either.
