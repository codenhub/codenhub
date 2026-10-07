# @codenhub/error

Typed error normalization, result helpers, and opt-in registry presets for TypeScript applications.

## Installation

```sh
pnpm add @codenhub/error
```

## Usage

The default global registry starts empty. Register application mappings during initialization, then normalize unknown values into `AppError` instances.

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";

getErrorRegistry().codes.add("invalid_credentials", {
  message: "We couldn't sign you in. The email or password is incorrect. Check them and try again.",
  source: "my-app.auth",
});

const error = createAppError({ code: "invalid_credentials" });
console.log(error.type, error.message);
```

Unmatched values become `type: "unknown"` and use `"An unexpected error occurred."` unless `fallbackMessage` is provided.

## Documentation

- [Documentation overview](docs/index.md)
- [API reference](docs/reference/index.md)
- [Error normalization and registries](docs/error-normalization.md)
- [Result helpers](docs/results.md)

## Requirements

- Node.js 24 or newer, or an ES2022-compatible browser, worker, or edge runtime.
- Native `Error` cause support.
- ESM. CommonJS can load it through `require()` on runtimes that support requiring ES modules.
- No runtime dependencies.

Runtime code does not access browser or Node.js globals, making it suitable for browser, Node.js, SSR, worker, and edge environments that meet these requirements.

## Notes

- Registry presets are opt-in and do not mutate the global registry on import.
- Configure the mutable global registry during application initialization.
- Registry bucket contents are mutable, but bucket references cannot be replaced.
- Batch registration and registry merging are atomic: invalid input leaves the target unchanged.
- Result objects, read-only registry snapshots, and every value returned by a bucket are frozen. An `AppError`'s own properties cannot be changed or removed, but it accepts new ones, so a framework can annotate an error it catches.
- An unmatched string never becomes the error message; supply `fallbackMessage` when user-facing text is needed.
- JSON serialization is defined by `AppError.toJSON()` and includes `name`, `message`, `type`, `code`, `messageKey`, `source`, and `isRetryable`, omitting diagnostic `cause` and `originalError` values. `appErrorFromJSON()` rebuilds an `AppError` from that shape on the receiving side; use it only on data from a source you trust to word its errors. Send `error.toJSON()` across a worker, IPC, or IndexedDB boundary; a structured clone of the error itself can carry the raw `cause`.
- `AppError.code` holds the registered code or name that matched, for branching on a specific failure. A message, prefix, or pattern match has no code; branch on its `messageKey`.
- `isAppError` recognizes errors created by the current package runtime, not structurally similar values.
- `isRetryable` describes the call that raised the matched failure, which can sit several wrappers down. Retry on it only where the code made that call itself.
- Built-in preset `messageKey` values are stable integration keys for consumer-owned translations; the package does not yet ship a translation map.
- Invalid registry entries and invalid `createAppError` options are programmer errors and throw `TypeError`.
- Custom registry patterns run against arbitrary error text; keep them linear to avoid catastrophic backtracking.

## License

Licensed under Apache-2.0.
