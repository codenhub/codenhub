# @codenhub/router

`@codenhub/router` provides app-local path registration and matching, browser
history navigation, optional annotated-link interception, and subscriptions.
Applications retain rendering and page lifecycle ownership.

It fits small browser applications that want routing primitives while keeping
rendering, data loading, and framework integration in application code.

> [!WARNING]
> This package is experimental. Its API, routing behavior, and support level may
> change before a stable release.

## Quick Start

```ts
import { createRouter } from "@codenhub/router";

const router = createRouter({ basePath: "/app" })
  .on("/", () => renderHome())
  .on("/users/:id", ({ params }) => renderUser(params["id"]));

router.start();
```

Call `destroy()` when the router owner is torn down. History integration needs
browser APIs, while matching and non-history navigation remain usable during
SSR. The application is responsible for treating URL values as untrusted and
for updating focus, titles, and route announcements after navigation.

## Continue

- [API, paths, and browser lifecycle](reference.md): Complete exports, matching,
  link interception, history behavior, SSR, failures, URL safety, cleanup, and
  accessibility responsibilities.
