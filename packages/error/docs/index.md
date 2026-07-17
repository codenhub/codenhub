# @codenhub/error

`@codenhub/error` normalizes unknown failures into a typed `AppError`, provides
result-style control flow, and supplies opt-in browser and Supabase mappings.
It is useful at application boundaries where thrown or rejected values need a
consistent shape before they reach logging, UI, or recovery logic.

> **Experimental:** Error classification rules, preset contents, and the public
> API may change before a stable release.

## Start by defining known errors

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

## Choose where to go next

- [Error normalization and registries](error-normalization.md) explains
  classification, registry configuration, presets, matching priority,
  defaults, and failure behavior.
- [Result helpers](results.md) covers `Result` construction, transformation,
  matching, and unwrapping for code that prefers explicit success and failure
  values.

The core API has no runtime dependencies and supports browsers, Node.js, SSR,
workers, and edge runtimes. Browser preset imports do not access DOM globals;
Supabase preset imports do not contact services or require Supabase packages.
