// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouter } from ".";
import type { Router } from ".";

describe("createRouter", () => {
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

  function trackStartedRouter(router: Router): Router {
    startedRouters.push(router);

    return router;
  }

  it("matches registered routes in order with decoded params, query strings, and hashes", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const router = createRouter().on("/users/:id", firstHandler).on("/users/settings", secondHandler);

    const match = router.navigate("/users/alice%2042?tab=posts#activity");

    expect(match).toMatchObject({
      path: "/users/:id",
      pathname: "/users/alice%2042",
      params: { id: "alice 42" },
      hash: "#activity",
    });
    expect(match?.searchParams.get("tab")).toBe("posts");
    expect(firstHandler).toHaveBeenCalledWith(match);
    expect(secondHandler).not.toHaveBeenCalled();
  });

  it("strips base paths on browser starts and restores them for hrefs and history navigation", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ basePath: "/app" }).on("/settings", handler));

    history.replaceState(null, "", "/app/settings?tab=profile#details");

    const startedMatch = router.start();

    expect(startedMatch).toMatchObject({ path: "/settings", pathname: "/settings", hash: "#details" });
    expect(startedMatch?.searchParams.get("tab")).toBe("profile");
    expect(router.href("/settings")).toBe("/app/settings");

    const navigatedMatch = router.navigate("/settings?tab=billing", {
      shouldReplace: true,
      state: { source: "test" },
    });

    expect(navigatedMatch?.pathname).toBe("/settings");
    expect(location.pathname).toBe("/app/settings");
    expect(location.search).toBe("?tab=billing");
    expect(history.state).toEqual({ source: "test" });
  });

  it("does not match browser locations outside the configured base path", () => {
    const handler = vi.fn();
    const fallback = vi.fn();
    const listener = vi.fn();
    const router = trackStartedRouter(createRouter({ basePath: "/app" }).on("/settings", handler).notFound(fallback));

    router.subscribe(listener);
    history.replaceState(null, "", "/settings?from=outside#details");

    const match = router.start();

    expect(match).toBeNull();
    expect(handler).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith({
      pathname: "/settings",
      searchParams: expect.any(URLSearchParams),
      hash: "#details",
    });
    expect(fallback.mock.calls[0]?.[0].searchParams.get("from")).toBe("outside");
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("calls fallback handlers and subscribers for misses", () => {
    const fallback = vi.fn();
    const listener = vi.fn();
    const router = createRouter().on("/known", vi.fn()).notFound(fallback);
    const unsubscribe = router.subscribe(listener);

    const match = router.navigate("/missing?from=test#empty");

    expect(match).toBeNull();
    expect(fallback).toHaveBeenCalledWith({
      pathname: "/missing",
      searchParams: expect.any(URLSearchParams),
      hash: "#empty",
    });
    expect(fallback.mock.calls[0]?.[0].searchParams.get("from")).toBe("test");
    expect(listener).toHaveBeenCalledWith(null);

    unsubscribe();
    router.navigate("/known");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("matches static route paths using browser URL encoding", () => {
    const handler = vi.fn();
    const routePath = "/caf\u00e9";
    const router = createRouter().on(routePath, handler);

    const match = router.navigate(routePath);

    expect(match).toMatchObject({ path: routePath, pathname: "/caf%C3%A9" });
    expect(handler).toHaveBeenCalledWith(match);
  });

  it("matches static route paths with equivalent percent-escape casing", () => {
    const handler = vi.fn();
    const routePath = "/caf\u00e9";
    const router = createRouter().on(routePath, handler);

    const match = router.navigate("/caf%c3%a9");

    expect(match).toMatchObject({ path: routePath, pathname: "/caf%C3%A9" });
    expect(handler).toHaveBeenCalledWith(match);
  });

  it("normalizes encoded base paths for browser starts and hrefs", () => {
    const handler = vi.fn();
    const router = createRouter({ basePath: "/caf\u00e9" }).on("/settings", handler);

    history.replaceState(null, "", "/caf%c3%a9/settings?tab=profile");

    const match = router.start();

    expect(match).toMatchObject({ path: "/settings", pathname: "/settings" });
    expect(match?.searchParams.get("tab")).toBe("profile");
    expect(handler).toHaveBeenCalledWith(match);
    expect(router.href("/settings")).toBe("/caf%C3%A9/settings");
  });

  it("captures parameter names that overlap object prototype fields", () => {
    const router = createRouter().on("/users/:__proto__", vi.fn());

    const match = router.navigate("/users/alice");

    expect(match?.params["__proto__"]).toBe("alice");
    expect(Object.hasOwn(match?.params ?? {}, "__proto__")).toBe(true);
  });

  it("returns route params as ordinary objects", () => {
    const router = createRouter().on("/users/:id", vi.fn());

    const match = router.navigate("/users/alice");

    expect(Object.getPrototypeOf(match?.params)).toBe(Object.prototype);
    expect(match?.params.hasOwnProperty("id")).toBe(true);
  });

  it("treats malformed encoded path parameters as misses", () => {
    const handler = vi.fn();
    const fallback = vi.fn();
    const router = createRouter().on("/users/:id", handler).notFound(fallback);

    const match = router.navigate("/users/%E0%A4%A");

    expect(match).toBeNull();
    expect(handler).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledWith({
      pathname: "/users/%E0%A4%A",
      searchParams: expect.any(URLSearchParams),
      hash: "",
    });
  });

  it("rejects route paths with queries, hashes, and duplicate parameter names", () => {
    const router = createRouter();
    const handler = vi.fn();

    expect(() => router.on("/users?tab=active", handler)).toThrow(Error);
    expect(() => router.on("/users#active", handler)).toThrow(Error);
    expect(() => router.on("/teams/:id/users/:id", handler)).toThrow(Error);
  });

  it("queues and executes navigation started while another navigation is running", () => {
    const router = createRouter();
    const handler = vi.fn(() => {
      router.navigate("/redirected");
    });
    const redirectedHandler = vi.fn();
    const listener = vi.fn();

    router.on("/start", handler).on("/redirected", redirectedHandler);
    router.subscribe(listener);

    const match = router.navigate("/start");

    expect(match).toMatchObject({ path: "/redirected", pathname: "/redirected" });
    expect(location.pathname).toBe("/redirected");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(redirectedHandler).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenNthCalledWith(1, expect.any(Object));
    expect(listener).toHaveBeenNthCalledWith(2, expect.any(Object));
  });

  it("queues multiple navigations in FIFO order when started while another is running", () => {
    const router = createRouter();
    const log: string[] = [];

    router.on("/start", () => {
      log.push("start");
      router.navigate("/first");
      router.navigate("/second");
    });
    router.on("/first", () => {
      log.push("first");
    });
    router.on("/second", () => {
      log.push("second");
    });

    router.navigate("/start");
    expect(log).toEqual(["start", "first", "second"]);
  });

  it("queues popstate events triggered during active navigation", () => {
    const router = trackStartedRouter(createRouter());
    const log: string[] = [];

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

  it("queues popstate events triggered during active navigation and preserves state", () => {
    const router = trackStartedRouter(createRouter());
    const log: string[] = [];
    let stateDuringPopstateTarget: unknown = null;

    router.on("/start", () => {
      log.push("start");
      history.pushState({ val: "original" }, "", "/popstate-target");
      dispatchEvent(new PopStateEvent("popstate", { state: { val: "popstate-queued" } }));
      router.navigate("/other");
    });
    router.on("/other", () => {
      log.push("other");
    });
    router.on("/popstate-target", () => {
      log.push("popstate");
      stateDuringPopstateTarget = history.state;
    });

    router.start();
    router.navigate("/start");
    expect(log).toEqual(["start", "popstate", "other"]);
    expect(location.pathname).toBe("/other");
    expect(stateDuringPopstateTarget).toEqual({ val: "popstate-queued" });
  });

  it("intercepts anchor clicks with data-router-link", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const link = document.createElement("a");
    link.setAttribute("href", "/target");
    link.setAttribute("data-router-link", "");
    document.body.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalled();
    expect(location.pathname).toBe("/target");

    document.body.removeChild(link);
  });

  it("propagates route handler errors from intercepted anchor clicks", () => {
    const handler = vi.fn().mockImplementation(() => {
      throw new Error("Route handler failed");
    });
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
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

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    window.removeEventListener("error", onError);

    expect(errorEvent).not.toBeNull();
    expect((errorEvent as unknown as ErrorEvent).message).toContain("Route handler failed");
    expect(clickEvent.defaultPrevented).toBe(true);

    document.body.removeChild(link);
  });

  it("does not intercept anchor clicks without data-router-link", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const link = document.createElement("a");
    link.setAttribute("href", "/target");
    document.body.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("does not intercept external clicks or clicks with modifier keys", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const link = document.createElement("a");
    link.setAttribute("href", "https://google.com/target");
    link.setAttribute("data-router-link", "");
    document.body.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    // modifier key (meta)
    link.setAttribute("href", "/target");
    const metaClickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    link.dispatchEvent(metaClickEvent);
    expect(metaClickEvent.defaultPrevented).toBe(false);

    document.body.removeChild(link);
  });

  it("removes browser listeners and subscribers when destroyed", () => {
    const handler = vi.fn();
    const listener = vi.fn();
    const router = trackStartedRouter(createRouter().on("/next", handler));

    router.subscribe(listener);
    router.start();
    listener.mockClear();
    router.destroy();

    history.pushState(null, "", "/next");
    dispatchEvent(new PopStateEvent("popstate"));

    expect(handler).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("validates base paths, route paths, and navigation targets", () => {
    const router = createRouter();
    const handler = vi.fn();

    expect(() => createRouter({ basePath: "app" })).toThrow(Error);
    expect(() => createRouter({ basePath: "//example.com" })).toThrow(Error);
    expect(() => createRouter({ basePath: "/\\example.com" })).toThrow(Error);
    expect(() => createRouter({ basePath: "/app?tab=settings" })).toThrow(Error);
    expect(() => createRouter({ basePath: "/app#settings" })).toThrow(Error);
    expect(() => createRouter({ basePath: "/app/" })).toThrow(Error);
    expect(() => router.on("", handler)).toThrow(Error);
    expect(() => router.on("users/:id", handler)).toThrow(Error);
    expect(() => router.on("/users\\:id", handler)).toThrow(Error);
    expect(() => router.on("/users/:", handler)).toThrow(Error);
    expect(() => router.navigate("settings")).toThrow(Error);
    expect(() => router.navigate("/\\example.com/settings")).toThrow(Error);
    expect(() => router.href("//example.com/settings")).toThrow(Error);
    expect(() => router.href("/settings\\profile")).toThrow(Error);
  });

  it("rejects dot path segments before URL normalization", () => {
    const router = createRouter();
    const handler = vi.fn();

    expect(() => createRouter({ basePath: "/admin/../app" })).toThrow(Error);
    expect(() => createRouter({ basePath: "/admin/./app" })).toThrow(Error);
    expect(() => router.on("/admin/../users", handler)).toThrow(Error);
    expect(() => router.on("/admin/./users", handler)).toThrow(Error);
    expect(() => router.navigate("/admin/../users")).toThrow(Error);
    expect(() => router.href("/admin/%2e%2e/users")).toThrow(Error);
  });

  it("does not re-match or run handlers on duplicate start calls", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter().on("/", handler));

    const match1 = router.start();
    expect(handler).toHaveBeenCalledTimes(1);

    const match2 = router.start();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(match1).toBe(match2);
  });

  it("does not prevent default click action on invalid paths containing backslashes", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const link = document.createElement("a");
    link.setAttribute("href", "/\\example.com/settings");
    link.setAttribute("data-router-link", "");
    document.body.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("does not intercept anchor clicks when shouldInterceptLinks is false", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter().on("/target", handler));
    router.start();

    const link = document.createElement("a");
    link.setAttribute("href", "/target");
    link.setAttribute("data-router-link", "");
    document.body.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("throws when start is called during active navigation", () => {
    const router = trackStartedRouter(createRouter());
    router.on("/start", () => {
      expect(() => router.start()).toThrow("Router navigation is already running.");
    });
    router.navigate("/start");
  });

  it("can be restarted after being destroyed", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter().on("/target", handler));

    router.start();
    router.destroy();

    // Start again
    router.start();
    router.navigate("/target");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("intercepts SVG anchor clicks with data-router-link", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const link = document.createElementNS("http://www.w3.org/2000/svg", "a");
    link.setAttribute("href", "/target");
    link.setAttribute("data-router-link", "");
    svg.appendChild(link);
    document.body.appendChild(svg);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalled();
    expect(location.pathname).toBe("/target");

    document.body.removeChild(svg);
  });

  it("intercepts SVG anchor clicks with data-router-link using xlink:href", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const link = document.createElementNS("http://www.w3.org/2000/svg", "a");
    link.setAttribute("xlink:href", "/target");
    link.setAttribute("data-router-link", "");
    svg.appendChild(link);
    document.body.appendChild(svg);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalled();
    expect(location.pathname).toBe("/target");

    document.body.removeChild(svg);
  });

  it("does not intercept anchor clicks with non-self targets", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const link = document.createElement("a");
    link.setAttribute("href", "/target");
    link.setAttribute("data-router-link", "");
    link.setAttribute("target", "_blank");
    document.body.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("does not intercept anchor clicks without href", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const link = document.createElement("a");
    link.setAttribute("data-router-link", "");
    document.body.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("does not intercept clicks on external origins", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const link = document.createElement("a");
    link.setAttribute("href", "https://google.com/target");
    link.setAttribute("data-router-link", "");
    document.body.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("does not intercept clicks on same-origin paths outside basePath", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(
      createRouter({ basePath: "/app", shouldInterceptLinks: true }).on("/target", handler),
    );
    router.start();

    const link = document.createElement("a");
    link.setAttribute("href", "/outside-basepath");
    link.setAttribute("data-router-link", "");
    document.body.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    document.body.removeChild(link);
  });

  it("does not crash on non-Element click targets", () => {
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }));
    router.start();

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });

    expect(() => document.dispatchEvent(clickEvent)).not.toThrow();
  });

  it("intercepts anchor clicks inside a shadow DOM", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }).on("/target", handler));
    router.start();

    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: "open" });

    const link = document.createElement("a");
    link.setAttribute("href", "/target");
    link.setAttribute("data-router-link", "");
    shadowRoot.appendChild(link);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      composed: true,
    });
    link.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(handler).toHaveBeenCalled();
    expect(location.pathname).toBe("/target");

    document.body.removeChild(host);
  });

  it("returns base-path-prefixed href for root path '/'", () => {
    const router = createRouter({ basePath: "/app" });
    expect(router.href("/")).toBe("/app/");
  });

  it("strips base path when location exactly matches basePath + '/'", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ basePath: "/app" }).on("/", handler));

    history.replaceState(null, "", "/app/");
    const match = router.start();

    expect(match).toMatchObject({ path: "/", pathname: "/" });
    expect(handler).toHaveBeenCalled();
  });

  it("clears pending navigations and resets currentMatch on destroy", () => {
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
});
