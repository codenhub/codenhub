/** Options used when creating a router. */
export interface CreateRouterOptions {
  /** App-local prefix removed from browser locations before matching and added back when creating hrefs. */
  basePath?: string;
}

/** Options used when navigating through browser history. */
export interface NavigateOptions {
  /** Uses `history.replaceState` instead of `history.pushState` when a browser history object exists. */
  shouldReplace?: boolean;
  /** State value passed to browser history when navigation writes a history entry. */
  state?: unknown;
}

/**
 * Path parameters keyed by route parameter name. Captured names are own data
 * properties; use `Object.hasOwn()` for presence checks because parameter names
 * can overlap object method names.
 */
export type RouteParams = Record<string, string>;

/** Information for the route that matched the current navigation target. */
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

/** Information for a navigation target that did not match any registered route. */
export interface RouterMiss {
  /** Unmatched pathname after the router base path has been removed when applicable. */
  pathname: string;
  /** Query string parsed into browser-native search params. */
  searchParams: URLSearchParams;
  /** URL hash, including the leading `#` when one is present. */
  hash: string;
}

/** Handler called when a registered route becomes active; synchronous navigation started from the handler throws. */
export type RouteHandler = (match: RouterMatch) => void;

/** Handler called when navigation does not match any registered route; synchronous navigation started from the handler throws. */
export type NotFoundHandler = (miss: RouterMiss) => void;

/** Listener called after route navigation completes; synchronous navigation started from the listener throws. */
export type RouterListener = (match: RouterMatch | null) => void;

/** Browser router with route registration, matching, navigation, and subscriptions. */
export interface Router {
  /** Registers a route handler and returns the router for chaining; throws when the route path is invalid or contains dot segments. */
  on(path: string, handler: RouteHandler): Router;
  /** Replaces the fallback handler used when navigation has no matching route. */
  notFound(handler: NotFoundHandler): Router;
  /** Starts browser history integration and matches the current browser location when available; throws during active navigation. */
  start(): RouterMatch | null;
  /** Navigates to an app-local path, writing browser history when available; throws when the target is invalid, contains dot segments, or navigation is already running. */
  navigate(to: string, options?: NavigateOptions): RouterMatch | null;
  /** Matches an app-local path without side effects; throws when the target is invalid or contains dot segments. */
  match(to: string): RouterMatch | null;
  /** Builds a browser href for an app-local path without navigating; throws when the target is invalid or contains dot segments. */
  href(to: string): string;
  /** Registers a listener called after navigation and returns an unsubscribe function. */
  subscribe(listener: RouterListener): () => void;
  /** Removes router-owned browser listeners and clears subscribers. */
  destroy(): void;
}
