# @codenhub/router

Small browser router for TypeScript apps. The router owns app-local path matching, browser history navigation, route callbacks, and subscriptions.

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

## Reference

Supported import paths:

| Path               | Description                                      |
| ------------------ | ------------------------------------------------ |
| `@codenhub/router` | Core browser router, matcher, and subscriptions. |

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

| Parameter | Type                  | Description            |
| --------- | --------------------- | ---------------------- |
| `options` | `CreateRouterOptions` | Configuration options. |

The router starts with no routes. Register routes with `router.on()` before
calling `router.start()`. Creation validates `basePath` and throws `Error` when
it is not empty, does not start with `/`, starts with `//`, includes `?` or `#`,
or ends with `/` while not exactly `/`.

#### `CreateRouterOptions`

Options passed to `createRouter()`.

```ts
interface CreateRouterOptions {
  basePath?: string;
  shouldInterceptLinks?: boolean;
}
```

| Property               | Type      | Default | Description                                                 |
| ---------------------- | --------- | ------- | ----------------------------------------------------------- |
| `basePath`             | `string`  | `""`    | Prefix stripped before matching and restored in navigation. |
| `shouldInterceptLinks` | `boolean` | `false` | Enable built-in interception of `data-router-link` anchors. |

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
with `//`, contains backslashes, `.`/`..` path segments, a query string,
hash, empty path parameter name, duplicate path parameter name, or if a
structurally equivalent route pattern (differing only in parameter names) is already registered.

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
subscribers. If `shouldInterceptLinks` is enabled, it also attaches a click listener to the document to automatically intercept clicks on anchors with a `data-router-link` attribute.

Repeated calls do not attach duplicate listeners. Without `window`,
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
`pushState` by default, or `replaceState` when `options.shouldReplace` is `true`, then
matches the new location. Without `window`, it matches `to` without writing
browser history.

If navigation is already running, the new navigation is queued and executed synchronously
after the current route handler completes.

Returns the active `RouterMatch`, or `null` when no route matches or the navigation was queued. It throws
`Error` when `to` is not an app-local path or contains backslashes or `.`/`..`
path segments.

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

Removes router-owned browser listeners (including click and popstate listeners) and clears router subscribers.

```ts
function destroy(): void;
```

Repeated calls are allowed.

#### `RouteHandler`

Handler called when a route becomes active.

```ts
type RouteHandler = (match: RouterMatch) => void;
```

Route handler errors are not caught by the router; any thrown error will clear/drain the pending navigation queue.
Starting another navigation synchronously from a route handler is queued and executed after the current handler returns.

#### `NotFoundHandler`

Handler called when navigation has no matching route.

```ts
type NotFoundHandler = (miss: RouterMiss) => void;
```

Fallback handler errors are not caught by the router; any thrown error will clear/drain the pending navigation queue.
Starting another navigation synchronously from the fallback handler is queued and executed after the fallback handler returns.

#### `NavigateOptions`

Options passed to `router.navigate()`.

```ts
interface NavigateOptions {
  shouldReplace?: boolean;
  state?: unknown;
}
```

| Property        | Type      | Default     | Description                                                |
| --------------- | --------- | ----------- | ---------------------------------------------------------- |
| `shouldReplace` | `boolean` | `false`     | Use `history.replaceState` instead of `history.pushState`. |
| `state`         | `unknown` | `undefined` | Optional history state passed to the browser.              |

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

Subscriber errors are not caught by the router; any thrown error will clear/drain the pending navigation queue.
Starting another navigation synchronously from a subscriber is queued and executed after the listener returns.

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

## Requirements

- Navigation uses `window.location`, `window.history.pushState`,
  `window.history.replaceState`, and the `popstate` event.
- Matching uses `URL` and `URLSearchParams`.
- SSR and non-browser environments can create routers and call `match()`.
  Browser history integration needs browser APIs.
- No framework, CSS, peer dependency, storage, or build-tool plugin is required.

## Notes

- First matching route wins.
- Route matching is exact for supported path patterns.
- Query strings and hashes are available on matches, but they do not affect
  route matching.
- The package does not provide nested routes, wildcard routes, route ranking,
  route guards, data loading, suspense, transitions, scroll restoration, focus
  management, or form helpers.
- Consumers own accessibility, page titles, focus movement, landmarks, and
  announcements after route changes.
- Consumers own authentication, authorization, data fetching, component state,
  error boundaries, and telemetry.

## License

This project is licensed under the [Apache-2.0](LICENSE) license.
