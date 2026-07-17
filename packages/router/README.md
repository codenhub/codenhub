# @codenhub/router

Small browser router for app-owned rendering, history navigation, matching, and
subscriptions.

> [!WARNING]
> This package is experimental. Its API, routing behavior, and support level may
> change before a stable release.

## Installation

```sh
pnpm add @codenhub/router
```

## Usage

```ts
import { createRouter } from "@codenhub/router";

const router = createRouter({ basePath: "/app" })
  .on("/", () => renderHome())
  .on("/users/:id", ({ params }) => renderUser(params["id"]));

router.start();
router.navigate("/users/42");

// Remove history/link listeners and subscriptions on teardown.
router.destroy();
```

## Documentation

- [Documentation overview](docs/index.md)
- [API, paths, and browser lifecycle](docs/reference.md)

## Requirements

- History integration requires `window`, `location`, `history`, and `popstate`.
- `match()`, `href()`, and non-history `navigate()` behavior are SSR-safe.
- The package provides no rendering, data loading, CSS, or framework adapter.

## Notes

Consumers own route-change focus, titles, announcements, authentication, and
sanitization of URL-derived values. Invalid paths throw synchronously.

## License

Licensed under Apache-2.0.
