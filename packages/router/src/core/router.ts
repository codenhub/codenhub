import {
  buildBrowserHref,
  matchRoute,
  normalizeBasePath,
  normalizePercentEscapes,
  parseAppPath,
  parseLocationPath,
  parseRoutePath,
  stripBasePath,
  type ParsedPath,
  type RoutePattern,
} from "./path";
import type {
  CreateRouterOptions,
  NavigateOptions,
  NotFoundHandler,
  RouteHandler,
  Router,
  RouterListener,
  RouterMatch,
  RouterMiss,
} from "./types";

interface RegisteredRoute {
  pattern: RoutePattern;
  handler: RouteHandler;
}

const REENTRANT_NAVIGATION_ERROR = "Router navigation is already running.";

/**
 * Creates a browser router for app-local path matching, navigation, and subscriptions.
 *
 * @param options - Configuration options for the router, including base path.
 * @returns The initialized router instance.
 * @throws An error when `basePath` is not empty and is not a valid app-local path prefix.
 */
export function createRouter(options: CreateRouterOptions = {}): Router {
  const basePath = normalizeBasePath(options.basePath);
  const routes: RegisteredRoute[] = [];
  const listeners = new Set<RouterListener>();
  let fallbackHandler: NotFoundHandler | undefined;
  let isStarted = false;
  let isNavigating = false;
  let pendingNavigation: { target: ParsedPath; historyUpdate?: () => void } | null = null;

  const assertCanNavigate = (): void => {
    if (isNavigating) {
      throw new Error(REENTRANT_NAVIGATION_ERROR);
    }
  };

  const notify = (match: RouterMatch | null): void => {
    for (const listener of listeners) {
      listener(match);
    }
  };

  interface MatchResult {
    match: RouterMatch;
    route: RegisteredRoute;
  }

  const findMatch = (target: ParsedPath): MatchResult | null => {
    for (const route of routes) {
      const params = matchRoute(route.pattern, target);
      if (params === null) {
        continue;
      }

      const match: RouterMatch = {
        path: route.pattern.path,
        pathname: target.pathname,
        params,
        searchParams: target.searchParams,
        hash: target.hash,
      };

      return { match, route };
    }

    return null;
  };

  const runTarget = (target: ParsedPath): RouterMatch | null => {
    assertCanNavigate();
    isNavigating = true;

    try {
      let currentTarget: ParsedPath | null = target;
      let lastMatch: RouterMatch | null = null;

      while (currentTarget !== null) {
        const result = findMatch(currentTarget);
        if (result !== null) {
          result.route.handler(result.match);
          notify(result.match);
          lastMatch = result.match;
        } else {
          const miss: RouterMiss = {
            pathname: currentTarget.pathname,
            searchParams: currentTarget.searchParams,
            hash: currentTarget.hash,
          };

          fallbackHandler?.(miss);
          notify(null);
          lastMatch = null;
        }

        if (pendingNavigation !== null) {
          pendingNavigation.historyUpdate?.();
          currentTarget = pendingNavigation.target;
          pendingNavigation = null;
        } else {
          currentTarget = null;
        }
      }

      return lastMatch;
    } finally {
      isNavigating = false;
      pendingNavigation = null;
    }
  };

  const handlePopState = (): void => {
    const browserWindow = getBrowserWindow();
    if (browserWindow === null) {
      return;
    }

    runTarget(parseLocationPath(browserWindow.location, basePath));
  };

  const handleLinkClick = (e: MouseEvent): void => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const browserWindow = getBrowserWindow();
    if (browserWindow === null) {
      return;
    }

    const anchor = (e.target as HTMLElement).closest("a");
    if (
      anchor === null ||
      !anchor.hasAttribute("data-router-link") ||
      (anchor.target !== "" && anchor.target !== "_self") ||
      anchor.hasAttribute("download")
    ) {
      return;
    }

    const href = anchor.getAttribute("href");
    if (href === null) {
      return;
    }

    try {
      const url = new URL(href, browserWindow.location.href);
      if (url.origin !== browserWindow.location.origin) {
        return;
      }

      const appPathname = stripBasePath(normalizePercentEscapes(url.pathname), basePath);
      if (appPathname === null) {
        return;
      }

      e.preventDefault();
      router.navigate(appPathname + url.search + url.hash);
    } catch {
      // Ignore URL parsing errors
    }
  };

  const router: Router = {
    on(path, handler) {
      routes.push({ pattern: parseRoutePath(path), handler });

      return router;
    },

    notFound(handler) {
      fallbackHandler = handler;

      return router;
    },

    start() {
      assertCanNavigate();
      const browserWindow = getBrowserWindow();
      if (browserWindow === null) {
        return null;
      }
      if (!isStarted) {
        browserWindow.addEventListener("popstate", handlePopState);
        if (options.interceptLinks === true) {
          browserWindow.document.addEventListener("click", handleLinkClick);
        }
        isStarted = true;
      }

      return runTarget(parseLocationPath(browserWindow.location, basePath));
    },

    navigate(to, options: NavigateOptions = {}) {
      const target = parseAppPath(to);
      const browserWindow = getBrowserWindow();

      const updateHistory = (): void => {
        if (browserWindow !== null) {
          const href = buildBrowserHref(to, basePath);
          if (options.shouldReplace === true) {
            browserWindow.history.replaceState(options.state, "", href);
          } else {
            browserWindow.history.pushState(options.state, "", href);
          }
        }
      };

      if (isNavigating) {
        pendingNavigation = { target, historyUpdate: updateHistory };

        return null;
      }

      updateHistory();

      return runTarget(target);
    },

    match(to) {
      return findMatch(parseAppPath(to))?.match ?? null;
    },

    href(to) {
      return buildBrowserHref(to, basePath);
    },

    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    destroy() {
      const browserWindow = getBrowserWindow();
      if (browserWindow !== null && isStarted) {
        browserWindow.removeEventListener("popstate", handlePopState);
        if (options.interceptLinks === true) {
          browserWindow.document.removeEventListener("click", handleLinkClick);
        }
      }
      isStarted = false;

      listeners.clear();
    },
  };

  return router;
}

function getBrowserWindow(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window;
}
