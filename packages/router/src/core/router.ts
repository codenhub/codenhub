import { createHistory } from "./history";
import { createNavigation } from "./navigation";
import { buildBrowserHref, getBrowserWindow, normalizeBasePath, parseAppPath } from "./path";
import { createRegistry } from "./registry";
import type { CreateRouterOptions, NavigateOptions, Router } from "./types";

/**
 * Creates a browser router for app-local path matching, navigation, and subscriptions.
 *
 * @param options - Configuration options for the router, including base path and link interception.
 * @returns The initialized router instance.
 * @throws {Error} If `basePath` is not empty and is not a valid app-local path prefix.
 */
export function createRouter(options: CreateRouterOptions = {}): Router {
  const basePath = normalizeBasePath(options.basePath);
  const registry = createRegistry();
  const nav = createNavigation(registry);
  const history = createHistory({
    nav,
    basePath,
    shouldInterceptLinks: options.shouldInterceptLinks === true,
    navigateFn: (to, navOptions) => router.navigate(to, navOptions),
  });

  const router: Router = {
    on(path, handler) {
      registry.add(path, handler);
      return router;
    },

    notFound(handler) {
      registry.setFallback(handler);
      return router;
    },

    start() {
      return history.start();
    },

    navigate(to: string, navOptions: NavigateOptions = {}) {
      const target = parseAppPath(to);

      const { shouldReplace, state } = navOptions;

      // Build the history update as a deferred callback so it can be enqueued
      // and executed inside the navigation loop in the correct order.
      const updateHistory = (): void => {
        const browserWindow = getBrowserWindow();
        if (browserWindow !== null) {
          const href = buildBrowserHref(target, basePath);
          if (shouldReplace === true) {
            browserWindow.history.replaceState(state, "", href);
          } else {
            browserWindow.history.pushState(state, "", href);
          }
        }
      };

      if (nav.isActive()) {
        nav.enqueue(target, updateHistory);
        return null;
      }

      try {
        history.captureCurrent();
        updateHistory();
        return nav.run(target);
      } catch (error) {
        history.restore();
        throw error;
      }
    },

    match(to) {
      return nav.match(to);
    },

    href(to) {
      return buildBrowserHref(parseAppPath(to), basePath);
    },

    subscribe(listener) {
      return nav.subscribe(listener);
    },

    destroy() {
      history.destroy();
    },
  };

  return router;
}
