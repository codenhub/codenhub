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

interface MatchResult {
  match: RouterMatch;
  route: RegisteredRoute;
}

const REENTRANT_NAVIGATION_ERROR = "Router navigation is already running.";
const LEFT_CLICK_BUTTON = 0;

/**
 * Creates a browser router for app-local path matching, navigation, and subscriptions.
 *
 * @param options - Configuration options for the router, including base path.
 * @returns The initialized router instance.
 * @throws {Error} If `basePath` is not empty and is not a valid app-local path prefix.
 */
export function createRouter(options: CreateRouterOptions = {}): Router {
  const basePath = normalizeBasePath(options.basePath);
  const routes: RegisteredRoute[] = [];
  const listeners = new Set<RouterListener>();
  let fallbackHandler: NotFoundHandler | undefined;
  let isStarted = false;
  let isNavigating = false;
  const pendingNavigations: Array<{
    target: ParsedPath | null;
    miss?: RouterMiss;
    historyUpdate?: () => void;
  }> = [];
  let currentMatch: RouterMatch | null = null;

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

  const runTarget = (target: ParsedPath | null, miss?: RouterMiss): RouterMatch | null => {
    // Invariant: callers must verify !isNavigating before calling runTarget.
    isNavigating = true;

    try {
      let currentTarget: ParsedPath | null = target;
      let currentMiss: RouterMiss | undefined = miss;
      let lastMatch: RouterMatch | null = null;

      while (currentTarget !== null || currentMiss !== undefined) {
        if (currentTarget !== null) {
          const result = findMatch(currentTarget);
          if (result !== null) {
            result.route.handler(result.match);
            notify(result.match);
            lastMatch = result.match;
          } else {
            const missObj: RouterMiss = {
              pathname: currentTarget.pathname,
              searchParams: currentTarget.searchParams,
              hash: currentTarget.hash,
            };

            fallbackHandler?.(missObj);
            notify(null);
            lastMatch = null;
          }
        } else if (currentMiss !== undefined) {
          fallbackHandler?.(currentMiss);
          notify(null);
          lastMatch = null;
        }

        const nextPending = pendingNavigations.shift();
        if (nextPending !== undefined) {
          nextPending.historyUpdate?.();
          currentTarget = nextPending.target;
          currentMiss = nextPending.miss;
        } else {
          currentTarget = null;
          currentMiss = undefined;
        }
      }

      currentMatch = lastMatch;
      return lastMatch;
    } finally {
      isNavigating = false;
    }
  };

  const handlePopState = (e: PopStateEvent): void => {
    const browserWindow = getBrowserWindow();
    if (browserWindow === null) {
      return;
    }

    const target = parseLocationPath(browserWindow.location, basePath);
    let miss: RouterMiss | undefined;
    if (target === null) {
      const search = browserWindow.location.search;
      miss = {
        pathname: normalizePercentEscapes(browserWindow.location.pathname || "/"),
        searchParams: new URLSearchParams(search),
        hash: browserWindow.location.hash,
      };
    }

    if (isNavigating) {
      const state = e.state;
      pendingNavigations.push({
        target,
        miss,
        historyUpdate: () => {
          const href =
            target !== null
              ? buildBrowserHref(target.href, basePath)
              : normalizePercentEscapes(browserWindow.location.pathname || "/") +
                browserWindow.location.search +
                browserWindow.location.hash;
          browserWindow.history.replaceState(state, "", href);
        },
      });
      return;
    }

    runTarget(target, miss);
  };

  const handleLinkClick = (e: MouseEvent): void => {
    if (e.defaultPrevented || e.button !== LEFT_CLICK_BUTTON || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const browserWindow = getBrowserWindow();
    if (browserWindow === null) {
      return;
    }

    let anchor: HTMLAnchorElement | SVGAElement | null = null;
    if (typeof e.composedPath === "function") {
      for (const el of e.composedPath()) {
        if (el instanceof Element && el.localName === "a") {
          anchor = el as HTMLAnchorElement | SVGAElement;
          break;
        }
      }
    } else {
      const target = e.target;
      if (target instanceof Element) {
        anchor = target.closest("a");
      }
    }

    if (anchor === null || !anchor.hasAttribute("data-router-link") || anchor.hasAttribute("download")) {
      return;
    }

    const targetAttr = anchor.getAttribute("target");
    if (targetAttr !== null && targetAttr !== "" && targetAttr.toLowerCase() !== "_self") {
      return;
    }

    const href = anchor.getAttribute("href") ?? anchor.getAttribute("xlink:href");
    if (href === null) {
      return;
    }

    let to: string;
    try {
      const url = new URL(href, browserWindow.location.href);
      if (url.origin !== browserWindow.location.origin) {
        return;
      }

      const appPathname = stripBasePath(normalizePercentEscapes(url.pathname), basePath);
      if (appPathname === null) {
        return;
      }

      to = appPathname + url.search + url.hash;
      parseAppPath(to);
    } catch {
      // Ignore URL parsing / validation errors and let native browser navigation handle it
      return;
    }

    e.preventDefault();
    router.navigate(to);
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
      if (!isStarted) {
        const browserWindow = getBrowserWindow();
        if (browserWindow === null) {
          return null;
        }
        browserWindow.addEventListener("popstate", handlePopState);
        if (options.shouldInterceptLinks === true) {
          browserWindow.document.addEventListener("click", handleLinkClick);
        }
        isStarted = true;
        const target = parseLocationPath(browserWindow.location, basePath);
        let miss: RouterMiss | undefined;
        if (target === null) {
          const search = browserWindow.location.search;
          miss = {
            pathname: normalizePercentEscapes(browserWindow.location.pathname || "/"),
            searchParams: new URLSearchParams(search),
            hash: browserWindow.location.hash,
          };
        }
        currentMatch = runTarget(target, miss);
      }

      return currentMatch;
    },

    navigate(to, navOptions: NavigateOptions = {}) {
      const target = parseAppPath(to);
      const browserWindow = getBrowserWindow();

      const updateHistory = (): void => {
        if (browserWindow !== null) {
          const href = buildBrowserHref(to, basePath);
          if (navOptions.shouldReplace === true) {
            browserWindow.history.replaceState(navOptions.state, "", href);
          } else {
            browserWindow.history.pushState(navOptions.state, "", href);
          }
        }
      };

      if (isNavigating) {
        pendingNavigations.push({ target, historyUpdate: updateHistory });

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
        if (options.shouldInterceptLinks === true) {
          browserWindow.document.removeEventListener("click", handleLinkClick);
        }
      }
      isStarted = false;
      pendingNavigations.length = 0;
      currentMatch = null;

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
