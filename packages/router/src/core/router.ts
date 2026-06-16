import {
  buildBrowserHref,
  matchRoute,
  normalizeBasePath,
  parseAppPath,
  parseLocationPath,
  parseRoutePath,
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
 * Throws when `basePath` is not empty and is not a valid app-local path prefix.
 */
export function createRouter(options: CreateRouterOptions = {}): Router {
  const basePath = normalizeBasePath(options.basePath);
  const routes: RegisteredRoute[] = [];
  const listeners = new Set<RouterListener>();
  let fallbackHandler: NotFoundHandler | undefined;
  let isStarted = false;
  let isNavigating = false;

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

  const findMatch = (target: ParsedPath): RouterMatch | null => {
    for (const route of routes) {
      const params = matchRoute(route.pattern, target);
      if (params === null) {
        continue;
      }

      return {
        path: route.pattern.path,
        pathname: target.pathname,
        params,
        searchParams: target.searchParams,
        hash: target.hash,
      };
    }

    return null;
  };

  const runTarget = (target: ParsedPath): RouterMatch | null => {
    assertCanNavigate();
    isNavigating = true;

    try {
      const match = findMatch(target);
      if (match !== null) {
        const route = routes.find((candidate) => candidate.pattern.path === match.path);
        route?.handler(match);
        notify(match);

        return match;
      }

      const miss: RouterMiss = {
        pathname: target.pathname,
        searchParams: target.searchParams,
        hash: target.hash,
      };

      fallbackHandler?.(miss);
      notify(null);

      return null;
    } finally {
      isNavigating = false;
    }
  };

  const handlePopState = (): void => {
    const browserWindow = getBrowserWindow();
    if (browserWindow === null) {
      return;
    }

    runTarget(parseLocationPath(browserWindow.location, basePath));
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
        isStarted = true;
      }

      return runTarget(parseLocationPath(browserWindow.location, basePath));
    },

    navigate(to, options: NavigateOptions = {}) {
      assertCanNavigate();
      const target = parseAppPath(to);
      const browserWindow = getBrowserWindow();

      if (browserWindow !== null) {
        const href = buildBrowserHref(to, basePath);
        if (options.replace === true) {
          browserWindow.history.replaceState(options.state, "", href);
        } else {
          browserWindow.history.pushState(options.state, "", href);
        }
      }

      return runTarget(target);
    },

    match(to) {
      return findMatch(parseAppPath(to));
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
        isStarted = false;
      }

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
