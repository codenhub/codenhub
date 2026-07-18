---
title: Overview
---

# Normalize application errors

The `@codenhub/error` package normalizes unknown failures into a typed
`AppError`, provides result-style control flow, and supplies opt-in browser and
Supabase mappings. It is useful at application boundaries where thrown or
rejected values need a consistent shape before they reach logging, UI, or
recovery logic.

## Setup

### Installation

```sh
pnpm add @codenhub/error
```

### Quick start

The global registry starts empty. Configure it during application
initialization, then normalize unknown values wherever they enter the
application:

```ts
import { createAppError, getErrorRegistry } from "@codenhub/error";

getErrorRegistry().codes.add("invalid_credentials", {
  message: "Invalid email or password.",
  source: "auth",
});

const error = createAppError({ code: "invalid_credentials" });
```

Applications decide which errors are known by registering mappings or merging
presets. Browser and Supabase presets are opt-in, and importing one does not
mutate the global registry.

### Configuration

Configure the mutable global registry during application initialization, or
create an isolated registry and pass it to `createAppError`. Exact codes, names,
messages, prefixes, and regular-expression patterns can provide normalized
feedback. See [error normalization and registries](error-normalization.md) for
matching priority and preset entrypoints.

## Requirements

- ESM-aware package resolution is required.
- Browser, Node.js, SSR, worker, and edge runtimes are supported.
- The package has no runtime dependencies.

Browser preset imports do not access DOM globals. Supabase preset imports do not
contact services or require Supabase packages.

## Next steps

- [Error normalization and registries](error-normalization.md) explains
  classification, registry configuration, presets, matching priority,
  defaults, and failure behavior.
- [Result helpers](results.md) covers `Result` construction, transformation,
  matching, and unwrapping for code that prefers explicit success and failure
  values.
