import type { Navigation } from "./navigation";
import { assertNotNavigating } from "./navigation";
import { buildBrowserHref, normalizePercentEscapes, parseAppPath, parseLocationPath, stripBasePath } from "./path";
import type { NavigateOptions, RouterMatch, RouterMiss } from "./types";

const LEFT_CLICK_BUTTON = 0;

interface HistoryOptions {
  nav: Navigation;
  basePath: string;
  shouldInterceptLinks: boolean;
  /**
   * Provided by router.ts so link-click navigations write browser history
   * through the same path as programmatic `router.navigate()` calls.
   */
  navigateFn: (to: string, options?: NavigateOptions) => RouterMatch | null;
}

/** @internal */
export interface History {
  /**
   * Attaches browser event listeners and matches the current browser location.
   *
   * Safe to call multiple times — repeated calls return the current match and
   * are otherwise no-ops.
   *
   * @returns The matched route info, or null if no route matched or not running
   *   in a browser environment.
   * @throws {Error} If called during active navigation.
   */
  start(): RouterMatch | null;

  /**
   * Removes all browser event listeners and resets navigation state.
   *
   * The router can be restarted after destroy.
   */
  destroy(): void;
}

/** @internal */
export function createHistory({ nav, basePath, shouldInterceptLinks, navigateFn }: HistoryOptions): History {
  let isStarted = false;

  function getBrowserWindow(): Window | null {
    return typeof window === "undefined" ? null : window;
  }

  function buildMissFromLocation(location: Location): RouterMiss {
    const { search } = location;
    return {
      pathname: normalizePercentEscapes(location.pathname || "/"),
      searchParams: new URLSearchParams(search),
      hash: location.hash,
    };
  }

  function handlePopState(e: PopStateEvent): void {
    const browserWindow = getBrowserWindow();
    if (browserWindow === null) {
      return;
    }

    const target = parseLocationPath(browserWindow.location, basePath);
    const miss = target === null ? buildMissFromLocation(browserWindow.location) : undefined;

    // When popstate fires mid-navigation, queue the entry so ordering is preserved.
    // The historyUpdate replays replaceState with the original state object so that
    // the browser history entry reflects exactly what the popstate carried.
    if (nav.isActive()) {
      const state = e.state;
      nav.runFromHistory(target, miss, () => {
        const href =
          target !== null
            ? buildBrowserHref(target.href, basePath)
            : normalizePercentEscapes(browserWindow.location.pathname || "/") +
              browserWindow.location.search +
              browserWindow.location.hash;
        browserWindow.history.replaceState(state, "", href);
      });
      return;
    }

    nav.runFromHistory(target, miss);
  }

  function resolveAnchor(e: MouseEvent): HTMLAnchorElement | SVGAElement | null {
    if (typeof e.composedPath === "function") {
      for (const el of e.composedPath()) {
        if (el instanceof Element && el.localName === "a") {
          return el as HTMLAnchorElement | SVGAElement;
        }
      }
      return null;
    }

    const target = e.target;
    if (target instanceof Element) {
      return target.closest("a");
    }

    return null;
  }

  function handleLinkClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== LEFT_CLICK_BUTTON || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const browserWindow = getBrowserWindow();
    if (browserWindow === null) {
      return;
    }

    const anchor = resolveAnchor(e);
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
      // Ignore URL parsing / validation errors and let native browser navigation handle it.
      return;
    }

    e.preventDefault();
    // Use navigateFn (router.navigate) so browser history is written
    // consistently with programmatic navigation calls.
    navigateFn(to);
  }

  return {
    start() {
      assertNotNavigating(nav);

      if (isStarted) {
        return nav.currentMatch();
      }

      const browserWindow = getBrowserWindow();
      if (browserWindow === null) {
        return null;
      }

      browserWindow.addEventListener("popstate", handlePopState);
      if (shouldInterceptLinks) {
        browserWindow.document.addEventListener("click", handleLinkClick);
      }
      isStarted = true;

      const target = parseLocationPath(browserWindow.location, basePath);
      const miss = target === null ? buildMissFromLocation(browserWindow.location) : undefined;
      nav.runFromHistory(target, miss);

      return nav.currentMatch();
    },

    destroy() {
      const browserWindow = getBrowserWindow();
      if (browserWindow !== null && isStarted) {
        browserWindow.removeEventListener("popstate", handlePopState);
        if (shouldInterceptLinks) {
          browserWindow.document.removeEventListener("click", handleLinkClick);
        }
      }
      isStarted = false;
      nav.reset();
    },
  };
}
