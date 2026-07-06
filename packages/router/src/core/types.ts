/** Options used when creating a router. */
export interface CreateRouterOptions {
  /**
   * App-local prefix removed from browser locations before matching and added back when creating hrefs.
   */
  basePath?: string;
  /**
   * Automatically intercept standard click events on anchors with the `data-router-link` attribute.
   */
  shouldInterceptLinks?: boolean;
}

/** Options used when navigating through browser history. */
export interface NavigateOptions {
  /**
   * Uses `history.replaceState` instead of `history.pushState` when a browser history object exists.
   */
  shouldReplace?: boolean;
  /**
   * State value passed to browser history when navigation writes a history entry.
   */
  state?: unknown;
}

/**
 * Path parameters keyed by route parameter name on a null-prototype object.
 * Route registration rejects `__proto__`, `constructor`, and `prototype`; use
 * `Object.hasOwn()` for presence checks because parameter names can still
 * overlap object method names. Values are URL-derived input; sanitize before
 * using them in unsafe sinks.
 */
export type RouteParams = Record<string, string>;

/** Information for the route that matched the current navigation target. Values are URL-derived input. */
export interface RouterMatch {
  /** Registered route pattern that matched the target pathname. */
  path: string;
  /** Matched pathname after the router base path has been removed. */
  pathname: string;
  /** Decoded path parameters captured from named route segments. */
  params: RouteParams;
  /** Query string parsed into browser-native search params. */
  searchParams: URLSearchParams;
  /** URL hash, including the leading `#` when one is present. */
  hash: string;
}

/** Information for a navigation target that did not match any registered route. Values are URL-derived input. */
export interface RouterMiss {
  /** Unmatched pathname after the router base path has been removed when applicable. */
  pathname: string;
  /** Query string parsed into browser-native search params. */
  searchParams: URLSearchParams;
  /** URL hash, including the leading `#` when one is present. */
  hash: string;
}

/**
 * Handler called when a registered route becomes active.
 * Synchronous navigation started from the handler is queued.
 * Any errors thrown by the handler are not caught by the router and will clear/drain the pending navigation queue.
 */
export type RouteHandler = (match: RouterMatch) => void;

/**
 * Handler called when navigation does not match any registered route.
 * Synchronous navigation started from the handler is queued.
 * Any errors thrown by the handler are not caught by the router and will clear/drain the pending navigation queue.
 */
export type NotFoundHandler = (miss: RouterMiss) => void;

/**
 * Listener called after route navigation completes.
 * Synchronous navigation started from the listener is queued.
 * Any errors thrown by the listener are not caught by the router and will clear/drain the pending navigation queue.
 */
export type RouterListener = (match: RouterMatch | null) => void;

/** Browser router with route registration, matching, navigation, and subscriptions. */
export interface Router {
  /**
   * Registers a route handler and returns the router for chaining.
   *
   * @param path - The route path pattern to match, e.g., `/users/:id`.
   * @param handler - Callback called when the route matches and becomes active.
   * @returns The router instance.
   * @throws {Error} If the route path is empty, invalid, contains dot segments, or contains disallowed parameter names.
   */
  on(path: string, handler: RouteHandler): Router;

  /**
   * Replaces the fallback handler used when navigation has no matching route.
   *
   * @param handler - Fallback callback called on route misses.
   * @returns The router instance.
   */
  notFound(handler: NotFoundHandler): Router;

  /**
   * Starts browser history integration and matches the current browser location when available.
   *
   * Locations outside the configured `basePath` trigger the fallback (notFound) handler and
   * notify subscribers with null.
   *
   * @returns The matched route info, or null if no route matched, location is outside basePath,
   *   or not in a browser environment.
   * @throws {Error} If called during active navigation.
   */
  start(): RouterMatch | null;

  /**
   * Navigates to an app-local path, writing to browser history when available.
   *
   * If navigation is already running, the new navigation is queued and executed synchronously
   * after the current route handler completes, and this method synchronously returns null.
   *
   * @param to - The target app-local path to navigate to.
   * @param options - Navigation and history options.
   * @returns The active route match, or null if no route matches or the navigation was queued.
   * @throws {Error} If the target is invalid or contains dot segments.
   */
  navigate(to: string, options?: NavigateOptions): RouterMatch | null;

  /**
   * Matches an app-local path without side effects (does not navigate, call handlers, or notify).
   *
   * @param to - The app-local path to match.
   * @returns The route match info, or null if no route matches.
   * @throws {Error} If the target is invalid or contains dot segments.
   */
  match(to: string): RouterMatch | null;

  /**
   * Builds a browser href for an app-local path without navigating.
   *
   * @param to - The target app-local path.
   * @returns The fully qualified browser href containing the configured basePath.
   * @throws {Error} If the target is invalid or contains dot segments.
   */
  href(to: string): string;

  /**
   * Registers a listener called after navigation completes.
   *
   * Note: The subscription is automatically removed when the router is destroyed.
   *
   * @param listener - Callback called after any navigation change.
   * @returns An unsubscribe function to remove the listener.
   */
  subscribe(listener: RouterListener): () => void;

  /**
   * Removes router-owned browser listeners and clears subscribers.
   * Repeated calls are allowed.
   */
  destroy(): void;
}
