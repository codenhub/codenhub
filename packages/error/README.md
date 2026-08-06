# @codenhub/error

Typed error normalization, result helpers, and opt-in registry presets for
TypeScript applications.

## Installation

```sh
pnpm add @codenhub/error
```

## Usage

The default global registry starts empty. Register application mappings during
initialization, then normalize unknown values into `AppError` instances.

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";

getErrorRegistry().codes.add("invalid_credentials", {
  message: "Invalid email or password.",
  source: "my-app.auth",
});

const error = createAppError({ code: "invalid_credentials" });
console.log(error.type, error.message);
```

Unmatched values become `type: "unknown"` and use
`"An unexpected error occurred."` unless `fallbackMessage` is provided.

## Documentation

- [Documentation overview](docs/index.md)
- [Error normalization and registries](docs/error-normalization.md)
- [Result helpers](docs/results.md)

## Requirements

- Node.js 22 or newer, or an ES2022-compatible browser, worker, or edge runtime.
- Native `Error` cause support.
- ESM-aware package resolution.
- No runtime dependencies.

Runtime code does not access browser or Node.js globals, making it suitable for
browser, Node.js, SSR, worker, and edge environments that meet these
requirements.

## Notes

- Registry presets are opt-in and do not mutate the global registry on import.
- Configure the mutable global registry during application initialization.
- Registry bucket contents are mutable, but bucket references cannot be replaced.
- Batch registration and registry merging are atomic: invalid input leaves the target unchanged.
- `AppError` instances, result objects, read-only registry snapshots, and every value returned by a bucket are frozen.
- An unmatched string never becomes the error message; supply `fallbackMessage` when user-facing text is needed.
- JSON serialization is defined by `AppError.toJSON()` and includes `name`, `message`, `type`, `messageKey`, `source`, and `isRetryable`, omitting diagnostic `cause` and `originalError` values.
- `isAppError` recognizes errors created by the current package runtime, not structurally similar values.
- Built-in preset `messageKey` values are stable integration keys for consumer-owned translations; the package does not yet ship a translation map.
- Invalid registry entries and invalid `createAppError` options are programmer errors and throw `TypeError`.
- Custom registry patterns run against arbitrary error text; keep them linear to avoid catastrophic backtracking.

## License

Licensed under Apache-2.0.
