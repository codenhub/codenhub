import { createRouter } from "../core/router";
import type { RouterMatch } from "../core/types";
import { connectRouterLinks } from "./links";
import type {
  MountedRouter,
  MountRouterOptions,
  PageContext,
  PageMatch,
  PageOptions,
  PageRoute,
  PageRouter,
  PageRouterListener,
} from "./types";

/**
 * Mounts page routes into a DOM outlet and returns a router controller.
 * Throws when a selector outlet does not match an element, route lifecycle code throws,
 * or a destroyed controller is used again.
 */
export function mountRouter(options: MountRouterOptions): MountedRouter {
  const outlet = resolveOutlet(options.outlet);
  const coreRouter = createRouter({ basePath: options.basePath });
  const routesByPath = new Map<string, PageRoute>();
  const listeners = new Set<PageRouterListener>();
  let activeContext: PageContext | null = null;
  let activeMatch: PageMatch | null = null;
  let disconnectLinks: (() => void) | undefined;
  let isDestroyed = false;

  const assertActive = (): void => {
    if (isDestroyed) {
      throw new Error("Mounted router has been destroyed.");
    }
  };

  const clearActivePage = (): void => {
    const context = activeContext;
    activeContext = null;
    activeMatch = null;

    if (context !== null) {
      context.route.destroy?.(context);
    }

    outlet.replaceChildren();
  };

  const renderRoute = (route: PageRoute, match: RouterMatch): PageMatch => {
    clearActivePage();

    const page = createPageElement(options.page, route.page);
    const pageMatch: PageMatch = { ...match, route };
    const context: PageContext = { ...pageMatch, page, router: pageRouter };

    route.render(context);
    applyTitle(route, context);
    outlet.replaceChildren(page);

    activeContext = context;
    activeMatch = pageMatch;

    return pageMatch;
  };

  for (const route of options.routes) {
    if (!routesByPath.has(route.path)) {
      routesByPath.set(route.path, route);
    }

    coreRouter.on(route.path, (match) => {
      renderRoute(route, match);
    });
  }

  coreRouter.notFound(() => {
    clearActivePage();
  });

  const unsubscribeCore = coreRouter.subscribe((match) => {
    notifyListeners(listeners, match === null ? null : activeMatch);
  });

  const mountedRouter: MountedRouter = {
    start() {
      assertActive();
      coreRouter.start();

      return activeMatch;
    },
    navigate(to, navigateOptions) {
      assertActive();
      coreRouter.navigate(to, navigateOptions);

      return activeMatch;
    },
    match(to) {
      assertActive();
      const match = coreRouter.match(to);
      if (match === null) {
        return null;
      }

      return createPageMatch(match, routesByPath.get(match.path));
    },
    href(to) {
      assertActive();
      return coreRouter.href(to);
    },
    subscribe(listener) {
      assertActive();
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      if (isDestroyed) {
        return;
      }

      isDestroyed = true;
      disconnectLinks?.();
      unsubscribeCore();
      coreRouter.destroy();
      listeners.clear();
      clearActivePage();
      isDestroyed = true;
    },
  };

  const pageRouter: PageRouter = {
    navigate(to, navigateOptions) {
      return mountedRouter.navigate(to, navigateOptions);
    },
    match(to) {
      return mountedRouter.match(to);
    },
    href(to) {
      return mountedRouter.href(to);
    },
  };

  if (options.links !== undefined && options.links !== false) {
    const linkOptions = options.links === true ? {} : options.links;
    disconnectLinks = connectRouterLinks({ ...linkOptions, router: mountedRouter });
  }

  return mountedRouter;
}

function resolveOutlet(outlet: Element | string): Element {
  if (typeof outlet !== "string") {
    return outlet;
  }

  const element = document.querySelector(outlet);
  if (element === null) {
    throw new Error(`Router outlet not found for selector: ${outlet}`);
  }

  return element;
}

function createPageElement(mountPage: PageOptions | undefined, routePage: PageOptions | undefined): HTMLElement {
  const pageOptions = { ...mountPage, ...routePage };
  const page = document.createElement(pageOptions.tag ?? "main");

  if (pageOptions.className !== undefined) {
    page.className = pageOptions.className;
  }

  return page;
}

function applyTitle(route: PageRoute, context: PageContext): void {
  if (route.title === undefined) {
    return;
  }

  document.title = typeof route.title === "function" ? route.title(context) : route.title;
}

function createPageMatch(match: RouterMatch, route: PageRoute | undefined): PageMatch | null {
  if (route === undefined) {
    return null;
  }

  return { ...match, route };
}

function notifyListeners(listeners: Set<PageRouterListener>, match: PageMatch | null): void {
  for (const listener of listeners) {
    listener(match);
  }
}
