import type { NavigateOptions, Router, RouterMatch } from "../core/types";

export type { NavigateOptions, Router } from "../core/types";

/** Element defaults used when creating a page route element. */
export interface PageOptions {
  /** Element tag used for the route page. */
  readonly tag?: string;
  /** Class name assigned to the route page element. */
  readonly className?: string;
}

/** Options used to define a page route. */
export interface DefinePageRouteOptions {
  /** Route path using the same syntax and validation rules as the core router. */
  path: string;
  /** Optional route-level page element defaults. */
  page?: PageOptions;
  /** Renders page contents by mutating the provided page element; synchronous navigation started from render throws. */
  render(context: PageContext): void;
  /** Optional cleanup called before the page is removed from the outlet; synchronous navigation started from cleanup throws. */
  destroy?(context: PageContext): void;
  /** Optional document title or title factory for matched pages; title factory errors are not caught. */
  title?: string | ((context: PageContext) => string);
}

/** Route metadata consumed by `mountRouter()`. */
export interface PageRoute {
  /** Route path using the same syntax and validation rules as the core router. */
  readonly path: string;
  /** Optional route-level page element defaults. */
  readonly page?: PageOptions;
  /** Renders page contents by mutating the provided page element; synchronous navigation started from render throws. */
  readonly render: (context: PageContext) => void;
  /** Optional cleanup called before the page is removed from the outlet; synchronous navigation started from cleanup throws. */
  readonly destroy?: (context: PageContext) => void;
  /** Optional document title or title factory for matched pages; title factory errors are not caught. */
  readonly title?: string | ((context: PageContext) => string);
}

/** Router API exposed to page route lifecycle methods. */
export interface PageRouter {
  /** Navigates to an app-local path and returns the matched page route when one exists; throws during active navigation or page lifecycle cleanup. */
  navigate(to: string, options?: NavigateOptions): PageMatch | null;
  /** Matches an app-local path without side effects; throws when the target is invalid or contains dot segments. */
  match(to: string): PageMatch | null;
  /** Builds a browser href for an app-local path without navigating; throws when the target is invalid or contains dot segments. */
  href(to: string): string;
}

/** Matched route information for DOM page routes. */
export type PageMatch<TRoute extends PageRoute = PageRoute> = RouterMatch & {
  /** Page route metadata associated with the matched route. */
  route: TRoute;
};

/** Context passed to page route render and destroy lifecycle methods. */
export type PageContext<TRoute extends PageRoute = PageRoute> = PageMatch<TRoute> & {
  /** Page element owned by the matched route lifecycle. */
  page: HTMLElement;
  /** Restricted navigation helper exposed to page code; `match()` and `href()` remain available during cleanup. */
  router: PageRouter;
};

/** Listener called after DOM router navigation completes; synchronous navigation started from the listener throws. */
export type PageRouterListener = (match: PageMatch | null) => void;

/** Link interception options used by `mountRouter()`. */
export interface MountRouterLinkOptions {
  /** Root that receives delegated click handling; matching anchors outside this root keep native behavior. */
  root?: ParentNode;
  /** Anchor selector used to opt links into SPA navigation. */
  selector?: string;
}

/** Options used when mounting page routes into a DOM outlet. */
export interface MountRouterOptions {
  /** Ordered page route list where the first matching route wins. */
  routes: readonly PageRoute[];
  /** Element or selector where matched pages are rendered. */
  outlet: Element | string;
  /** Prefix removed before matching and restored when creating hrefs. */
  basePath?: string;
  /** Mount-level page element defaults used when a route does not override them. */
  page?: PageOptions;
  /** Enables delegated native anchor interception when provided. */
  links?: boolean | MountRouterLinkOptions;
}

/** Mounted DOM router controller returned by `mountRouter()`. Methods throw after `destroy()` except repeated `destroy()` calls. */
export interface MountedRouter {
  /** Starts browser history integration and renders the current page when one matches; throws during active navigation or page lifecycle cleanup. */
  start(): PageMatch | null;
  /** Navigates to an app-local path and renders a matching page; throws when the target is invalid, contains dot segments, or navigation is already running. */
  navigate(to: string, options?: NavigateOptions): PageMatch | null;
  /** Matches an app-local path without side effects; throws when the target is invalid or contains dot segments. */
  match(to: string): PageMatch | null;
  /** Builds a browser href for an app-local path without navigating; throws when the target is invalid or contains dot segments. */
  href(to: string): string;
  /** Registers a listener called after DOM router navigation and returns an unsubscribe function. */
  subscribe(listener: PageRouterListener): () => void;
  /** Removes router-owned listeners, disconnects links, destroys the active page, and clears the outlet before propagating cleanup errors. */
  destroy(): void;
}

/** Options used to enable delegated SPA navigation for native anchors. */
export interface ConnectRouterLinksOptions {
  /** Router used for intercepted app-local navigation. */
  router: MountedRouter | Router;
  /** Root that receives delegated click handling; matching anchors outside this root keep native behavior. */
  root?: ParentNode;
  /** Anchor selector used to opt links into SPA navigation. */
  selector?: string;
}
