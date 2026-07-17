# @codenhub/router API, Paths, and Browser Lifecycle

## Create and Register

`createRouter(options?): Router` accepts `CreateRouterOptions`:

- `basePath`: app-local prefix removed before matching and restored by history
  navigation and `href()`. Default is empty.
- `shouldInterceptLinks`: intercept eligible clicks on anchors carrying
  `data-router-link`. Default is `false`.

Invalid base paths throw. `Router.on(path, handler)` registers a route and
returns the router; first match in registration order wins. Paths support exact
static segments and named `:params`, not wildcards, optional segments, ranking,
or nested route trees. Invalid paths, duplicate structural patterns, duplicate
or dangerous parameter names, query/hash content, backslashes, and dot segments
throw. `notFound(handler)` replaces the fallback handler.

## Match and Navigate

- `match(to)` validates and matches without history, handlers, or subscribers.
- `href(to)` validates and adds `basePath` for native anchors.
- `navigate(to, options?)` uses `pushState`, or `replaceState` when
  `NavigateOptions.shouldReplace` is true, passing optional `state`. It then
  handles the route and notifies subscribers.
- `start()` attaches one `popstate` listener, optionally one document click
  listener, and handles the current location. Repeated calls do not duplicate
  listeners.

Navigation requested synchronously from a handler or subscriber is queued and
the nested call returns `null`. Handler, fallback, and subscriber errors are not
caught; they clear queued navigation and propagate. History is restored when a
handled navigation throws. `start()` throws if called during active navigation.

`RouterMatch` contains registered `path`, app-local `pathname`, decoded
`RouteParams`, `URLSearchParams`, and `hash`. Malformed encoded parameters do not
match. `RouterMiss` contains pathname, search params, and hash.

## Links and Subscriptions

Link interception applies only to normal same-window clicks on eligible
`data-router-link` anchors; native modified clicks, downloads, external targets,
and other ineligible navigation retain browser behavior. Prefer `router.href()`
for href values so copy, new-tab, and non-JavaScript behavior remain useful.

`subscribe(listener: RouterListener)` returns an unsubscribe function.
Listeners receive `RouterMatch | null` after handled navigation.

## SSR and Cleanup

Without `window`, `start()` returns `null`, `navigate()` matches without writing
history, and matching remains available. URL and `URLSearchParams` support are
still required. `destroy()` removes router-owned history and click listeners and
clears subscribers; repeated calls are allowed. Route registrations remain on
the router and it can be started again.

## Security and Accessibility

Route parameters, paths, query values, and hashes are untrusted URL input.
Sanitize them for HTML, CSS, scripts, requests, storage, and logs. `RouteParams`
has a null prototype; use `Object.hasOwn()` for presence checks.

The router does not manage page titles, focus, landmarks, scroll restoration,
or route announcements. Applications must provide those behaviors after
navigation and preserve useful native links.

## Public Exports

The root exports `createRouter`, plus `CreateRouterOptions`, `NavigateOptions`,
`NotFoundHandler`, `RouteHandler`, `RouteParams`, `Router`, `RouterListener`,
`RouterMatch`, and `RouterMiss` types.
