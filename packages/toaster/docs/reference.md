---
title: Reference
---

# API, CSS, and lifecycle

## Public Entrypoints

- `@codenhub/toaster` exports `createToaster` and all public types.
- `@codenhub/toaster/styles` exports required prebuilt CSS for layout, variants, dialogs, animation, and responsive behavior.

Import the stylesheet once. The optional `@codenhub/styles >=0.3.0` peer can supply shared variables; this package's own generated defaults allow standalone use. No Tailwind consumer configuration is required. When `@codenhub/styles` is present, every radius and border-width reads its base token first (`--radius-control`, `--radius-surface`, `--border-width`) — matching `box.css`/`surface.css`'s own fallback chain — before falling back further to toaster's own fixed values when `@codenhub/styles` isn't installed at all. An active aesthetic (e.g. `.glass`, `.neobrutalism`) layers its material tokens (`--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`) on top of that base.

Every color here is a lookup, not a computation: toaster's own CSS never runs a `color-mix()` formula. When `@codenhub/styles` is present, colors come straight from its generated `./palette` export — the same pre-composed `--palette-<intent>-<presentation>[-<ground>]-<slot>` cells its own components render from, already flattened at `@codenhub/styles`' own generate time. When it isn't, `scripts/generate-toast-defaults.mjs` bakes the identical cells into this package's own `generated-defaults.css` at generate time, so a consumer sees the same colors either way, with nothing left in this package's own CSS to drift from the real thing.

The toast body's default look matches `.alert`'s own unstyled default: `.soft` fill, grounded on the page, at `.alert`'s real composed values. The dialog's action buttons match `.btn`'s own unstyled default instead: `.solid` fill, grounded on transparent. Neither is toaster's own choice to make up; both are read directly off the same palette cells `.alert` and `.btn` themselves render from.

An active presentation (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) cascades onto the toast body and the dialog's action buttons the same way it cascades onto any real styles component — from a wrapping ancestor, or (toast body only) a class on the toast element itself — but applying one only swaps which pre-composed cell toaster reads; there is no formula underneath left to recompute. Only these three named presentations are supported, not arbitrary `--ui-fill`/`--ui-border` percentages, since the palette only bakes these three discrete cases. A consumer's own `ToastTokens` color wins over both sources everywhere, with one deliberate exception: `.ghost`'s background and `.edgeless`'s border always resolve to a literal `transparent`, even over a custom token, matching how a real ghost or edgeless component's 0%-fill math mixes in 0% of any color — custom or not. The dialog container and its cancel button carry no severity of their own, so `.ghost`'s `transparent` override is their only presentation hook; the dialog container also grounds `.edged`/`.edgeless` the same literal way, rather than reading a live `--ui-border` cascade, so it behaves identically with or without `@codenhub/styles` installed. The dialog's action buttons additionally each expose their own edge token (`primaryEdge`/`secondaryEdge`/`successBtnEdge`/`destructiveBtnEdge`) for `.edged`, matching the toast body's own per-severity edge tokens. Two further surfaces opt out for legibility: the dialog's text input keeps its border regardless of `.edgeless` and its background stays transparent regardless of presentation, and its `:focus-visible` ring reuses the primary action button's own color chain rather than a hand-picked literal.

The dialog's action buttons render as native `<button>` elements. If a consumer also loads `@codenhub/styles`' classless native-element mappings (`@codenhub/styles/native` or `@codenhub/styles/tw/native`), that stylesheet resets every bare `button` to the neutral intent at zero specificity — the same specificity toaster's own dialog-button rules use. Import order decides which wins: import the native mappings before `@codenhub/toaster/styles`, not after, or a dialog button's intent styling is silently reset to neutral.

Dark-mode styling activates under a `.dark` class or `data-theme="dark"` attribute on an ancestor (usually `<html>`) — the same DOM contract `@codenhub/theme` produces. Toaster has no dependency on `@codenhub/theme`; any mechanism that sets those attributes works.

## Create and Configure

`createToaster(config?): Toaster` creates an independent instance. Defaults are position `"top-right"`, `maxVisible: 5`, duration `4000`, no dismiss button, and auto-dismiss enabled. `ToasterConfig` also accepts a fixed `container`, color `tokens`, margin, `className`, and semantic/loading/custom category defaults. `ToasterRuntimeConfig` is the same partial shape without `container`.

Unlike `position` and `duration`, a config-level `className` is not overridden by a per-call `className` — the two are appended (config first, then the call's own class) on every toast and every interactive dialog dispatched from that instance.

Construction validates positions, finite non-negative durations, positive integer capacity, and CSS color tokens. Invalid values throw. `configure()` validates runtime changes; attempting to change `container` throws. Configuring tokens or margins needs a DOM.

`Toaster` exposes `semantic`, `loading`, `interactive`, and `custom` dispatchers. `clear()` dismisses non-interactive categories only. `destroy()` is idempotent; it dismisses active/queued work, closes dialogs, restores focus when possible, removes owned DOM/listeners/timers/styles, and makes later calls throw.

## Dispatchers

`SemanticDispatcher` provides `show()` and `success()`, `error()`, `warning()`, and `info()` helpers plus category `clear()`. `SemanticType` contains those four variants. Success/info default to role `status`; error/warning default to `alert`.

`LoadingDispatcher.show(LoadingToastOptions)` creates a `status` toast that does not auto-dismiss; `clear()` dismisses loading toasts. `CustomDispatcher.show()` accepts `CustomToastOptions`; its `clear()` affects only custom toasts.

`InteractiveDispatcher` exposes `confirm`, `prompt`, and `alert`. Calls require a non-empty message and queue FIFO behind one native `<dialog>`. Their `ConfirmOptions`, `PromptOptions`, and `AlertOptions` configure labels, title, backdrop dismissal (default true), action type, classes, and tokens. Prompt adds default value and placeholder.

Queued/visible dismissal resolves confirm as `false`, prompt as `null`, and alert as `undefined`. Native dialog setup failures reject `result`, clean up, and allow the next queued dialog to run.

## Handles and Queueing

`ToastHandle` provides `dismiss()`, `update(ToastUpdateOptions)`, `settled`, `state`, and `onShow`/`onShown`/`onHide`/`onHidden` subscriptions. Lifecycle subscriptions return unsubscribe functions; late registration after an event runs immediately. `update()` affects only visible toasts and can replace message, tokens, or consumer classes.

`InteractiveToastHandle<T>` provides `dismiss()`, `settled`, `state`, and `result`. `ToastState` is `"queued" | "visible" | "hiding" | "hidden"`.

At capacity, new non-interactive toasts queue and the oldest active toast is dismissed; admission is FIFO. Queued toasts can be dismissed before rendering. Auto-dismiss starts after entrance, pauses for hover/focus, and resumes with the remaining duration. `settled` resolves after removal and cleanup.

## Options and Tokens

`SemanticToastOptions`, `LoadingToastOptions`, and `CustomToastOptions` provide their required message/content and applicable `ToastPosition`, duration, dismissal, `ToastRole`, margin, class, and token fields. Messages and string content must be non-empty; durations must be finite and at least zero. Category fallback types are `SemanticDefaults`, `LoadingDefaults`, and `CustomDefaults`.

`ToastPosition` supports corners, top/bottom center, and center. `ToastTokens` exposes optional colors for semantic variants (including their edge/border), surface/border/text, and dialog action fill, hover, and edge/border states. Values are validated with `CSS.supports` when available and declaration delimiters are always rejected. Instance tokens use an owned scoped stylesheet; per-toast/dialog tokens stay element-scoped.

## SSR and Browser Lifecycle

Construction is SSR-safe unless it must apply initial tokens. Rendering, interactive calls, and DOM-dependent reconfiguration require a document and throw without one. The configured container determines the owner document and cannot change. Interactive APIs require native `HTMLDialogElement.showModal()` and `close()`; prompt focus requires `requestAnimationFrame`, and listener cleanup uses `AbortController`.

Animations use the Web Animations API when available and complete immediately when it is absent or throws. `matchMedia`, when available, disables motion for `prefers-reduced-motion: reduce`.

## Public Exports

The root exports `createToaster`; `Toaster`, `SemanticDispatcher`, `LoadingDispatcher`, `InteractiveDispatcher`, `CustomDispatcher`, `ToasterConfig`, `ToasterRuntimeConfig`, `ToastHandle`, `InteractiveToastHandle`, `ToastUpdateOptions`, `ToastState`, `ToastPosition`, `ToastRole`, `ToastLifecycleSubscriber`, `ToastTokens`, `SemanticToastOptions`, `SemanticType`, `LoadingToastOptions`, `CustomToastOptions`, `ConfirmOptions`, `PromptOptions`, `AlertOptions`, `SemanticDefaults`, `LoadingDefaults`, `CustomDefaults`, and `ToastContent` are public types.
