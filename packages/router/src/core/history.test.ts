// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouter } from "..";
import type { Router } from "..";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withRouter(router: Router, startedRouters: Router[]): Router {
  startedRouters.push(router);
  return router;
}

// ---------------------------------------------------------------------------
// Browser history integration
// ---------------------------------------------------------------------------

describe("History — browser integration", () => {
  const startedRouters: Router[] = [];

  beforeEach(() => {
    history.replaceState(null, "", "/");
  });

  afterEach(() => {
    for (const router of startedRouters.splice(0)) {
      router.destroy();
    }
    vi.restoreAllMocks();
  });

  describe("start", () => {
    it("shouldMatchCurrentBrowserLocationOnStart", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/", handler), startedRouters);
      history.replaceState(null, "", "/");

      const match = router.start();
      expect(match?.pathname).toBe("/");
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("shouldBeIdempotentAndNotReRunHandlersOnRepeatedCalls", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/", handler), startedRouters);

      const match1 = router.start();
      const match2 = router.start();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(match1).toBe(match2);
    });

    it("shouldReturnNullWhenNoRouteMatchesCurrentLocation", () => {
      const router = withRouter(createRouter().on("/other", vi.fn()), startedRouters);
      history.replaceState(null, "", "/");

      const match = router.start();
      expect(match).toBeNull();
    });

    it("shouldThrowWhenCalledDuringActiveNavigation", () => {
      const router = withRouter(createRouter(), startedRouters);
      router.on("/start", () => {
        expect(() => router.start()).toThrow("Router navigation is already running.");
      });
      router.navigate("/start");
    });

    it("shouldStripBasePathWhenMatchingBrowserLocation", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ basePath: "/app" }).on("/settings", handler), startedRouters);
      history.replaceState(null, "", "/app/settings?tab=profile#details");

      const match = router.start();
      expect(match?.path).toBe("/settings");
      expect(match?.pathname).toBe("/settings");
      expect(match?.hash).toBe("#details");
      expect(match?.searchParams.get("tab")).toBe("profile");
    });

    it("shouldCallNotFoundHandlerWhenLocationIsOutsideBasePath", () => {
      const fallback = vi.fn();
      const listener = vi.fn();
      const router = withRouter(
        createRouter({ basePath: "/app" }).on("/settings", vi.fn()).notFound(fallback),
        startedRouters,
      );
      router.subscribe(listener);
      history.replaceState(null, "", "/settings?from=outside#details");

      const match = router.start();
      expect(match).toBeNull();
      expect(fallback).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/settings" }));
      expect(listener).toHaveBeenCalledWith(null);
    });

    it("shouldMatchBasePathPlusTrailingSlashAsRootRoute", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ basePath: "/app" }).on("/", handler), startedRouters);
      history.replaceState(null, "", "/app/");

      const match = router.start();
      expect(match?.pathname).toBe("/");
      expect(handler).toHaveBeenCalled();
    });

    it("shouldBeRestartableAfterDestroy", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/", handler), startedRouters);

      router.start();
      router.destroy();
      router.start();

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("shouldCleanupListenersAndNotBeStartedIfInitialRunThrows", () => {
      const handler = vi.fn().mockImplementation(() => {
        throw new Error("Initial route failed.");
      });
      const router = withRouter(createRouter().on("/", handler), startedRouters);

      expect(() => router.start()).toThrow("Initial route failed.");

      // If the router is not started, calling start() again will attempt to run the route handler again.
      expect(() => router.start()).toThrow("Initial route failed.");
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("navigate — browser history writes", () => {
    it("shouldPushNewHistoryEntryByDefault", () => {
      const router = withRouter(createRouter().on("/target", vi.fn()), startedRouters);

      router.navigate("/target");

      expect(location.pathname).toBe("/target");
    });

    it("shouldReplaceHistoryEntryWhenShouldReplaceIsTrue", () => {
      const router = withRouter(createRouter().on("/target", vi.fn()), startedRouters);

      router.navigate("/target", { shouldReplace: true, state: { source: "test" } });

      expect(location.pathname).toBe("/target");
      expect(history.state).toEqual({ source: "test" });
    });

    it("shouldPrependBasePathToHistoryHref", () => {
      const router = withRouter(createRouter({ basePath: "/app" }).on("/settings", vi.fn()), startedRouters);

      router.navigate("/settings?tab=billing", { shouldReplace: true });

      expect(location.pathname).toBe("/app/settings");
      expect(location.search).toBe("?tab=billing");
    });
  });

  describe("popstate", () => {
    it("shouldNavigateWhenPopstateFires", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/next", handler), startedRouters);
      router.start();

      history.pushState(null, "", "/next");
      dispatchEvent(new PopStateEvent("popstate"));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("shouldQueuePopstateEventsThatArriveDuringActiveNavigation", () => {
      const log: string[] = [];
      const router = withRouter(createRouter(), startedRouters);

      router.on("/start", () => {
        log.push("start");
        history.pushState(null, "", "/popstate-target");
        dispatchEvent(new PopStateEvent("popstate"));
      });
      router.on("/popstate-target", () => {
        log.push("popstate");
      });

      router.start();
      router.navigate("/start");
      expect(log).toEqual(["start", "popstate"]);
    });

    it("shouldReplayPopstateStateWhenExecutingQueuedPopstateNavigation", () => {
      const router = withRouter(createRouter(), startedRouters);
      let stateDuringHandler: unknown = null;

      router.on("/start", () => {
        history.pushState({ val: "original" }, "", "/popstate-target");
        dispatchEvent(new PopStateEvent("popstate", { state: { val: "queued" } }));
        router.navigate("/other");
      });
      router.on("/other", vi.fn());
      router.on("/popstate-target", () => {
        stateDuringHandler = history.state;
      });

      router.start();
      router.navigate("/start");

      expect(stateDuringHandler).toEqual({ val: "queued" });
    });

    it("shouldRemovePopstateListenerWhenDestroyed", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/next", handler), startedRouters);
      router.start();
      router.destroy();

      history.pushState(null, "", "/next");
      dispatchEvent(new PopStateEvent("popstate"));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("link interception", () => {
    function clickLink(link: HTMLElement | SVGElement): MouseEvent {
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(event);
      return event;
    }

    it("shouldInterceptClicksOnAnchorsWithDataRouterLink", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(true);
      expect(handler).toHaveBeenCalled();
      expect(location.pathname).toBe("/target");

      document.body.removeChild(link);
    });

    it("shouldNotInterceptClicksOnAnchorsWithoutDataRouterLink", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      document.body.appendChild(link);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(link);
    });

    it("shouldNotInterceptWhenShouldInterceptLinksIsFalse", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(link);
    });

    it("shouldNotInterceptClicksWithModifierKeys", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
        const event = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          [modifier]: true,
        });
        link.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }

      document.body.removeChild(link);
    });

    it("shouldNotInterceptExternalOriginClicks", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "https://google.com/target");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(link);
    });

    it("shouldNotInterceptClicksOnPathsOutsideBasePath", () => {
      const handler = vi.fn();
      const router = withRouter(
        createRouter({ basePath: "/app", shouldInterceptLinks: true }).on("/target", handler),
        startedRouters,
      );
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/outside-basepath");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(link);
    });

    it("shouldNotInterceptClicksWithNonSelfTargetAttribute", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      link.setAttribute("target", "_blank");
      document.body.appendChild(link);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(link);
    });

    it("shouldNotInterceptClicksOnAnchorsWithoutHref", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(link);
    });

    it("shouldNotInterceptClicksOnDownloadLinks", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      link.setAttribute("download", "");
      document.body.appendChild(link);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(link);
    });

    it("shouldNotPreventDefaultOnInvalidPathsWithBackslashes", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/\\example.com/settings");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(link);
    });

    it("shouldNotCrashOnNonElementClickTargets", () => {
      const router = withRouter(createRouter({ shouldInterceptLinks: true }), startedRouters);
      router.start();

      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      expect(() => document.dispatchEvent(event)).not.toThrow();
    });

    it("shouldInterceptSvgAnchorClicksWithDataRouterLink", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const link = document.createElementNS("http://www.w3.org/2000/svg", "a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      svg.appendChild(link);
      document.body.appendChild(svg);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(true);
      expect(handler).toHaveBeenCalled();
      expect(location.pathname).toBe("/target");

      document.body.removeChild(svg);
    });

    it("shouldInterceptSvgAnchorClicksUsingXlinkHref", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const link = document.createElementNS("http://www.w3.org/2000/svg", "a");
      link.setAttribute("xlink:href", "/target");
      link.setAttribute("data-router-link", "");
      svg.appendChild(link);
      document.body.appendChild(svg);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(true);
      expect(handler).toHaveBeenCalled();
      expect(location.pathname).toBe("/target");

      document.body.removeChild(svg);
    });

    it("shouldInterceptSvgAnchorClicksUsingNamespacedXlinkHref", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const link = document.createElementNS("http://www.w3.org/2000/svg", "a");
      link.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "/target");
      link.setAttribute("data-router-link", "");
      svg.appendChild(link);
      document.body.appendChild(svg);

      const event = clickLink(link);
      expect(event.defaultPrevented).toBe(true);
      expect(handler).toHaveBeenCalled();
      expect(location.pathname).toBe("/target");

      document.body.removeChild(svg);
    });

    it("shouldInterceptAnchorClicksInsideShadowDom", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const host = document.createElement("div");
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: "open" });

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      shadowRoot.appendChild(link);

      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        composed: true,
      });
      link.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(handler).toHaveBeenCalled();
      expect(location.pathname).toBe("/target");

      document.body.removeChild(host);
    });

    it("shouldInterceptClicksWhenComposedPathIsNotAvailable", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      Object.defineProperty(event, "composedPath", {
        value: undefined,
        configurable: true,
      });

      link.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(handler).toHaveBeenCalled();
      expect(location.pathname).toBe("/target");

      document.body.removeChild(link);
    });

    it("shouldRemoveLinkClickListenerWhenDestroyed", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();
      router.destroy();

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(handler).not.toHaveBeenCalled();

      document.body.removeChild(link);
    });

    it("shouldPropagateErrorsThrownByRouteHandlersThroughLinkClickEvents", () => {
      const handler = vi.fn().mockImplementation(() => {
        throw new Error("Route handler failed");
      });
      const router = withRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler), startedRouters);
      router.start();

      const link = document.createElement("a");
      link.setAttribute("href", "/target");
      link.setAttribute("data-router-link", "");
      document.body.appendChild(link);

      let errorEvent: ErrorEvent | null = null;
      const onError = (e: ErrorEvent) => {
        errorEvent = e;
        e.preventDefault();
      };
      window.addEventListener("error", onError);

      const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(clickEvent);

      window.removeEventListener("error", onError);

      expect(errorEvent).not.toBeNull();
      expect((errorEvent as unknown as ErrorEvent).message).toContain("Route handler failed");
      expect(clickEvent.defaultPrevented).toBe(true);

      document.body.removeChild(link);
    });
  });

  describe("destroy", () => {
    it("shouldClearPendingNavigationsSoTheyDoNotRunAfterDestroy", () => {
      let callCount = 0;
      const router = createRouter();
      router.on("/first", () => {
        callCount++;
        router.navigate("/second");
        router.destroy();
      });
      router.on("/second", () => {
        callCount++;
      });

      router.navigate("/first");
      expect(callCount).toBe(1);
    });

    it("shouldRemoveSubscribersOnDestroy", () => {
      const listener = vi.fn();
      const router = withRouter(createRouter().on("/next", vi.fn()), startedRouters);
      router.subscribe(listener);
      router.start();
      listener.mockClear();
      router.destroy();

      history.pushState(null, "", "/next");
      dispatchEvent(new PopStateEvent("popstate"));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("error restoration", () => {
    it("shouldRestoreBrowserUrlIfRouteHandlerThrows", () => {
      const router = withRouter(createRouter(), startedRouters);
      router.on("/first", () => {
        // Success
      });
      router.on("/fail", () => {
        throw new Error("handler failed");
      });

      router.start();
      router.navigate("/first");
      expect(location.pathname).toBe("/first");

      expect(() => router.navigate("/fail")).toThrow("handler failed");
      expect(location.pathname).toBe("/first");
    });

    it("shouldRestoreBrowserUrlIfStartRouteHandlerThrows", () => {
      const router = withRouter(
        createRouter().on("/fail", () => {
          throw new Error("start failed");
        }),
        startedRouters,
      );
      history.replaceState(null, "", "/fail");

      expect(() => router.start()).toThrow("start failed");
      expect(location.pathname).toBe("/fail");
    });

    it("shouldRestoreBrowserUrlIfPopstateRouteHandlerThrows", () => {
      const router = withRouter(createRouter(), startedRouters);
      router.on("/first", () => {});
      router.on("/fail", () => {
        throw new Error("popstate failed");
      });

      router.start();
      router.navigate("/first");
      expect(location.pathname).toBe("/first");

      let errorEvent: ErrorEvent | null = null;
      const onError = (e: ErrorEvent) => {
        errorEvent = e;
        e.preventDefault();
      };
      window.addEventListener("error", onError);

      // Trigger popstate to /fail
      history.pushState(null, "", "/fail");
      dispatchEvent(new PopStateEvent("popstate"));

      window.removeEventListener("error", onError);

      expect(errorEvent).not.toBeNull();
      expect((errorEvent as unknown as ErrorEvent).message).toContain("popstate failed");
      expect(location.pathname).toBe("/first");
    });
  });

  describe("active instances and link clicks", () => {
    it("shouldWarnWhenMultipleRoutersAreStartedConcurrently", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const router1 = withRouter(createRouter(), startedRouters);
      const router2 = withRouter(createRouter(), startedRouters);
      router1.start();
      router2.start();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Multiple active router instances detected"));
      warnSpy.mockRestore();
    });

    it("shouldNotInterceptClicksWhenTargetIsNotAnElement", () => {
      const router = withRouter(createRouter({ shouldInterceptLinks: true }), startedRouters);
      router.start();

      const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
      // target is document (which is not an Element)
      Object.defineProperty(clickEvent, "target", {
        value: document,
        configurable: true,
      });

      document.dispatchEvent(clickEvent);
      expect(clickEvent.defaultPrevented).toBe(false);
    });

    it("shouldNotInterceptClicksWhenComposedPathIsEmpty", () => {
      const router = withRouter(createRouter({ shouldInterceptLinks: true }), startedRouters);
      router.start();

      const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
      // composedPath returns empty list, and target is document
      Object.defineProperty(clickEvent, "composedPath", {
        value: () => [],
        configurable: true,
      });
      Object.defineProperty(clickEvent, "target", {
        value: document,
        configurable: true,
      });

      document.dispatchEvent(clickEvent);
      expect(clickEvent.defaultPrevented).toBe(false);
    });
  });
});
