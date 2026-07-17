# @codenhub/error

Typed error normalization, result helpers, and opt-in registry presets for
TypeScript applications.

> **Experimental:** Error classification rules, preset contents, and the public
> API may change before a stable release.

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
  source: "auth",
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

## License

Licensed under Apache-2.0.
