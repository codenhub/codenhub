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
    it("matches the current browser location on start", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/", handler), startedRouters);
      history.replaceState(null, "", "/");

      const match = router.start();
      expect(match?.pathname).toBe("/");
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("is idempotent — repeated calls do not re-run handlers", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/", handler), startedRouters);

      const match1 = router.start();
      const match2 = router.start();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(match1).toBe(match2);
    });

    it("returns null when no route matches the current location", () => {
      const router = withRouter(createRouter().on("/other", vi.fn()), startedRouters);
      history.replaceState(null, "", "/");

      const match = router.start();
      expect(match).toBeNull();
    });

    it("throws when called during active navigation", () => {
      const router = withRouter(createRouter(), startedRouters);
      router.on("/start", () => {
        expect(() => router.start()).toThrow("Router navigation is already running.");
      });
      router.navigate("/start");
    });

    it("strips the base path when matching the browser location", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ basePath: "/app" }).on("/settings", handler), startedRouters);
      history.replaceState(null, "", "/app/settings?tab=profile#details");

      const match = router.start();
      expect(match?.path).toBe("/settings");
      expect(match?.pathname).toBe("/settings");
      expect(match?.hash).toBe("#details");
      expect(match?.searchParams.get("tab")).toBe("profile");
    });

    it("calls the not-found handler when the location is outside basePath", () => {
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

    it("matches basePath + trailing slash as the root route", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter({ basePath: "/app" }).on("/", handler), startedRouters);
      history.replaceState(null, "", "/app/");

      const match = router.start();
      expect(match?.pathname).toBe("/");
      expect(handler).toHaveBeenCalled();
    });

    it("can be restarted after being destroyed", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/", handler), startedRouters);

      router.start();
      router.destroy();
      router.start();

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe("navigate — browser history writes", () => {
    it("pushes a new history entry by default", () => {
      const router = withRouter(createRouter().on("/target", vi.fn()), startedRouters);

      router.navigate("/target");

      expect(location.pathname).toBe("/target");
    });

    it("replaces the history entry when shouldReplace is true", () => {
      const router = withRouter(createRouter().on("/target", vi.fn()), startedRouters);

      router.navigate("/target", { shouldReplace: true, state: { source: "test" } });

      expect(location.pathname).toBe("/target");
      expect(history.state).toEqual({ source: "test" });
    });

    it("prepends the base path to the history href", () => {
      const router = withRouter(createRouter({ basePath: "/app" }).on("/settings", vi.fn()), startedRouters);

      router.navigate("/settings?tab=billing", { shouldReplace: true });

      expect(location.pathname).toBe("/app/settings");
      expect(location.search).toBe("?tab=billing");
    });
  });

  describe("popstate", () => {
    it("navigates when popstate fires", () => {
      const handler = vi.fn();
      const router = withRouter(createRouter().on("/next", handler), startedRouters);
      router.start();

      history.pushState(null, "", "/next");
      dispatchEvent(new PopStateEvent("popstate"));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("queues popstate events that arrive during active navigation", () => {
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

    it("replays the popstate state when executing a queued popstate navigation", () => {
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

    it("removes the popstate listener when destroyed", () => {
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

    it("intercepts clicks on anchors with data-router-link", () => {
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

    it("does not intercept clicks on anchors without data-router-link", () => {
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

    it("does not intercept when shouldInterceptLinks is false", () => {
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

    it("does not intercept clicks with modifier keys", () => {
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

    it("does not intercept external origin clicks", () => {
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

    it("does not intercept clicks on paths outside basePath", () => {
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

    it("does not intercept clicks with a non-self target attribute", () => {
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

    it("does not intercept clicks on anchors without href", () => {
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

    it("does not intercept clicks on download links", () => {
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

    it("does not prevent default on invalid paths with backslashes", () => {
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

    it("does not crash on non-Element click targets", () => {
      const router = withRouter(createRouter({ shouldInterceptLinks: true }), startedRouters);
      router.start();

      const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
      expect(() => document.dispatchEvent(event)).not.toThrow();
    });

    it("intercepts SVG anchor clicks with data-router-link", () => {
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

    it("intercepts SVG anchor clicks using xlink:href", () => {
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

    it("intercepts anchor clicks inside a shadow DOM", () => {
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

    it("removes the link-click listener when destroyed", () => {
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

    it("propagates errors thrown by route handlers through link-click events", () => {
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
    it("clears pending navigations so they do not run after destroy", () => {
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

    it("removes subscribers", () => {
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
});

// ---------------------------------------------------------------------------
// SSR (no browser APIs)
// ---------------------------------------------------------------------------

describe("History — SSR (no browser APIs)", () => {
  it("start returns null when window is not available", () => {
    const router = createRouter().on("/settings", vi.fn());
    expect(router.start()).toBeNull();
  });

  it("start returns null when basePath is configured but window is unavailable", () => {
    const router = createRouter({ basePath: "/app" }).on("/settings", vi.fn());
    expect(router.start()).toBeNull();
  });

  it("handles href building with and without base paths", () => {
    const routerWithBase = createRouter({ basePath: "/app" });
    const routerWithoutBase = createRouter();

    expect(routerWithBase.href("/settings")).toBe("/app/settings");
    expect(routerWithBase.href("/")).toBe("/app/");
    expect(routerWithoutBase.href("/settings")).toBe("/settings");
  });

  it("navigate and match work without browser history", () => {
    const handler = vi.fn();
    const listener = vi.fn();
    const router = createRouter().on("/users/:id", handler);
    router.subscribe(listener);

    const match = router.navigate("/users/42?tab=posts#bio");
    expect(match?.params["id"]).toBe("42");
    expect(match?.searchParams.get("tab")).toBe("posts");
    expect(match?.hash).toBe("#bio");
    expect(handler).toHaveBeenCalledWith(match);
    expect(listener).toHaveBeenCalledWith(match);
  });

  it("throws validation errors on match with invalid paths", () => {
    const router = createRouter();
    expect(() => router.match("settings")).toThrow(Error);
    expect(() => router.match("/\\example.com/settings")).toThrow(Error);
  });
});
