# @codenhub/router

Small browser router for TypeScript apps. The core entrypoint owns app-local
path matching, browser history navigation, route callbacks, and subscriptions.
The DOM entrypoint mounts explicit page routes into the document while keeping
the same matching and navigation behavior.

## Installation

```sh
pnpm add @codenhub/router
```

## Usage

Use `@codenhub/router` when app code owns rendering. Register routes with
`.on()`, start browser history integration, and navigate with app-local paths.

```ts
import { createRouter } from "@codenhub/router";

const router = createRouter({ basePath: "/app" })
  .on("/", () => {
    document.title = "Home";
  })
  .on("/users/:id", ({ params }) => {
    document.title = `User ${params["id"]}`;
  })
  .notFound(({ pathname }) => {
    document.title = `Missing ${pathname}`;
  });

const unsubscribe = router.subscribe((match) => {
  console.log(match?.pathname ?? "not-found");
});

router.start();
router.navigate("/users/42");

unsubscribe();
router.destroy();
```

Use `@codenhub/router/dom` when routes render page elements. Each page module
owns its route metadata and exports the route. The root mount receives only the
route list and router options.

```ts
// pages/user-page.ts
import { definePageRoute } from "@codenhub/router/dom";

export const userRoute = definePageRoute({
  path: "/users/:id",
  page: {
    tag: "main",
    className: "user-page",
  },
  render({ page, params }) {
    page.replaceChildren(`User ${params["id"]}`);
  },
});
```

```ts
// main.ts
import { mountRouter } from "@codenhub/router/dom";
import { homeRoute } from "./pages/home-page";
import { userRoute } from "./pages/user-page";

const app = mountRouter({
  routes: [homeRoute, userRoute],
  outlet: "#app",
  basePath: "/app",
  links: true,
});

app.start();

window.addEventListener("pagehide", () => {
  app.destroy();
});
```

```html
<nav>
  <a href="/app">Home</a>
  <a href="/app/users/42">User 42</a>
</nav>

<main id="app"></main>
```

## Reference

Supported import paths:

| Path                   | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `@codenhub/router`     | Core browser router, matcher, and subscriptions. |
| `@codenhub/router/dom` | DOM page routes, mounting, and link handling.    |

### `@codenhub/router`

Core entrypoint for route registration, path matching, browser history
navigation, and subscriptions.

```ts
import { createRouter } from "@codenhub/router";
import type {
  CreateRouterOptions,
  NavigateOptions,
  NotFoundHandler,
  RouteHandler,
  RouteParams,
  Router,
  RouterListener,
  RouterMatch,
  RouterMiss,
} from "@codenhub/router";
```

#### `createRouter()`

Creates a router instance.

```ts
function createRouter(options?: CreateRouterOptions): Router;
```

| Parameter | Type                  | Description         |
| --------- | --------------------- | ------------------- |
| `options` | `CreateRouterOptions` | Optional base path. |

The router starts with no routes. Register routes with `router.on()` before
calling `router.start()`. Creation validates `basePath` and throws `Error` when
it is not empty, does not start with `/`, starts with `//`, includes `?` or `#`,
or ends with `/` while not exactly `/`.

#### `CreateRouterOptions`

Options passed to `createRouter()`.

```ts
interface CreateRouterOptions {
  basePath?: string;
}
```

| Property   | Type     | Default | Description                                                 |
| ---------- | -------- | ------- | ----------------------------------------------------------- |
| `basePath` | `string` | `""`    | Prefix stripped before matching and restored in navigation. |

When provided, `basePath` must be an app-local path prefix without a trailing
slash, backslashes, query string, hash, or `.`/`..` path segments.

#### `Router`

Router instance returned by `createRouter()`.

```ts
interface Router {
  on(path: string, handler: RouteHandler): Router;
  notFound(handler: NotFoundHandler): Router;
  start(): RouterMatch | null;
  navigate(to: string, options?: NavigateOptions): RouterMatch | null;
  match(to: string): RouterMatch | null;
  href(to: string): string;
  subscribe(listener: RouterListener): () => void;
  destroy(): void;
}
```

##### `on()`

Registers a route handler and returns the router for chaining.

```ts
function on(path: string, handler: RouteHandler): Router;
```

Routes match in registration order. First match wins. Route paths support static
segments and named parameters, such as `/`, `/about`, and `/users/:id`.
Wildcards, optional segments, nested route trees, and route ranking are not
included. Static route segments are normalized with browser URL encoding, so
literal non-ASCII characters match their equivalent percent-encoded browser
pathname.

`on()` throws `Error` when the path is empty, does not start with `/`, starts
with `//`, or contains backslashes, `.`/`..` path segments, a query string,
hash, empty path parameter name, or duplicate path parameter name.

##### `notFound()`

Registers the fallback handler used when navigation has no matching route.

```ts
function notFound(handler: NotFoundHandler): Router;
```

Calling `notFound()` again replaces the previous fallback handler.

##### `start()`

Starts browser history integration.

```ts
function start(): RouterMatch | null;
```

In browsers, `start()` attaches one `popstate` listener, matches the current
location, calls the matching route handler or fallback handler, and notifies
subscribers. Repeated calls do not attach duplicate listeners. Without `window`,
`start()` returns `null` and does not attach listeners.

`start()` throws `Error` when called while another navigation is being handled.

When `basePath` is configured, browser locations outside that base path do not
match app routes. They call the fallback handler when present and notify
subscribers with `null`.

##### `navigate()`

Navigates to an app-local path.

```ts
function navigate(to: string, options?: NavigateOptions): RouterMatch | null;
```

`to` accepts paths such as `/about`, `/users/42?tab=posts`, and
`/users/42#activity`. In browsers, navigation writes to history with
`pushState` by default, or `replaceState` when `options.replace` is `true`, then
matches the new location. Without `window`, it matches `to` without writing
browser history.

Returns the active `RouterMatch`, or `null` when no route matches. It throws
`Error` when `to` is not an app-local path, contains backslashes or `.`/`..`
path segments, or another navigation is already being handled.

##### `href()`

Creates a browser href for an app-local path without navigating.

```ts
function href(to: string): string;
```

`href()` applies the router `basePath` so anchors keep native browser behavior,
including middle-click, copy link, and new tab. It uses the same path validation
as `navigate()` and throws `Error` when `to` is invalid.

##### `match()`

Matches a path without changing browser history, calling handlers, or notifying
subscribers.

```ts
function match(to: string): RouterMatch | null;
```

Returns `RouterMatch` for the first matching route, or `null` when no route
matches. It uses the same path validation as `navigate()` and throws `Error`
when `to` is invalid.

Named parameters are decoded with `decodeURIComponent`. Malformed encoded
parameter segments are treated as no match.

##### `subscribe()`

Registers a listener for navigation changes.

```ts
function subscribe(listener: RouterListener): () => void;
```

Returns an unsubscribe function. Listeners receive the active match, or `null`
when navigation has no matching route.

##### `destroy()`

Removes router-owned listeners and clears router subscribers.

```ts
function destroy(): void;
```

Repeated calls are allowed.

#### `RouteHandler`

Handler called when a route becomes active.

```ts
type RouteHandler = (match: RouterMatch) => void;
```

Route handler errors are not caught by the router. Starting another navigation
synchronously from a route handler throws `Error`; schedule redirects or followup
navigation after the handler returns.

#### `NotFoundHandler`

Handler called when navigation has no matching route.

```ts
type NotFoundHandler = (miss: RouterMiss) => void;
```

Fallback handler errors are not caught by the router. Starting another
navigation synchronously from the fallback handler throws `Error`; schedule
redirects or followup navigation after the handler returns.

#### `NavigateOptions`

Options passed to `router.navigate()`.

```ts
interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}
```

| Property  | Type      | Default     | Description                                      |
| --------- | --------- | ----------- | ------------------------------------------------ |
| `replace` | `boolean` | `false`     | Use `history.replaceState` instead of pushState. |
| `state`   | `unknown` | `undefined` | Optional history state passed to the browser.    |

#### `RouterMatch`

Matched route information.

```ts
interface RouterMatch {
  path: string;
  pathname: string;
  params: RouteParams;
  searchParams: URLSearchParams;
  hash: string;
}
```

| Property       | Type              | Description                                              |
| -------------- | ----------------- | -------------------------------------------------------- |
| `path`         | `string`          | Route pattern, such as `/users/:id`.                     |
| `pathname`     | `string`          | Matched pathname after `basePath` is removed.            |
| `params`       | `RouteParams`     | Decoded path parameters by name.                         |
| `searchParams` | `URLSearchParams` | Query string as browser-native search params.            |
| `hash`         | `string`          | URL hash, including the leading `#` when one is present. |

#### `RouterMiss`

Unmatched navigation information.

```ts
interface RouterMiss {
  pathname: string;
  searchParams: URLSearchParams;
  hash: string;
}
```

| Property       | Type              | Description                                                       |
| -------------- | ----------------- | ----------------------------------------------------------------- |
| `pathname`     | `string`          | Unmatched pathname after `basePath` is removed when applicable.   |
| `searchParams` | `URLSearchParams` | Query string as browser-native search params for the missed path. |
| `hash`         | `string`          | URL hash, including the leading `#` when one is present.          |

#### `RouteParams`

Path parameters from a route match.

```ts
type RouteParams = Record<string, string>;
```

`RouteParams` is an ordinary object. Special parameter names such as
`__proto__` are captured as own data properties. Because route parameter names
can overlap object method names, use `Object.hasOwn(params, name)` instead of
`params.hasOwnProperty(name)` for presence checks.

#### `RouterListener`

Listener called after router navigation.

```ts
type RouterListener = (match: RouterMatch | null) => void;
```

Subscriber errors are not caught by the router. Starting another navigation
synchronously from a subscriber throws `Error`; schedule redirects or followup
navigation after the listener returns.

### `@codenhub/router/dom`

DOM entrypoint for page route definitions, router mounting, and native link
handling.

```ts
import { connectRouterLinks, definePageRoute, mountRouter } from "@codenhub/router/dom";
import type {
  ConnectRouterLinksOptions,
  DefinePageRouteOptions,
  MountedRouter,
  MountRouterLinkOptions,
  MountRouterOptions,
  NavigateOptions,
  PageContext,
  PageMatch,
  PageOptions,
  PageRouter,
  PageRoute,
  PageRouterListener,
  Router,
} from "@codenhub/router/dom";
```

`NavigateOptions` and `Router` are re-exported from the core entrypoint for DOM
consumers that need to type navigation options or link integrations without an
extra import.

#### `definePageRoute()`

Defines a page route.

```ts
function definePageRoute(options: DefinePageRouteOptions): PageRoute;
```

| Parameter | Type                     | Description                        |
| --------- | ------------------------ | ---------------------------------- |
| `options` | `DefinePageRouteOptions` | Path, page options, and lifecycle. |

`definePageRoute()` validates the path and returns immutable page route
metadata. It does not mutate the DOM. It throws `Error` when the path violates
the same route path rules used by `router.on()`.

#### `DefinePageRouteOptions`

Options passed to `definePageRoute()`.

```ts
interface DefinePageRouteOptions {
  path: string;
  page?: PageOptions;
  render(context: PageContext): void;
  destroy?(context: PageContext): void;
  title?: string | ((context: PageContext) => string);
}
```

| Property  | Type                              | Description                                                                          |
| --------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| `path`    | `string`                          | Route path using the same syntax as core routes.                                     |
| `page`    | `PageOptions`                     | Optional element defaults for this route.                                            |
| `render`  | `(context: PageContext) => void`  | Creates page contents by mutating `context.page`.                                    |
| `destroy` | `(context: PageContext) => void`  | Optional cleanup before the page is removed.                                         |
| `title`   | `string \| ((context) => string)` | Optional document title or factory for matched pages. Factory errors are not caught. |

#### `PageRoute`

Route metadata returned by `definePageRoute()`.

```ts
interface PageRoute {
  readonly path: string;
  readonly page?: PageOptions;
  readonly render: (context: PageContext) => void;
  readonly destroy?: (context: PageContext) => void;
  readonly title?: string | ((context: PageContext) => string);
}
```

Consumers usually pass page routes to `mountRouter()` instead of reading these
fields directly.

#### `PageOptions`

Element defaults used when the mounted router creates a page element.

```ts
interface PageOptions {
  readonly tag?: string;
  readonly className?: string;
}
```

| Property    | Type     | Default  | Description                          |
| ----------- | -------- | -------- | ------------------------------------ |
| `tag`       | `string` | `"main"` | Element tag used for the route page. |
| `className` | `string` | `""`     | Class name assigned to the page.     |

Invalid `tag` values surface from `document.createElement()` when the page is
rendered.

#### `PageContext`

Context passed to `render()` and `destroy()`.

```ts
type PageContext<TRoute extends PageRoute = PageRoute> = PageMatch<TRoute> & {
  page: HTMLElement;
  router: PageRouter;
};
```

`render()` owns page content and mutates `page`. Return values from `render()`
are ignored. `destroy()` receives the same page and route match before the
mounted router removes the page from the outlet. `router` exposes navigation
helpers that are safe for page code. During `destroy()`, `router.match()` and
`router.href()` remain available for cleanup code that needs route metadata or
base-path-aware links.

Starting navigation synchronously from `render()` or `destroy()` throws `Error`
because the current page lifecycle is still being handled. Schedule redirects or
followup navigation after the lifecycle method returns.

#### `PageRouter`

Router API exposed to page route lifecycle methods.

```ts
interface PageRouter {
  navigate(to: string, options?: NavigateOptions): PageMatch | null;
  match(to: string): PageMatch | null;
  href(to: string): string;
}
```

`PageRouter` can navigate, match, and build base-path-aware href values. It does
not expose route registration, subscriptions, start, or destroy methods.
`match()` and `href()` throw `Error` for non-app-local paths, matching
`navigate()` path validation. `navigate()` also throws while another navigation
is already being handled.

#### `PageMatch`

Matched route information for DOM pages.

```ts
type PageMatch<TRoute extends PageRoute = PageRoute> = RouterMatch & {
  route: TRoute;
};
```

`PageMatch` includes every `RouterMatch` field plus `route`, the page route
metadata that matched the target path.

| Property | Type     | Description                                    |
| -------- | -------- | ---------------------------------------------- |
| `route`  | `TRoute` | Page route metadata associated with the match. |

#### `PageRouterListener`

Listener called after DOM router navigation.

```ts
type PageRouterListener = (match: PageMatch | null) => void;
```

#### `mountRouter()`

Mounts page routes into a DOM outlet.

```ts
function mountRouter(options: MountRouterOptions): MountedRouter;
```

| Parameter | Type                 | Description                                      |
| --------- | -------------------- | ------------------------------------------------ |
| `options` | `MountRouterOptions` | Routes, outlet target, and router configuration. |

`mountRouter()` creates the underlying router, registers each page route,
creates a fresh page element on each match, calls the matched route `render()`,
and replaces the outlet contents with the page. Before a page is replaced, the
matched route `destroy()` runs when present.

It throws `Error` when the outlet selector has no matching element, `basePath`
is invalid, or a route path is invalid. Invalid page tags, route `render()`
errors, route `destroy()` errors, and title factory errors are not caught by the
router. When cleanup fails during teardown, the outlet is still cleared before
the error is rethrown.

#### `MountRouterOptions`

Options passed to `mountRouter()`.

```ts
interface MountRouterOptions {
  routes: readonly PageRoute[];
  outlet: Element | string;
  basePath?: string;
  page?: PageOptions;
  links?: boolean | MountRouterLinkOptions;
}
```

| Property   | Type                                | Default  | Description                                              |
| ---------- | ----------------------------------- | -------- | -------------------------------------------------------- |
| `routes`   | `readonly PageRoute[]`              | Required | Ordered page route list. First matching route wins.      |
| `outlet`   | `Element \| string`                 | Required | Target element or selector where pages render.           |
| `basePath` | `string`                            | `""`     | Prefix stripped before matching and restored navigation. |
| `page`     | `PageOptions`                       | `{}`     | Default page element options for all routes.             |
| `links`    | `boolean \| MountRouterLinkOptions` | `false`  | Enables delegated native anchor interception.            |

Route-level `page` options override mount-level `page` options.

#### `MountRouterLinkOptions`

Link interception options used by `mountRouter()`.

```ts
interface MountRouterLinkOptions {
  root?: ParentNode;
  selector?: string;
}
```

| Property   | Type         | Default     | Description                               |
| ---------- | ------------ | ----------- | ----------------------------------------- |
| `root`     | `ParentNode` | `document`  | Root that receives delegated link clicks. |
| `selector` | `string`     | `"a[href]"` | Anchor selector for SPA navigation.       |

#### `MountedRouter`

Controller returned by `mountRouter()`.

```ts
interface MountedRouter {
  start(): PageMatch | null;
  navigate(to: string, options?: NavigateOptions): PageMatch | null;
  match(to: string): PageMatch | null;
  href(to: string): string;
  subscribe(listener: PageRouterListener): () => void;
  destroy(): void;
}
```

`destroy()` removes router-owned listeners, disconnects delegated link handling,
runs `destroy()` for the active route when present, and clears the outlet. Active
route cleanup errors are rethrown after the outlet is cleared. After `destroy()`,
controller methods throw `Error` except repeated `destroy()` calls, which are
allowed. `match()` and `href()` validate app-local paths without navigating.
`start()` and `navigate()` also throw while another navigation is already being
handled.

#### `connectRouterLinks()`

Enables SPA navigation for native anchors.

```ts
function connectRouterLinks(options: ConnectRouterLinksOptions): () => void;
```

It listens for clicks on anchors matching `a[href]` inside the delegated `root`,
preserves normal browser behavior for external links, downloads, non-primary
clicks, modifier keys, non-`_self` targets, anchors with `data-router-ignore`,
same-document hash links, matching ancestor anchors outside the delegated root,
and same-origin links outside the router `basePath`, and calls
`router.navigate()` for safe app-local links.

Link handling is delegated from `root`, so anchors added by route `render()`
work without reconnecting link handling.

Returns a disconnect function that removes the delegated click listener.
Invalid selector values and missing browser DOM APIs surface from the browser
methods this helper calls. Errors from intercepted `router.navigate()` calls are
not caught.

#### `ConnectRouterLinksOptions`

Options passed to `connectRouterLinks()`.

```ts
interface ConnectRouterLinksOptions {
  router: MountedRouter | Router;
  root?: ParentNode;
  selector?: string;
}
```

| Property   | Type                      | Default     | Description                               |
| ---------- | ------------------------- | ----------- | ----------------------------------------- |
| `router`   | `MountedRouter \| Router` | Required    | Router used for intercepted navigation.   |
| `root`     | `ParentNode`              | `document`  | Root that receives delegated link clicks. |
| `selector` | `string`                  | `"a[href]"` | Anchor selector for SPA navigation.       |

When used inside `mountRouter({ links })`, the mounted router supplies `router`.

## Examples

### Path Parameters

```ts
import { createRouter } from "@codenhub/router";

const router = createRouter().on("/teams/:teamId/members/:memberId", ({ params }) => {
  console.log(params["teamId"], params["memberId"]);
});

router.navigate("/teams/design/members/42");
```

### Base Path

```ts
import { createRouter } from "@codenhub/router";

const router = createRouter({ basePath: "/app" }).on("/settings", () => {
  document.title = "Settings";
});

router.navigate("/settings");
router.href("/settings"); // "/app/settings"
```

In a browser, this writes `/app/settings` to history and matches the route path
`/settings`.

### Page Route Modules

```ts
import { definePageRoute } from "@codenhub/router/dom";

export const settingsRoute = definePageRoute({
  path: "/settings",
  page: {
    className: "settings-page",
  },
  title: "Settings",
  render({ page, router, searchParams }) {
    const tab = searchParams.get("tab") ?? "profile";
    const homeLink = document.createElement("a");
    const profileButton = document.createElement("button");

    homeLink.href = router.href("/");
    homeLink.textContent = "Home";

    profileButton.textContent = "Profile";
    profileButton.addEventListener("click", () => {
      router.navigate("/settings?tab=profile");
    });

    page.replaceChildren(`Settings: ${tab}`, homeLink, profileButton);
  },
});
```

### Page Cleanup

```ts
import { definePageRoute } from "@codenhub/router/dom";

export const activityRoute = definePageRoute({
  path: "/activity",
  render({ page }) {
    page.replaceChildren("Activity");
    page.addEventListener("click", refreshActivity);
  },
  destroy({ page }) {
    page.removeEventListener("click", refreshActivity);
  },
});

function refreshActivity() {
  // Refresh activity state.
}
```

### Native Link Navigation

```html
<a href="/settings">Settings</a>
<a href="https://example.com">External</a>
<a href="/report.pdf" download>Download</a>
<a href="/settings" data-router-ignore>Native settings</a>
```

Only the first link is intercepted. The external, download, and ignored links
keep normal browser behavior. With a router `basePath`, use `router.href()` when
building anchors in page code so native browser fallback, middle-click, and new
tabs open the correct URL.

## Requirements

- Core navigation uses `window.location`, `window.history.pushState`,
  `window.history.replaceState`, and the `popstate` event.
- Core matching uses `URL` and `URLSearchParams`.
- DOM rendering uses `document`, `HTMLElement`, `Element`, `ParentNode`, and
  `replaceChildren()`.
- Link handling uses `MouseEvent`, `Node`, and `HTMLAnchorElement`.
- SSR and non-browser environments can create routers and call `match()`.
  Browser history, DOM mounting, and link interception need browser APIs.
- No framework, CSS, peer dependency, storage, or build-tool plugin is required.

## Notes

- First matching route wins.
- Route matching is exact for supported path patterns.
- Query strings and hashes are available on matches, but they do not affect
  route matching.
- The package does not provide nested routes, wildcard routes, route ranking,
  route guards, data loading, suspense, transitions, scroll restoration, focus
  management, or form helpers.
- Consumers own accessibility beyond native anchor behavior, including page
  titles, focus movement, landmarks, and announcements after route changes.
- Consumers own authentication, authorization, data fetching, component state,
  error boundaries, and telemetry.

## License

This project is licensed under the Apache License 2.0.
