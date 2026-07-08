# @codenhub/toast

A robust and intuitive factory singleton toast manager for Codenhub interfaces. It provides semantic, loading, and interactive alert/confirm/prompt support.

## Installation

```sh
pnpm add @codenhub/toast
npm install @codenhub/toast
```

## Features

- **Factory Singleton**: Exposes a `createToaster()` factory function which lazy-initializes a single global `Toaster` manager.
- **Promise-Based Dialogs**: Interactive `confirm()`, `prompt()`, and `alert()` return Promises that resolve upon user interaction.
- **Semantic Types**: Pre-styled semantic variants for `success`, `error`, `warning`, and `info`.
- **Async Loader**: Easily show persistent loading indicators that can be programmatically dismissed.

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
toaster.success("Changes saved successfully!");
toaster.error("Failed to load resources.");
toaster.warning("Please check your configuration.");
toaster.info("System will undergo maintenance in 10 minutes.");
```

### Loading State

```ts
const loader = toaster.loading("Processing transaction...");

try {
  await processPayment();
  loader.hide();
  toaster.success("Payment complete!");
} catch (err) {
  loader.hide();
  toaster.error("Payment failed.");
}
```

### Interactive Dialogs

```ts
// Confirm dialog (Promise-based)
const userConfirmed = await toaster.confirm("Are you sure you want to delete this project?", {
  confirmLabel: "Delete Project",
  cancelLabel: "Keep Project",
});

if (userConfirmed) {
  await deleteProject();
  toaster.success("Project deleted.");
}

// Prompt dialog (Promise-based)
const name = await toaster.prompt("Enter your new project name:", "New Project", {
  placeholder: "My Workspace",
});

if (name !== null) {
  toaster.success(`Project "${name}" created.`);
}

// Alert dialog (Promise-based)
await toaster.alert("This action cannot be undone.");
```

## Reference

### `@codenhub/toast`

Primary entrypoint for the package's public API.

```ts
import { createToaster, Toast } from "@codenhub/toast";
```

#### `createToaster()`

Lazy-initializes and returns the singleton `Toaster` instance. Calling it again returns the same instance. Passing a configuration updates the singleton's settings.

```ts
function createToaster(config?: ToasterConfig): Toaster;
```

#### `Toaster` Interface

```ts
interface Toaster {
  /** Display a generic or custom toast */
  showToast(options: ToastOptions): Toast;

  /** Short-hand semantic methods */
  success(message: string, options?: Partial<ToastOptions>): Toast;
  error(message: string, options?: Partial<ToastOptions>): Toast;
  warning(message: string, options?: Partial<ToastOptions>): Toast;
  info(message: string, options?: Partial<ToastOptions>): Toast;
  loading(message: string, options?: Partial<ToastOptions>): Toast;

  /** Interactive dialogs returning Promises */
  confirm(message: string, options?: ConfirmToastOptions): Promise<boolean>;
  prompt(message: string, defaultValue?: string, options?: PromptToastOptions): Promise<string | null>;
  alert(message: string, options?: AlertToastOptions): Promise<void>;

  /** Dismiss all active and queued toasts */
  clear(): void;

  /** Update configuration settings */
  configure(config: ToasterConfig): void;
}
```

## Token Customization

`@codenhub/toast` supports flexible styling through CSS custom properties. By default, it integrates seamlessly with `@codenhub/styles` (available as an optional peer dependency) but functions standalone using fallback design tokens.

The design system uses a three-tier cascade to resolve colors:

1. **Toast Token Override** (`--toast-color-*`): Applied via configuration or option settings.
2. **Global Style Token** (`--color-*`): Provided automatically when `@codenhub/styles` is present in the document.
3. **Hardcoded Fallback**: Standard default styling used when no overrides or peer styles are present.

### Customization Options

You can override colors globally for all toasts, or customize them per-toast at dispatch time.

#### Global Customization

Pass a `tokens` object when calling `createToaster` or `configure`:

```ts
import { createToaster } from "@codenhub/toast";

const toaster = createToaster({
  tokens: {
    success: "#22c55e",
    successSubtle: "#f0fdf4",
    successStrong: "#14532d",
  },
});
```

This dynamically injects a `<style>` element into the document head targeting `:root`.

#### Per-Toast Customization

Pass `tokens` as part of the toast options on individual calls:

```ts
toaster.success("Special Success Notification", {
  tokens: {
    success: "#e11d48", // Customize colors for this specific toast only
    successSubtle: "#fff1f2",
    successStrong: "#4c0519",
  },
});
```

### Available Tokens

The `ToastTokens` interface exposes the following properties:

- `success`, `successSubtle`, `successStrong`
- `destructive`, `destructiveSubtle`, `destructiveStrong`
- `warning`, `warningSubtle`, `warningStrong`
- `info`, `infoSubtle`, `infoStrong`
- `border`, `surface`, `text` (used for the default/alert/confirm/prompt toast shapes)

## Requirements

- **DOM Environment**: Runs only in browser/DOM environments.
- **CSS Import**: Requires importing `@codenhub/toast/styles` (or compiling Tailwind with `@source` directories pointing to `@codenhub/toast` source files). Optionally pair with `@codenhub/styles` for unified design system synchronization.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
