import { createHistory } from "./history";
import { createNavigation } from "./navigation";
import { buildBrowserHref, normalizeBasePath, parseAppPath } from "./path";
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
  const hist = createHistory({
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
      return hist.start();
    },

    navigate(to: string, navOptions: NavigateOptions = {}) {
      const target = parseAppPath(to);
      const browserWindow = typeof window === "undefined" ? null : window;

      // Build the history update as a deferred callback so it can be enqueued
      // and executed inside the navigation loop in the correct order.
      const updateHistory = (): void => {
        if (browserWindow !== null) {
          const href = buildBrowserHref(target, basePath);
          if (navOptions.shouldReplace === true) {
            browserWindow.history.replaceState(navOptions.state, "", href);
          } else {
            browserWindow.history.pushState(navOptions.state, "", href);
          }
        }
      };

      if (nav.isActive()) {
        nav.enqueue(target, updateHistory);
        return null;
      }

      updateHistory();
      return nav.run(target);
    },

    match(to) {
      return nav.match(to);
    },

    href(to) {
      return buildBrowserHref(to, basePath);
    },

    subscribe(listener) {
      return nav.subscribe(listener);
    },

    destroy() {
      hist.destroy();
    },
  };

  return router;
}
