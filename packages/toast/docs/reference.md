---
title: Reference
---

# API, CSS, and lifecycle

## Public Entrypoints

- `@codenhub/toast` exports `createToaster` and all public types.
- `@codenhub/toast/styles` exports required prebuilt CSS for layout, variants,
  dialogs, animation, and responsive behavior.

Import the stylesheet once. The optional `@codenhub/styles >=0.0.4` peer can
supply shared variables; fallback colors allow standalone use. No Tailwind
consumer configuration is required.

## Create and Configure

`createToaster(config?): Toaster` creates an independent instance. Defaults are
position `"top-right"`, `maxVisible: 5`, duration `4000`, no dismiss button,
auto-dismiss enabled, and appearance `"soft-bordered"`. `ToasterConfig` also
accepts a fixed `container`, color `tokens`, margin, and semantic/loading/custom
category defaults. `ToasterRuntimeConfig` is the same partial shape without
`container`.

Construction validates positions, appearances, finite non-negative durations,
positive integer capacity, and CSS color tokens. Invalid values throw.
`configure()` validates runtime changes; attempting to change `container`
throws. Configuring tokens or margins needs a DOM.

`Toaster` exposes `semantic`, `loading`, `interactive`, and `custom` dispatchers.
`clear()` dismisses non-interactive categories only. `destroy()` is idempotent;
it dismisses active/queued work, closes dialogs, restores focus when possible,
removes owned DOM/listeners/timers/styles, and makes later calls throw.

## Dispatchers

`SemanticDispatcher` provides `show()` and `success()`, `error()`, `warning()`,
and `info()` helpers plus category `clear()`. `SemanticType` contains those four
variants. Success/info default to role `status`; error/warning default to
`alert`.

`LoadingDispatcher.show(LoadingToastOptions)` creates a `status` toast that does
not auto-dismiss; `clear()` dismisses loading toasts. `CustomDispatcher.show()`
accepts `CustomToastOptions`; its `clear()` affects only custom toasts.

`InteractiveDispatcher` exposes `confirm`, `prompt`, and `alert`. Calls require
a non-empty message and queue FIFO behind one native `<dialog>`. Their
`ConfirmOptions`, `PromptOptions`, and `AlertOptions` configure labels, title,
backdrop dismissal (default true), action type, classes, and tokens. Prompt adds
default value and placeholder.

Queued/visible dismissal resolves confirm as `false`, prompt as `null`, and
alert as `undefined`. Native dialog setup failures reject `result`, clean up,
and allow the next queued dialog to run.

## Handles and Queueing

`ToastHandle` provides `dismiss()`, `update(ToastUpdateOptions)`, `settled`,
`state`, and `onShow`/`onShown`/`onHide`/`onHidden` subscriptions. Lifecycle
subscriptions return unsubscribe functions; late registration after an event
runs immediately. `update()` affects only visible toasts and can replace message,
tokens, or consumer classes.

`InteractiveToastHandle<T>` provides `dismiss()`, `settled`, `state`, and
`result`. `ToastState` is `"queued" | "visible" | "hiding" | "hidden"`.

At capacity, new non-interactive toasts queue and the oldest active toast is
dismissed; admission is FIFO. Queued toasts can be dismissed before rendering.
Auto-dismiss starts after entrance, pauses for hover/focus, and resumes with the
remaining duration. `settled` resolves after removal and cleanup.

## Options and Tokens

`SemanticToastOptions`, `LoadingToastOptions`, and `CustomToastOptions` provide
their required message/content and applicable `ToastPosition`, duration,
dismissal, `ToastRole`, margin, `ToastAppearance`, class, and token fields.
Messages and string content must be non-empty; durations must be finite and at
least zero. Category fallback types are `SemanticDefaults`, `LoadingDefaults`,
and `CustomDefaults`.

`ToastPosition` supports corners, top/bottom center, and center.
`ToastAppearance` is `flat`, `soft`, `soft-bordered`, or `left-accent`.
`ToastTokens` exposes optional colors for semantic variants, surface/border/text,
and dialog action states. Values are validated with `CSS.supports` when
available and declaration delimiters are always rejected. Instance tokens use
an owned scoped stylesheet; per-toast/dialog tokens stay element-scoped.

## SSR and Browser Lifecycle

Construction is SSR-safe unless it must apply initial tokens. Rendering,
interactive calls, and DOM-dependent reconfiguration require a document and
throw without one. The configured container determines the owner document and
cannot change. Interactive APIs require native `HTMLDialogElement.showModal()`
and `close()`; prompt focus requires `requestAnimationFrame`, and listener
cleanup uses `AbortController`.

Animations use the Web Animations API when available and complete immediately
when it is absent or throws. `matchMedia`, when available, disables motion for
`prefers-reduced-motion: reduce`.

## Public Exports

The root exports `createToaster`; `Toaster`, `SemanticDispatcher`,
`LoadingDispatcher`, `InteractiveDispatcher`, `CustomDispatcher`,
`ToasterConfig`, `ToasterRuntimeConfig`, `ToastHandle`,
`InteractiveToastHandle`, `ToastUpdateOptions`, `ToastState`, `ToastPosition`,
`ToastRole`, `ToastLifecycleSubscriber`, `ToastTokens`, `SemanticToastOptions`,
`SemanticType`, `LoadingToastOptions`, `CustomToastOptions`, `ConfirmOptions`,
`PromptOptions`, `AlertOptions`, `SemanticDefaults`, `LoadingDefaults`,
`CustomDefaults`, `ToastAppearance`, and `ToastContent` are public types.
