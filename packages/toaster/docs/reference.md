---
title: Reference
---

# API, CSS, and lifecycle

## Public Entrypoints

- `@codenhub/toaster` exports `createToaster` and all public types.
- `@codenhub/toaster/styles` exports required prebuilt CSS for layout, variants, dialogs, animation, and responsive behavior.

Import the stylesheet once. The optional `@codenhub/styles >=0.3.0` peer can supply shared variables; this package's own generated defaults allow standalone use. No Tailwind consumer configuration is required. When `@codenhub/styles` is present, every radius and border-width reads its base token first (`--radius-control`, `--radius-surface`, `--border-width`) — matching `box.css`/`surface.css`'s own fallback chain — before falling back further to toaster's own fixed values when `@codenhub/styles` isn't installed at all. An active aesthetic (e.g. `.glass`, `.neobrutalism`) layers its material tokens (`--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`, `--ui-clip`, `--ui-elevation`) on top of that base, generically: toaster's CSS reads the same `--ui-*` custom properties any real styles component reads, so it needs no per-aesthetic code to pick them up.

Every color composes live, the same formula `@codenhub/styles`' own `box.css` runs: an intent input (`--color-<name>`/`-contrast`/`-strong`, live when `@codenhub/styles` is present) is mixed against the presentation axis (`--ui-fill`, capped by the intent's own fill ceiling) to produce a background, with the edge and on-fill contrast derived the same way `box.css` derives them. A runtime change to a `--color-*` token, or to the presentation/aesthetic classes in scope, reaches an already-rendered toast or dialog button the same way it reaches a real `.alert` or `.btn`. When `@codenhub/styles` isn't installed, the identical formula runs against this package's own generated, uncomposed inputs (`generated-defaults.css`, produced by `scripts/generate-toast-defaults.mjs` from `@codenhub/styles`' real palette at generate time), so standalone rendering stays close to identical with nothing hand-typed to drift from the real thing.

The toast body composes like `.alert`'s own unstyled default: a soft (12%), edged surface grounded on the page background, no elevation. The dialog's action buttons compose like `.btn`'s own unstyled default instead: solid (100%), edgeless, raised (elevation 1), grounded on transparent. Neither is toaster's own choice to make up; both mirror the same registry defaults `.alert` and `.btn` themselves declare.

Presentation (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) is a plain, inheriting custom-property class matching `@codenhub/styles`' own `presentation.css` exactly (`.solid` sets `--ui-fill: 100%`, and so on) — restated as a standalone shim so it also works with no `@codenhub/styles` on the page. Because it is an ordinary custom property, a class on the toast or dialog element itself always wins over one only an ancestor carries, the same rule any real styles component follows, and arbitrary `--ui-fill`/`--ui-border` percentages set directly (not only these five named classes) are honored too. A consumer's own `ToastTokens` color always wins over the composed result for the property it sets. The dialog container and its cancel button carry no severity of their own, so they read a flat, live-first surface/text/border token instead of running the intent formula. The dialog's action buttons additionally each expose their own edge token (`primaryEdge`/`secondaryEdge`/`successBtnEdge`/`destructiveBtnEdge`) that wins over the composed edge under `.edged`, matching the toast body's own per-severity edge tokens; the cancel button gets the same `.edged` treatment via the flat border token. Two further surfaces opt out for legibility: the dialog's text input keeps its border regardless of `.edgeless` and its background stays transparent regardless of presentation, and its `:focus-visible` ring reuses the primary action button's own color chain rather than a hand-picked literal. Toast entrance/exit animation duration and easing read `--motion-duration-slow`/`--motion-ease` live too, falling back to this package's own default timing when unset.

The dialog's action buttons render as native `<button>` elements. If a consumer also loads `@codenhub/styles`' classless native-element mappings (`@codenhub/styles/native` or `@codenhub/styles/tw/native`), that stylesheet resets every bare `button` to the neutral intent at zero specificity — the same specificity toaster's own dialog-button rules use. Import order decides which wins: import the native mappings before `@codenhub/toaster/styles`, not after, or a dialog button's intent styling is silently reset to neutral.

Dark-mode styling activates under a `.dark` class or `data-theme="dark"` attribute on an ancestor (usually `<html>`) — the same DOM contract `@codenhub/theme` produces. Toaster has no dependency on `@codenhub/theme`; any mechanism that sets those attributes works. Because `@codenhub/styles`' color tokens resolve through `light-dark()` against the consuming element's own computed `color-scheme`, and this package's own generated defaults resolve the same way, a `.light`/`.dark` section nested inside an oppositely-themed ancestor resolves its own toasts and dialogs correctly, not just the document root.

A restrictive `style-src` Content Security Policy that blocks an unnonced inline `<style>` element can supply `ToasterConfig.nonce`; it is applied to the `<style>` element instance color tokens (`ToasterConfig.tokens`) are written through. A stylesheet that fails to initialize under CSP throws and leaves no owned node behind.

## Create and Configure

`createToaster(config?): Toaster` creates an independent instance. Defaults are position `"top-right"`, `maxVisible: 5`, duration `4000`, no dismiss button, and auto-dismiss enabled. `ToasterConfig` also accepts a fixed `container`, color `tokens`, a CSP `nonce` for the token stylesheet, margin, `className`, and semantic/loading/custom category defaults. `ToasterRuntimeConfig` is the same partial shape without `container`.

Margin is a property of the shared stack at a position, not of an individual toast: the most recently dispatched value applies to every toast already showing at that position, and dispatching without `margin` clears it.

Unlike `position` and `duration`, a config-level `className` is not overridden by a per-call `className` — the two are appended (config first, then the call's own class) on every toast and every interactive dialog dispatched from that instance.

Construction validates positions, finite non-negative durations, positive integer capacity, and CSS color tokens. Invalid values throw. `configure()` validates runtime changes; attempting to change `container` throws. Configuring tokens or margins needs a DOM.

`Toaster` exposes `semantic`, `loading`, `interactive`, and `custom` dispatchers. `clear()` dismisses non-interactive categories only. `destroy()` is idempotent; it dismisses active/queued work, closes dialogs, restores focus when possible, removes owned DOM/listeners/timers/styles, and makes later calls throw.

## Dispatchers

`SemanticDispatcher` provides `show()` and `success()`, `error()`, `warning()`, and `info()` helpers plus category `clear()`. `SemanticType` contains those four variants. Success/info default to role `status`; error/warning default to `alert`.

`LoadingDispatcher.show(LoadingToastOptions)` creates a `status` toast that does not auto-dismiss; `clear()` dismisses loading toasts. `CustomDispatcher.show()` accepts `CustomToastOptions`; its `clear()` affects only custom toasts.

`InteractiveDispatcher` exposes `confirm`, `prompt`, and `alert`. Calls require a non-empty message and queue FIFO behind one native `<dialog>`. Their `ConfirmOptions`, `PromptOptions`, and `AlertOptions` configure labels, title, backdrop dismissal (default true), action type, classes, and tokens. Prompt adds default value and placeholder.

Queued/visible dismissal resolves confirm as `false`, prompt as `null`, and alert as `undefined`. Native dialog setup failures reject `result`, clean up, and allow the next queued dialog to run.

## Handles and Queueing

`ToastHandle` provides `dismiss()`, `update(ToastUpdateOptions)`, `settled`, `state`, and `onShow`/`onShown`/`onHide`/`onHidden` subscriptions. Lifecycle subscriptions return unsubscribe functions; late registration after an event runs immediately. `update()` can replace message, tokens, or consumer classes; sent to a visible toast, it applies immediately, and sent to a still-queued one, it is stored and applied once a slot opens rather than discarded. It has no effect once the toast has settled.

`InteractiveToastHandle<T>` provides `dismiss()`, `settled`, `state`, and `result`. `ToastState` is `"queued" | "visible" | "hiding" | "hidden"`.

At capacity, a new non-interactive toast queues and the oldest _eligible_ active toast is dismissed to make room; admission is FIFO. A toast that is a loader, hovered, or focused is protected and never evicted for this — if every active toast is protected, the new one simply waits queued instead. Lowering `maxVisible` at runtime through `configure()` reconciles existing occupancy the same way: eligible toasts are dismissed down to the new limit, but a limit lowered below the number of currently protected toasts is not enforced by evicting one of them, and any newly-freed slots admit queued work immediately. Queued toasts can be dismissed before rendering. Auto-dismiss starts after entrance, pauses for hover/focus, and resumes with the remaining duration. `settled` resolves after removal and cleanup.

## Options and Tokens

`SemanticToastOptions`, `LoadingToastOptions`, and `CustomToastOptions` provide their required message/content and applicable `ToastPosition`, duration, dismissal, `ToastRole`, margin, class, and token fields. Messages and string content must be non-empty; durations must be finite and at least zero. Category fallback types are `SemanticDefaults`, `LoadingDefaults`, and `CustomDefaults`.

`ToastPosition` supports corners, top/bottom center, and center. `ToastTokens` exposes optional colors for semantic variants (including their edge/border), surface/border/text, and dialog action fill, hover, and edge/border states. Values are validated with `CSS.supports` when available and declaration delimiters are always rejected. Instance tokens use an owned scoped stylesheet; per-toast/dialog tokens stay element-scoped.

## SSR and Browser Lifecycle

Construction is SSR-safe unless it must apply initial tokens. Rendering, interactive calls, and DOM-dependent reconfiguration require a document and throw without one. The configured container determines the owner document and cannot change. Interactive APIs require native `HTMLDialogElement.showModal()` and `close()`; prompt focus requires `requestAnimationFrame`, and listener cleanup uses `AbortController`.

Animations use the Web Animations API when available and complete immediately when it is absent or throws. `matchMedia`, when available, disables motion for `prefers-reduced-motion: reduce`. A canceled animation (entrance or exit) completes the same lifecycle step a finished one would, rather than leaving the toast stuck mid-transition.

Built-in icons and the dismiss control are constructed with DOM APIs rather than parsed from a markup string, so they render under a host `require-trusted-types-for 'script'` Content Security Policy with no default policy configured. A rendering failure — including one a host security policy causes — releases the toast's reserved stack slot and reports the error rather than leaving the slot permanently unavailable. The custom-content string path (see [Accessibility and custom content](accessibility-and-content.md)) still parses markup and needs its own Trusted Types policy under that same enforcement.

## Public Exports

The root exports `createToaster`; `Toaster`, `SemanticDispatcher`, `LoadingDispatcher`, `InteractiveDispatcher`, `CustomDispatcher`, `ToasterConfig`, `ToasterRuntimeConfig`, `ToastHandle`, `InteractiveToastHandle`, `ToastUpdateOptions`, `ToastState`, `ToastPosition`, `ToastRole`, `ToastLifecycleSubscriber`, `ToastTokens`, `SemanticToastOptions`, `SemanticType`, `LoadingToastOptions`, `CustomToastOptions`, `ConfirmOptions`, `PromptOptions`, `AlertOptions`, `SemanticDefaults`, `LoadingDefaults`, `CustomDefaults`, and `ToastContent` are public types.
