---
title: Overview
---

# Route browser applications

`@codenhub/router` provides app-local path registration and matching, browser
history navigation, optional annotated-link interception, and subscriptions.
Applications retain rendering and page lifecycle ownership.

It fits small browser applications that want routing primitives while keeping
rendering, data loading, and framework integration in application code.

## Setup

### Installation

```sh
pnpm add @codenhub/router
```

### Quick start

```ts
import { createRouter } from "@codenhub/router";

const router = createRouter({ basePath: "/app" })
  .on("/", () => renderHome())
  .on("/users/:id", ({ params }) => renderUser(params["id"]));

router.start();
```

Call `destroy()` when the router owner is torn down.

## Requirements

- History integration requires `window`, `location`, `history`, and `popstate`.
- `match()`, `href()`, and non-history `navigate()` behavior remain usable
  during SSR.
- Applications own rendering, data loading, framework integration, and route
  lifecycle behavior.

Treat URL values as untrusted. Applications must also update focus, titles, and
route announcements after navigation.

## Next steps

- [API, paths, and browser lifecycle](reference.md): Complete exports, matching,
  link interception, history behavior, SSR, failures, URL safety, cleanup, and
  accessibility responsibilities.
