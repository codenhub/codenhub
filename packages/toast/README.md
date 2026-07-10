# @codenhub/toast

A robust and intuitive toast manager package for Codenhub interfaces. It provides semantic, loading, and interactive alert/confirm/prompt support using native `<dialog>` elements and instance-scoped customization.

## Installation

```sh
pnpm add @codenhub/toast
npm install @codenhub/toast
```

## Features

- **Independent Toaster Instances**: Exposes a `createToaster()` factory to instantiate fresh, isolated toaster managers.
- **Instance-Scoped Styling**: Scopes CSS variable token overrides directly to each toaster's elements via unique attributes to avoid global stylesheet contamination.
- **Promise-Based Dialogs**: Interactive `confirm()`, `prompt()`, and `alert()` modals return handles containing Promises resolving upon user interaction. They support clean programmatic dismissal.
- **HTML Sanitization**: Automatic builtin sanitization for custom HTML toasts to protect against Cross-Site Scripting (XSS).

## Usage

First, import the styles in your main CSS or layout entrypoint:

```ts
import "@codenhub/toast/styles";
```

### Basic Notifications

```ts
import { createToaster } from "@codenhub/toast";

const toaster = createToaster();

// Basic notifications
toaster.semantic.success("Changes saved successfully!");
toaster.semantic.error("Failed to load resources.");
toaster.semantic.warning("Please check your configuration.");
toaster.semantic.info("System will undergo maintenance in 10 minutes.");
```

### Loading State

```ts
// Loading toasts stay visible until explicitly hidden
const loader = toaster.loading.show({ message: "Processing transaction..." });

try {
  await processPayment();
  loader.dismiss();
  toaster.semantic.success("Payment complete!");
} catch (err) {
  loader.dismiss();
  toaster.semantic.error("Payment failed.");
}
```

### Interactive Dialogs

```ts
// Confirm dialog (Promise-based)
const confirmHandle = toaster.interactive.confirm("Are you sure you want to delete this project?", {
  confirmLabel: "Delete Project",
  cancelLabel: "Keep Project",
  shouldBackdropDismiss: true,
});

const userConfirmed = await confirmHandle.result;
if (userConfirmed) {
  await deleteProject();
  toaster.semantic.success("Project deleted.");
}

// Prompt dialog (Promise-based)
const promptHandle = toaster.interactive.prompt("Enter your new project name:", {
  defaultValue: "New Project",
  placeholder: "My Workspace",
  shouldBackdropDismiss: true,
});

const name = await promptHandle.result;
if (name !== null) {
  toaster.semantic.success(`Project "${name}" created.`);
}

// Alert dialog (Promise-based)
const alertHandle = toaster.interactive.alert("This action cannot be undone.");
await alertHandle.result;
```

---

## Reference

### `@codenhub/toast`

Primary entrypoint for the package's default public API.

```ts
import { createToaster, Toast, SemanticToast, LoadingToast } from "@codenhub/toast";
```

#### `createToaster()`

Creates and returns a new independent `Toaster` instance controller.

```ts
function createToaster(config?: ToasterConfig): Toaster;
```

| Parameter | Type            | Description                              |
| --------- | --------------- | ---------------------------------------- |
| `config`  | `ToasterConfig` | Optional global configuration overrides. |

Returns `Toaster` instance.

#### `Toaster` Interface

Provides namespaces to dispatch different styles of toasts, clear them, or reconfigure them.

```ts
interface Toaster {
  readonly semantic: SemanticDispatcher;
  readonly loading: LoadingDispatcher;
  readonly interactive: InteractiveDispatcher;
  readonly custom: CustomDispatcher;

  clear(): void;
  configure(config: Partial<ToasterConfig>): void;
  destroy(): void;
}
```

| Method      | Parameters                       | Returns | Description                                     |
| ----------- | -------------------------------- | ------- | ----------------------------------------------- |
| `clear`     | None                             | `void`  | Dismisses all active non-interactive toasts.    |
| `configure` | `config: Partial<ToasterConfig>` | `void`  | Updates configurations dynamically at runtime.  |
| `destroy`   | None                             | `void`  | Fully cleans up DOM, styles, and active toasts. |

#### `ToastHandle` Interface

Control handle returned when dispatching a toast to allow programmatic control.

```ts
interface ToastHandle {
  dismiss(): void;
  update(options: ToastUpdateOptions): void;
  readonly settled: Promise<void>;
  readonly state: ToastState;
}
```

| Property/Method | Type                                 | Description                                                                 |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `dismiss()`     | `() => void`                         | Programmatically triggers the exit animation and hides the toast.           |
| `update()`      | `(opts: ToastUpdateOptions) => void` | Updates message text, styles, or classes of a visible toast in place.       |
| `settled`       | `Promise<void>`                      | Resolves when the exit animation completes and element is removed from DOM. |
| `state`         | `ToastState`                         | Current lifecycle state of the toast (`"visible" \| "hiding" \| "hidden"`). |

#### `InteractiveToastHandle<T>` Interface

Extends `ToastHandle`. Returned by interactive confirm, prompt, and alert modals.

```ts
interface InteractiveToastHandle<T> extends ToastHandle {
  readonly result: Promise<T>;
}
```

| Property | Type         | Description                                                                                   |
| -------- | ------------ | --------------------------------------------------------------------------------------------- |
| `result` | `Promise<T>` | Resolves with user selection: `boolean` (confirm), `string \| null` (prompt), `void` (alert). |

#### `Toast` Class

Represents an individual base toast notification instance.

```ts
class Toast {
  constructor(params: { options: RawToastOptions; config: ResolvedToastConfig; parent: HTMLElement });
  show(): void;
  hide(): void;
  update(updateOpts: ToastUpdateOptions): void;
  onShow(subscriber: ToastLifecycleSubscriber): () => void;
  onShown(subscriber: ToastLifecycleSubscriber): () => void;
  onHide(subscriber: ToastLifecycleSubscriber): () => void;
  onHidden(subscriber: ToastLifecycleSubscriber): () => void;
  readonly settled: Promise<void>;
  readonly publicState: ToastState;
}
```

#### `SemanticToast` Class

Extends `Toast`. Pre-styled for semantic notifications (success, error, warning, info) with icon presets and aria-live status roles.

```ts
class SemanticToast extends Toast {
  constructor(params: { options: SemanticRawOptions; config: ResolvedToastConfig; parent: HTMLElement });
}
```

#### `LoadingToast` Class

Extends `Toast`. Preconfigured for progress loader states. Does not auto-dismiss by default.

```ts
class LoadingToast extends Toast {
  constructor(params: { options: LoadingToastOptions; config: ResolvedToastConfig; parent: HTMLElement });
}
```

---

## Token Customization

`@codenhub/toast` supports flexible styling through CSS custom properties. By default, it integrates with `@codenhub/styles` but works standalone using fallback styles.

### Customization Options

Pass CSS variable color values to `tokens` globally or individually.

#### Global Customization

```ts
const toaster = createToaster({
  tokens: {
    success: "#22c55e",
    successSubtle: "#f0fdf4",
    successStrong: "#14532d",
  },
});
```

This dynamically injects a `<style>` element targeting only elements scoped to this toaster instance.

---

## Examples

### Lifecycle Callback Subscriptions

You can subscribe to lifecycle hooks to chain asynchronous logic or trigger cleanup:

```ts
const handle = toaster.semantic.success("Process started");

handle.onShow(() => console.log("Toast requested to show"));
handle.onShown(() => console.log("Toast entrance animation complete"));
handle.onHide(() => console.log("Toast exit animation started"));
handle.onHidden(() => console.log("Toast fully removed from the DOM"));

// Await completion programmatically
await handle.settled;
console.log("Toast cycle fully finished.");
```

---

## Requirements

- **DOM Environment**: Runs only in browser/DOM environments.
- **Styles Dependency**: Integrates with `@codenhub/styles` (peer dependency `>=0.0.4`), but falls back gracefully to standalone hex styling if the styles package is not present.
- **CSS Import**: Requires importing `@codenhub/toast/styles` (or compiling Tailwind CSS with `@source` directories pointing to `@codenhub/toast` source files).

## Accessibility & WCAG

- **ARIA Roles**: Semantic toasts use appropriate ARIA roles (`status` for success/info, `alert` for error/warning) to notify assistive technologies.
- **Aria Live**: Toasts use `aria-live="polite"` (status) or `aria-live="assertive"` (alert) with `aria-atomic="true"` to ensure screen readers receive updates cleanly.
- **Focus Preservation**: Modals (`confirm`, `prompt`, `alert`) leverage the native `<dialog>` element. Focus is trapped within the active dialog using standard browser behavior. Upon dismissal, focus is restored to the initiating element.
- **Pause on Interaction**: Active toasts automatically pause their auto-dismiss timers on mouse hover (`mouseenter`) and keyboard focus (`focusin`) to allow users sufficient time to read or interact with the toast, resuming only after mouse/focus leaves.

---

## Notes

- **HTML Sanitization Whitelist**: Custom HTML toasts are sanitized against XSS. Allowed tags: `div`, `p`, `span`, `b`, `i`, `strong`, `em`, `pre`, `code`, `a`, `ul`, `ol`, `li`, `br`. Allowed attributes: `class`, `id`, `style`, `target`, `rel`, and `href` (URL schemes are restricted to block `javascript:`, `data:`, and `vbscript:` URLs).
- **Dialog Serialization**: Multiple concurrent modal calls (`alert`, `confirm`, `prompt`) are queued using a FIFO scheduler and resolve sequentially.

---

## License

This project is licensed under the [Apache-2.0](LICENSE) license.

It includes third-party SVG icons from [Lucide](https://lucide.dev) which are licensed under the [ISC License](https://github.com/lucide-dev/lucide/blob/main/LICENSE). See the [NOTICE](NOTICE) file for details.
