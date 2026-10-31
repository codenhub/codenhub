# @codenhub/error

Turn whatever your TypeScript code catches into one predictable `AppError`: a message that is safe to show, a translation key, a code to branch on, a flag that says whether retrying is safe, and the original value kept for your logs. You describe the failures you know about once, in a registry; opt-in presets cover common browser, Node.js, and Supabase failures. Result helpers are included for code that prefers returning failures to throwing them.

## Installation

```sh
pnpm add @codenhub/error
```

## Usage

Describe your failures once, when the application starts, then normalize anything you catch:

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";
import { browserErrorRegistry } from "@codenhub/error/registries/browser";

const registry = getErrorRegistry();

registry.merge(browserErrorRegistry);
registry.codes.add("cart.out_of_stock", {
  message: "One of the items in your cart just sold out. Review your cart, then check out again.",
  messageKey: "error.cart.outOfStock",
});

try {
  await checkout(cart);
} catch (caught) {
  const error = createAppError(caught);

  showToast(error.message);
}
```

A failure nobody registered becomes `type: "unknown"` with the message `"An unexpected error occurred."`, never its raw text.

## Documentation

- [Overview](docs/index.md): what the package does and a five-minute tour.
- [Getting started](docs/getting-started.md): set up a real application step by step.
- [Recipes](docs/recipes.md): HTTP status codes, Supabase, retries, translations, and error reporting.
- [Caveats and limitations](docs/caveats.md): what the package does not do, and the workarounds.
- [API reference](docs/reference/index.md): every export, generated from the source.

## Requirements

- Node.js 24 or newer, or an ES2022-compatible browser, worker, or edge runtime with native `Error` `cause` support.
- ESM. CommonJS can load it with `require()` on runtimes that support requiring ES modules.
- No runtime dependencies, and no access to browser or Node.js globals.

## Notes

- Presets change nothing until you merge them, and the last mapping added for an identifier wins.
- The global registry is shared module state: configure it once at startup, not per request.
- `isRetryable` means the failed call cannot run twice if repeated, not that a retry will likely work. Retry only around the call that failed.
- Built-in `messageKey` values are stable; the package ships English messages only.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
