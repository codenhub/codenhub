---
title: Reference
---

# API, CSS, and lifecycle

## Public Entrypoints

- `@codenhub/toaster` exports `createToaster` and all public types.
- `@codenhub/toaster/styles` exports required prebuilt CSS for layout, variants, dialogs, animation, and responsive behavior.

Import the stylesheet once. The optional `@codenhub/styles >=0.0.4` peer can supply shared variables; fallback colors allow standalone use. No Tailwind consumer configuration is required. When `@codenhub/styles` is present, every radius and border-width reads its base token first (`--radius-control`, `--radius-surface`, `--border-width`) — matching `box.css`/`surface.css`'s own fallback chain — before falling back further to toaster's own fixed values when `@codenhub/styles` isn't installed at all. An active aesthetic (e.g. `.glass`, `.neobrutalism`) layers its material tokens (`--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`) on top of that base.

An active presentation (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) cascades its fill/text/border tokens (`--ui-fill`, `--ui-fg-on-fill`, `--ui-border`) into the toast body and the dialog's primary/secondary/success/danger action buttons, composed with `color-mix()` the same way `@codenhub/styles`' own components read them — no dependency is introduced. That composition also reads `--intent-fill-max` (each named severity restates it at `100%` to opt out of the package's neutral 20% slab-prevention cap, matching how `@codenhub/styles`' own named intents opt out) and `--ui-bg-alpha` (the `.glass` aesthetic's fill-thinning multiplier), in that order, the same two-stage way `box.css` does.

Like every `@codenhub/styles` component, the toast body and the dialog's action buttons each declare their own registry defaults for that formula — what `box.css` calls `--_d-fill` and `--_d-ground` — rather than sharing one package-wide constant; `@codenhub/styles` itself has no single answer here: `.btn` rests on transparent, `.alert`/`.card`/`.panel` rest on the opaque neutral page background, and the closest analog to a floating, non-page-anchored toast — `.tooltip-bubble`/`.tooltip-icon` — rests on `--intent-subtle`, its own opaque, intent-tinted token, specifically so a cascaded `.ghost` stays legible over content nobody chose.

The dialog's action buttons ground the formula at literal `transparent`, matching `.btn` exactly — verified directly against a live `.btn.soft`/`.btn.ghost`: identical composed color at every fill level, no override needed, because a dialog button is an ordinary interactive control sitting on the dialog's own opaque surface, not a floating element in its own right. The toast body grounds it on `--intent-subtle` instead, matching `.tooltip-bubble`/`.tooltip-icon`'s choice rather than `.btn`'s or `.alert`'s, and its own default fill is `12%` — the same number `.soft` sets — so an unstyled toast and a `.soft` toast render identically, the same way an unstyled `.alert` and `.alert.soft` do (verified byte-identical against a live `.alert.soft`). `.solid` needs no special handling either: at 100% fill the ground contributes nothing regardless of what it is. `.ghost` is the one deliberate departure from the toast's own ground: grounding it on `--intent-subtle` (matching `.tooltip-icon` exactly) would render it as the bare subtle token — close enough to the 12%-fill default to read as barely different, and still a background rather than the absence of one. A hover-triggered tooltip favors staying visible under any cascade; a toast is larger, longer-lived, and dismissed on purpose, so full transparency is the toast-specific call here, made explicitly rather than produced as a side effect of a token this package lacks. The dialog container and its cancel button carry no `--intent-color` of their own, so they never ran through the fill formula to begin with; `.ghost`'s literal `transparent` override is their only presentation hook. The dialog container's border still follows the edge axis only (`.edged`/`.edgeless`), not fill, since it carries no severity. Two further surfaces opt out for legibility: the dialog's text input keeps its border regardless of `.edgeless` and its background stays transparent regardless of presentation, and the dialog's cancel button keeps its fixed muted text/border outside of `.ghost`.

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

`ToastPosition` supports corners, top/bottom center, and center. `ToastTokens` exposes optional colors for semantic variants, surface/border/text, and dialog action states. Values are validated with `CSS.supports` when available and declaration delimiters are always rejected. Instance tokens use an owned scoped stylesheet; per-toast/dialog tokens stay element-scoped.

## SSR and Browser Lifecycle

Construction is SSR-safe unless it must apply initial tokens. Rendering, interactive calls, and DOM-dependent reconfiguration require a document and throw without one. The configured container determines the owner document and cannot change. Interactive APIs require native `HTMLDialogElement.showModal()` and `close()`; prompt focus requires `requestAnimationFrame`, and listener cleanup uses `AbortController`.

Animations use the Web Animations API when available and complete immediately when it is absent or throws. `matchMedia`, when available, disables motion for `prefers-reduced-motion: reduce`.

## Public Exports

The root exports `createToaster`; `Toaster`, `SemanticDispatcher`, `LoadingDispatcher`, `InteractiveDispatcher`, `CustomDispatcher`, `ToasterConfig`, `ToasterRuntimeConfig`, `ToastHandle`, `InteractiveToastHandle`, `ToastUpdateOptions`, `ToastState`, `ToastPosition`, `ToastRole`, `ToastLifecycleSubscriber`, `ToastTokens`, `SemanticToastOptions`, `SemanticType`, `LoadingToastOptions`, `CustomToastOptions`, `ConfirmOptions`, `PromptOptions`, `AlertOptions`, `SemanticDefaults`, `LoadingDefaults`, `CustomDefaults`, and `ToastContent` are public types.
