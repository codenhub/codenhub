---
title: Reference
---

# API, CSS, and lifecycle

## Public Entrypoints

- `@codenhub/toaster` exports default singletons `toast` and `dialog`, instance factory `createToaster`, and all public types.
- `@codenhub/toaster/styles` exports required prebuilt CSS for layout, variants, dialogs, animation, and responsive behavior.

Import the stylesheet once. The optional `@codenhub/styles >=0.3.0` peer can supply shared variables; this package's own generated defaults allow standalone use. No Tailwind consumer configuration is required. When `@codenhub/styles` is present, every radius and border-width reads its base token first (`--radius-control`, `--radius-surface`, `--border-width`) — matching `box.css`/`surface.css`'s own fallback chain — before falling back further to toaster's own fixed values when `@codenhub/styles` isn't installed at all. An active aesthetic (e.g. `.glass`, `.neobrutalism`) layers its material tokens (`--ui-radius`, `--ui-border-width`, `--ui-surface-shadow`, `--ui-clip`, `--ui-elevation`) on top of that base, generically: toaster's CSS reads the same `--ui-*` custom properties any real styles component reads, so it needs no per-aesthetic code to pick them up.

Every color composes live, the same formula `@codenhub/styles`' own `box.css` runs: an intent input (`--color-<name>`/`-contrast`/`-strong`, live when `@codenhub/styles` is present) is mixed against the presentation axis (`--ui-fill`, capped by the intent's own fill ceiling) to produce a background, with the edge and on-fill contrast derived the same way `box.css` derives them. A runtime change to a `--color-*` token, or to the presentation/aesthetic classes in scope, reaches an already-rendered toast or dialog button the same way it reaches a real `.alert` or `.btn`. When `@codenhub/styles` isn't installed, the identical formula runs against this package's own generated, uncomposed inputs (`generated-defaults.css`, produced by `scripts/generate-toast-defaults.mjs` from `@codenhub/styles`' real palette at generate time), so standalone rendering stays close to identical with nothing hand-typed to drift from the real thing.

The toast body composes like `.alert`'s own unstyled default: a soft (12%), edged surface grounded on the page background, no elevation. The dialog's action buttons compose like `.btn`'s own unstyled default instead: solid (100%), edgeless, raised (elevation 1), grounded on transparent. Neither is toaster's own choice to make up; both mirror the same registry defaults `.alert` and `.btn` themselves declare.

Presentation (`.solid`, `.soft`, `.ghost`, `.edged`, `.edgeless`) is a plain, inheriting custom-property class matching `@codenhub/styles`' own `presentation.css` exactly (`.solid` sets `--ui-fill: 100%`, and so on) — restated as a standalone shim so it also works with no `@codenhub/styles` on the page. Because it is an ordinary custom property, a class on the toast or dialog element itself always wins over one only an ancestor carries, the same rule any real styles component follows, and arbitrary `--ui-fill`/`--ui-border` percentages set directly (not only these five named classes) are honored too. A consumer's own `ToastTokens` color always wins over the composed result for the property it sets. The dialog container and its cancel button carry no severity of their own, so they read a flat, live-first surface/text/border token instead of running the intent formula. The dialog's action buttons additionally each expose their own edge token (`primaryEdge`/`secondaryEdge`/`successBtnEdge`/`errorBtnEdge`) that wins over the composed edge under `.edged`, matching the toast body's own per-severity edge tokens; the cancel button gets the same `.edged` treatment via the flat border token. Two further surfaces opt out for legibility: the dialog's text input keeps its border regardless of `.edgeless` and its background stays transparent regardless of presentation, and its `:focus-visible` ring reuses the primary action button's own color chain rather than a hand-picked literal. Toast entrance/exit animation duration and easing read `--motion-duration-slow`/`--motion-ease` live too, falling back to this package's own default timing when unset.

The dialog's action buttons render as native `<button>` elements. If a consumer also loads `@codenhub/styles`' classless native-element mappings (`@codenhub/styles/native` or `@codenhub/styles/tw/native`), that stylesheet resets every bare `button` to the neutral intent at zero specificity — the same specificity toaster's own dialog-button rules use. Import order decides which wins: import the native mappings before `@codenhub/toaster/styles`, not after, or a dialog button's intent styling is silently reset to neutral.

Dark-mode styling activates under a `.dark` class or `data-theme="dark"` attribute on an ancestor (usually `<html>`) — the same DOM contract `@codenhub/theme` produces. Toaster has no dependency on `@codenhub/theme`; any mechanism that sets those attributes works. Because `@codenhub/styles`' color tokens resolve through `light-dark()` against the consuming element's own computed `color-scheme`, and this package's own generated defaults resolve the same way, a `.light`/`.dark` section nested inside an oppositely-themed ancestor resolves its own toasts and dialogs correctly, not just the document root.

A restrictive `style-src` Content Security Policy that blocks an unnonced inline `<style>` element can supply `ToasterConfig.nonce`; it is applied to the `<style>` element instance color tokens (`ToasterConfig.tokens`) are written through. A stylesheet that fails to initialize under CSP throws and leaves no owned node behind.

## Create and Configure

`createToaster(config?): Toaster` creates an independent instance. Defaults are position `"top-right"`, `maxVisible: 5`, duration `4000`, no dismiss button, and auto-dismiss enabled. `ToasterConfig` also accepts a fixed `container`, color `tokens`, a CSP `nonce` for the token stylesheet, margin, `className`, instance-level `labels`, and semantic/loading/custom category defaults. `ToasterRuntimeConfig` is the same partial shape without `container`.

`ToastLabels` sets instance-level default text for the dismiss button (`dismiss`) and the dialog action buttons (`confirm`, `cancel`, `submit`, `ok`) -- localization without repeating the same option on every `confirm`/`prompt`/`alert` call. A per-call label (`ConfirmOptions.confirmLabel`, etc.) still wins over its matching `labels` entry, the same precedence `position` and `duration` already have between `ToasterConfig` and a per-call option; an unset field falls back to this package's own built-in English text.

Margin is a property of the shared stack at a position, not of an individual toast: the most recently dispatched explicit value applies to every toast already showing at that position, and a dispatch that omits `margin` leaves the stack's current margin unchanged. Its own default (used only while nothing has set an explicit value) floors at `env(safe-area-inset-*)`, so a corner stack does not render underneath a device notch or home indicator; an explicit `margin` always wins outright and is not combined with the inset.

Unlike `position` and `duration`, a config-level `className` is not overridden by a per-call `className` — the two are appended (config first, then the call's own class) on every toast and every interactive dialog dispatched from that instance.

Construction validates positions, finite non-negative durations, positive integer capacity, and CSS color tokens. Invalid values throw. `configure()` validates runtime changes; attempting to change `container` throws. Configuring tokens or margins needs a DOM.

`Toaster` is a callable function (`toast("Message")` or `toast({ message: "..." })`) that also exposes methods for variants (`success`, `error`, `warning`, `info`), states (`loading`, `custom`, `promise`), queue management (`clear`, `dismiss`), and dialogs (`dialog`).

`clear()` dismisses all visible toasts. `dismiss(handle?)` dismisses the specified toast when given a handle, or all active toasts when called without arguments.

`destroy()` is idempotent; it dismisses active/queued work, closes dialogs, restores focus when possible, removes owned DOM/listeners/timers/styles, and makes later calls throw. Dismissal through `destroy()` is immediate and synchronous: every handle settles (`state` becomes `"hidden"` and `settled` resolves) before `destroy()` returns, canceling any in-flight entrance or exit animation rather than waiting for one that nothing is left to see complete on its own -- unlike a normal `dismiss()`/`hide()`, which still animates.

Each instance owns a fully separate stack, dialog controller, and DOM, with no coordination between instances: two instances configured to the same position render two independent, potentially overlapping stacks, and two instances can each open a native dialog at the same time (each is a real top-layer modal, so both are visible and independently focusable). Reaching for two `Toaster` instances in the same app -- rather than one, configured per dispatch with a per-call `position`/`container` override -- is what produces this; keeping them at different positions/containers avoids the overlap, and there is no dedicated cross-instance API for it. A toast rendered outside the top layer is subject to the platform's own modal semantics while any dialog (from the same instance or another) is open with `showModal()`: the browser makes the rest of the document inert, so a background toast's dismiss button stops being clickable and assistive technology stops reaching it, resuming once every open dialog closes. This is standard `<dialog>` behavior, not something toaster adds or can opt out of.

## Toast Methods and Dispatchers

The callable `Toaster` surface exposes:

- `toaster(message, options?)` / `toaster(options)`: Dispatches a neutral default toast.
- `toaster.success(message, options?)`: Dispatches a success toast (default role `status`, green intent).
- `toaster.error(message, options?)`: Dispatches an error toast (default role `alert`, red intent).
- `toaster.warning(message, options?)`: Dispatches a warning toast (default role `alert`, yellow intent).
- `toaster.info(message, options?)`: Dispatches an info toast (default role `status`, blue intent).
- `toaster.loading(message?, options?)`: Dispatches a persistent loading toast with an SVG spinner (`status` role, does not auto-dismiss).
- `toaster.custom(content, options?)`: Dispatches a toast with custom HTML string, DOM Node, or node factory function.
- `toaster.promise(promise, options)`: Binds notification state to a Promise lifecycle, automatically transitioning from loading to success or error and re-arming auto-dismiss. Returns the original Promise result.
- `toaster.dialog`: Exposes interactive browser dialogs (`confirm`, `prompt`, `alert`).
- `toaster.clear()`: Dismisses all visible and queued toasts.
- `toaster.dismiss(handle?)`: Dismisses a specific toast if a handle is passed, or all active toasts when omitted.

`DialogDispatcher` exposes:

- `dialog.confirm(message, options?)`: Shows a modal confirm dialog, resolving to `boolean`.
- `dialog.prompt(message, options?)`: Shows a modal input prompt, resolving to `string | null`.
- `dialog.alert(message, options?)`: Shows a modal alert, resolving to `void`.

All dialog methods return an `InteractiveToastHandle<T>` implementing `PromiseLike<T>`, enabling both direct `await dialog.confirm(...)` and capturing the handle for programmatic dismissal or state tracking.

## Structured Content and Actions

Toasts support rich structured options:

- `title?: string`: Primary heading line.
- `message?: string`: Core message text. When `description` is absent, `title ?? message` serves as the primary text.
- `description?: string`: Secondary detail text rendered beneath the title.
- `action?: ToastAction`: An inline button with `{ label: string, onClick: (event: MouseEvent, handle: ToastHandle) => void }`. Explicitly calling `handle.dismiss()` closes the toast.
- `dismissible?: boolean`: Whether to render a close button (aliased as `closeButton`).
- `autoDismiss?: boolean`: Whether the toast closes automatically after `duration`.

## Handles and Queueing

`ToastHandle` provides:

- `dismiss()`: Starts toast exit animation.
- `update(ToastUpdateOptions)`: Replaces text (`title`, `message`, `description`), `action`, `content`, `icon`, severity `type`, `duration`, `autoDismiss`, `dismissible`, `tokens`, or `className`.
- `settled`: Promise resolving when the toast exits and is removed from the DOM.
- `state`: Public lifecycle state (`"queued" | "visible" | "hiding" | "hidden"`).
- `onShow(fn)`, `onShown(fn)`, `onHide(fn)`, `onHidden(fn)`: Lifecycle event listeners.

`InteractiveToastHandle<T>` implements `PromiseLike<T>` and provides:

- `then()`, `catch()`, `finally()`: Direct awaitable promise interface.
- `dismiss()`: Closes the dialog, settling the result promise with the cancel fallback (`false`, `null`, `undefined`).
- `settled`: Promise resolving when dialog DOM cleanup completes.
- `state`: Lifecycle state (`"queued" | "visible" | "hiding" | "hidden"`).
- `result`: Raw promise resolving to `T`.

At capacity (`maxVisible`), a new non-interactive toast queues FIFO and the oldest eligible active toast is dismissed to make room. Toasts marked as loaders, hovered, or focused are protected from eviction.

If more simultaneous toasts are showing at one position than fit in the viewport, the stack scrolls internally without showing scrollbars. Anchored toasts stay flush against the viewport edge. Dismissing a focused toast restores focus to the prior active element.

## Options and Tokens

`ToastOptions` provides optional structured fields (`title`, `description`, `action`), positioning, duration, dismissal, role, margin, class, and token overrides.

`ToastPosition` supports corners (`top-left`, `top-right`, `bottom-left`, `bottom-right`), top/bottom center (`top-center`, `bottom-center`), and `center`.

`ToastTokens` exposes optional colors for semantic variants:

- Success: `successBg`, `successFg`, `successEdge`, `successBtnBg`, `successBtnFg`, `successBtnEdge`
- Error: `errorBg`, `errorFg`, `errorEdge`, `errorBtnBg`, `errorBtnFg`, `errorBtnEdge`
- Warning: `warningBg`, `warningFg`, `warningEdge`, `warningBtnBg`, `warningBtnFg`, `warningBtnEdge`
- Info: `infoBg`, `infoFg`, `infoEdge`, `infoBtnBg`, `infoBtnFg`, `infoBtnEdge`
- Common: `surface`, `border`, `text`, `primaryBtnBg`, `primaryBtnFg`, `primaryEdge`, `secondaryBtnBg`, `secondaryBtnFg`, `secondaryEdge`

## SSR and Browser Lifecycle

Construction is SSR-safe unless initial tokens need the DOM. Rendering, interactive calls, and DOM-dependent reconfiguration require a document and throw without one. Interactive APIs require native `HTMLDialogElement.showModal()` and `close()`.

Animations use the Web Animations API when available and complete immediately when it is absent or throws. `matchMedia`, when available, disables motion for `prefers-reduced-motion: reduce`.

Built-in icons and the dismiss control are constructed with DOM APIs rather than parsed from markup strings, rendering safely under strict Content Security Policies.

## Public Exports

The root exports `toast`, `dialog`, and `createToaster`.

Public types include `Toaster`, `DialogDispatcher`, `ToasterConfig`, `ToasterRuntimeConfig`, `ToastHandle`, `InteractiveToastHandle`, `ToastUpdateOptions`, `ToastOptions`, `ToastAction`, `PromiseToastOptions`, `ToastState`, `ToastPosition`, `ToastRole`, `ToastLifecycleSubscriber`, `ToastTokens`, `ToastLabels`, `SemanticType`, `LoadingToastOptions`, `CustomToastOptions`, `ConfirmOptions`, `PromptOptions`, `AlertOptions`, `SemanticDefaults`, `LoadingDefaults`, `CustomDefaults`, and `ToastContent`.
