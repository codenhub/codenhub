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

- ESM-aware package resolution.
- Browser, Node.js, SSR, worker, and edge runtimes are supported.
- No runtime dependencies.

## Notes

- Registry presets are opt-in and do not mutate the global registry on import.
- Configure the mutable global registry during application initialization.
- `AppError` instances and read-only registry snapshots are frozen.
- Raw strings passed to `err()` use the generic fallback unless `fallbackMessage` is explicit.
- `originalError` remains available for diagnostics but is omitted from default JSON serialization.
- `isAppError` recognizes errors created by the current package runtime, not structurally similar values.

### Migration From 0.1

Version 0.2 is a clean API reset. `AppError` values are frozen, `maxDepth` only
accepts integers from `0` through `3`, code and name punctuation is significant,
and `err(string)` no longer exposes that string as its message.

## License

Licensed under Apache-2.0.
