# @codenhub/toast

Instance-based browser toasts and native interactive dialogs. Each
`createToaster()` call owns independent stacks, configuration, dialog queue,
DOM, and token styles.

## Installation

```sh
pnpm add @codenhub/toast
```

Import the required stylesheet once in the application's browser entrypoint:

```ts
import "@codenhub/toast/styles";
```

## Usage

```ts
import { createToaster } from "@codenhub/toast";
import "@codenhub/toast/styles";

const toaster = createToaster();

toaster.semantic.success("Changes saved");
toaster.semantic.error("Could not save changes", { isDismissable: true });

const loading = toaster.loading.show({ message: "Saving..." });
await saveChanges();
loading.dismiss();

const confirmation = toaster.interactive.confirm("Delete this project?", {
  confirmLabel: "Delete",
  type: "danger",
});

if (await confirmation.result) {
  await deleteProject();
}

toaster.destroy();
```

Keep the returned toaster for as long as it is needed and call `destroy()`
when its owning view or application is torn down.

## Reference

### `@codenhub/toast`

The root entrypoint exports the `createToaster` function and the types listed
below. It does not export toast classes or DOM internals.

#### `createToaster()`

```ts
function createToaster(config?: ToasterConfig): Toaster;
```

Creates a new independent instance. Construction is SSR-safe when no
`document` is available. In a browser, initial instance tokens create their
owned stylesheet during construction; without a DOM, that work is deferred
until a rendering operation. Operations that need a parent element throw when
no browser `document` is available.

Initial configuration is validated synchronously. `duration` must be finite
and at least `0`; `maxVisible` must be a positive integer; token values must be
valid CSS colors. Invalid values throw an `Error`.

#### `Toaster`

```ts
interface Toaster {
  readonly semantic: SemanticDispatcher;
  readonly loading: LoadingDispatcher;
  readonly interactive: InteractiveDispatcher;
  readonly custom: CustomDispatcher;
  clear(): void;
  configure(config: ToasterRuntimeConfig): void;
  destroy(): void;
}
```

- `clear()` dismisses semantic, loading, and custom toasts. It does not close
  interactive dialogs.
- `configure()` validates and applies runtime defaults. The `container` is
  immutable after construction: it is excluded from `ToasterRuntimeConfig`,
  and JavaScript callers that provide it receive an `Error`.
- `destroy()` is idempotent. It dismisses active and queued work, closes the
  dialog, removes instance-owned DOM and token styles, aborts dialog listeners,
  and restores focus when possible. Calls through the destroyed toaster or its
  dispatchers throw; create a new instance instead.

#### Dispatchers

```ts
interface SemanticDispatcher {
  show(options: SemanticToastOptions & { type?: SemanticType }): ToastHandle;
  success(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;
  error(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;
  warning(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;
  info(message: string, options?: Omit<SemanticToastOptions, "message">): ToastHandle;
  clear(): void;
}

interface LoadingDispatcher {
  show(options: LoadingToastOptions): ToastHandle;
  clear(): void;
}

interface CustomDispatcher {
  show(options: CustomToastOptions): ToastHandle;
  clear(): void;
}

interface InteractiveDispatcher {
  confirm(message: string, options?: ConfirmOptions): InteractiveToastHandle<boolean>;
  prompt(message: string, options?: PromptOptions): InteractiveToastHandle<string | null>;
  alert(message: string, options?: AlertOptions): InteractiveToastHandle<void>;
}
```

Semantic defaults are `status` for success/info and `alert` for error/warning;
`role` can override them. Loading toasts use `status` and do not auto-dismiss.
Dispatcher `clear()` affects only that non-interactive category.

Interactive calls require a non-empty message and use one native `<dialog>` at
a time. Additional dialogs are FIFO queued with state `"queued"`. Dismissing a
queued or visible confirm resolves `result` to `false`; a prompt resolves to
`null`; an alert resolves to `undefined`. If `showModal()` or dialog setup
fails, `result` rejects with that error, cleanup still settles, and the next
queued dialog is attempted.

#### Handles

```ts
interface ToastHandle {
  dismiss(): void;
  update(options: ToastUpdateOptions): void;
  readonly settled: Promise<void>;
  readonly state: ToastState;
  onShow(subscriber: ToastLifecycleSubscriber): () => void;
  onShown(subscriber: ToastLifecycleSubscriber): () => void;
  onHide(subscriber: ToastLifecycleSubscriber): () => void;
  onHidden(subscriber: ToastLifecycleSubscriber): () => void;
}

interface InteractiveToastHandle<T> {
  dismiss(): void;
  readonly settled: Promise<void>;
  readonly state: ToastState;
  readonly result: Promise<T>;
}
```

`ToastState` is `"queued" | "visible" | "hiding" | "hidden"`. When a stack
reaches `maxVisible`, a new toast is queued and the oldest active toast is
dismissed; queued toasts are admitted in FIFO order. A queued toast can be
dismissed before rendering. `settled` resolves after removal and cleanup.
`update()` changes only a currently visible toast and is otherwise a no-op.
Lifecycle methods return unsubscribe functions; late subscribers to an event
that already occurred are called immediately.

#### Configuration and option types

```ts
interface ToasterConfig {
  position?: ToastPosition;
  container?: HTMLElement;
  maxVisible?: number;
  duration?: number;
  isDismissable?: boolean;
  shouldAutoDismiss?: boolean;
  tokens?: ToastTokens;
  semantic?: SemanticDefaults;
  loading?: LoadingDefaults;
  custom?: CustomDefaults;
  margin?: string | { x?: string; y?: string };
  appearance?: ToastAppearance;
}

type ToasterRuntimeConfig = Omit<Partial<ToasterConfig>, "container">;
```

Defaults are `position: "top-right"`, `maxVisible: 5`, `duration: 4000`,
`isDismissable: false`, `shouldAutoDismiss: true`, and
`appearance: "soft-bordered"`. `container` defaults to `document.body` (or the
document element while the body is unavailable). `SemanticDefaults`,
`LoadingDefaults`, and `CustomDefaults` provide dispatcher fallbacks.
`SemanticDefaults` and `CustomDefaults` support `position`, `duration`,
`isDismissable`, and `shouldAutoDismiss`; `LoadingDefaults` supports `position`
and `isDismissable`.

`SemanticToastOptions`, `LoadingToastOptions`, and `CustomToastOptions` contain
their required `message` or `content` plus the applicable position, duration,
dismissal, tokens, `className`, margin, appearance, and role overrides.
Per-toast durations must also be finite and at least `0`; empty messages or
empty string content throw synchronously. `ToastUpdateOptions` supports
`message`, `tokens`, and `className`.

`ConfirmOptions`, `PromptOptions`, and `AlertOptions` configure title, button
labels, `shouldBackdropDismiss` (default `true`), tokens, `className`, and an
action `type` of `"primary" | "secondary" | "success" | "danger"`. Prompt also
supports `defaultValue` and `placeholder`.

The remaining exported aliases are:

- `ToastPosition`: `"top-left" | "top-right" | "bottom-right" |
"bottom-left" | "top-center" | "bottom-center" | "center"`.
- `ToastRole`: `"alert" | "status"`.
- `ToastLifecycleSubscriber`: lifecycle callback receiving the public handle
  as `ToastHandle`.
- `ToastAppearance`: `"flat" | "soft" | "soft-bordered" | "left-accent"`.
- `SemanticType`: `"success" | "error" | "warning" | "info"`.
- `ToastContent`: `string | Node | (() => string | Node)`.

#### Tokens

`ToastTokens` accepts these optional color values:

```text
success, successContrast, successSubtle, successStrong
destructive, destructiveContrast, destructiveSubtle, destructiveStrong
warning, warningContrast, warningSubtle, warningStrong
info, infoContrast, infoSubtle, infoStrong
border, surface, text
primary, primaryContrast, primaryHover
accent, accentContrast, accentHover
successHover, destructiveHover
```

Every value must be a valid CSS color. Initial and runtime instance tokens are
validated with `CSS.supports("color", value)` when available; empty values and
values containing CSS declaration delimiters are always rejected. Instance
tokens are emitted through an instance-owned scoped stylesheet. Toast and
dialog option tokens are applied only to that element.

### CSS: `@codenhub/toast/styles`

```ts
import "@codenhub/toast/styles";
```

This prebuilt CSS entrypoint is required for layout, variants, dialogs,
animations, and responsive behavior. Its package selectors are scoped by the
instance's `data-toast-instance` attribute, and token overrides are likewise
instance- or element-scoped. No Tailwind source scanning or Tailwind consumer
configuration is required. The optional `@codenhub/styles >=0.0.4` peer can
supply shared variables; standalone fallback colors are included.

## Examples

### Custom content

String content is parsed as HTML and sanitized. A `Node`, or a function that
returns one, is explicitly trusted application-owned content and is inserted
without sanitization.

```ts
toaster.custom.show({
  content: '<strong>Connected</strong> to <a href="/account">your account</a>',
});

const actions = document.createElement("div");
actions.textContent = "Trusted application content";
toaster.custom.show({ content: actions, shouldAutoDismiss: false });
```

The string sanitizer permits only these tags: `a`, `b`, `br`, `code`, `div`,
`em`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `i`, `li`, `ol`, `p`, `pre`, `span`,
`strong`, and `ul`. It permits only `href`, `target`, and `rel` attributes.
Explicit `href` protocols are limited to `http:`, `https:`, `mailto:`, and
`tel:`; relative, fragment, and protocol-relative URLs are retained. `target`
is limited case-insensitively to `_blank` and `_self`. Every `_blank` target
receives `rel="noopener noreferrer"`. `script`,
`style`, `iframe`, `object`, and `embed` elements are removed with their
contents. Other unsupported elements are unwrapped after their descendants are
sanitized.

### Runtime updates

```ts
const handle = toaster.semantic.info("Uploading...", {
  shouldAutoDismiss: false,
});

handle.update({ message: "Upload complete", tokens: { info: "#2563eb" } });
handle.dismiss();
await handle.settled;
```

Auto-dismiss timers start after entrance, pause while hovered or focused, and
resume with the remaining duration.

## Requirements

- Rendering requires a browser DOM. The package has no worker or server-side
  rendering output; defer dispatches and DOM-dependent `configure()` calls
  until the client is available.
- Interactive APIs require native `HTMLDialogElement`, including `showModal()`
  and `close()`. There is no non-modal dialog polyfill or fallback. Native
  dialog behavior provides top-layer modality and focus containment. Prompt
  focus also requires `requestAnimationFrame`; dialog listener cleanup uses
  `AbortController`.
- Toast movement uses the Web Animations API when available. If `animate()` is
  absent or throws, lifecycle cleanup completes immediately without the
  animation.
- `matchMedia()` is optional. When available, the package honors
  `prefers-reduced-motion: reduce` by skipping toast motion, stopping the loader
  animation, and closing dialogs without waiting for transitions. Without it,
  normal animation behavior is used.
- Consumers must import `@codenhub/toast/styles`. No UI framework is required.
- Call `destroy()` to release DOM, listeners, timers, queued dialogs, and
  instance token styles. Individual lifecycle subscriptions can be removed
  with their returned unsubscribe function.

## Notes

- The package supplies semantic roles, live-region attributes, an accessible
  dismiss label, dialog text associations, initial focus, and best-effort focus
  restoration. Consumers remain responsible for meaningful messages, choosing
  an appropriate role, accessible trusted `Node` content and custom classes,
  sufficient token color contrast, and dismissal timing suitable for their
  users.
- Dialog title, message, labels, placeholder, and toast `message` values are
  inserted as text, not HTML.
- Multiple toaster instances are isolated. The configured `container` remains
  fixed for the instance's lifetime and determines the owner document used for
  created DOM.

## License

Licensed under the [Apache License 2.0](LICENSE).

Bundled Lucide SVG icons are licensed under the ISC License. See the package
[NOTICE](NOTICE) for the copyright and license text.
