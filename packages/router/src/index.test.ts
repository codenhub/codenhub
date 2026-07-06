// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouter } from ".";
import type { Router } from ".";

/**
 * Integration tests for the public Router contract.
 *
 * These tests verify that registry, navigation, and history work correctly
 * together through the createRouter() surface. Unit tests for each module
 * are colocated in the same directory (e.g., registry.test.ts).
 */
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

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------

  it("shouldMatchRegisteredRoutesInOrderWithDecodedParamsQueryStringsAndHashes", () => {
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

  it("shouldCallFallbackHandlerAndSubscribersOnMiss", () => {
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

  it("shouldQueueAndExecuteNavigationStartedDuringActiveNavigation", () => {
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
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ path: "/redirected" }));
  });

  it("shouldQueueAndExecuteNavigationStartedFromSubscriber", () => {
    const router = createRouter();
    const handler = vi.fn();
    const nextHandler = vi.fn();
    router.on("/start", handler).on("/next", nextHandler);

    router.subscribe((match) => {
      if (match?.pathname === "/start") {
        router.navigate("/next");
      }
    });

    const match = router.navigate("/start");
    expect(match).toMatchObject({ path: "/next", pathname: "/next" });
    expect(location.pathname).toBe("/next");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(nextHandler).toHaveBeenCalledTimes(1);
  });

  it("shouldProcessMultipleQueuedNavigationsInFifoOrder", () => {
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

  // ---------------------------------------------------------------------------
  // Encoding
  // ---------------------------------------------------------------------------

  it("shouldMatchStaticRoutePathsUsingBrowserUrlEncoding", () => {
    const handler = vi.fn();
    const routePath = "/caf\u00e9";
    const router = createRouter().on(routePath, handler);

    const match = router.navigate(routePath);

    expect(match).toMatchObject({ path: routePath, pathname: "/caf%C3%A9" });
    expect(handler).toHaveBeenCalledWith(match);
  });

  it("shouldMatchStaticRoutePathsWithEquivalentPercentEscapeCasing", () => {
    const handler = vi.fn();
    const routePath = "/caf\u00e9";
    const router = createRouter().on(routePath, handler);

    const match = router.navigate("/caf%c3%a9");

    expect(match).toMatchObject({ path: routePath, pathname: "/caf%C3%A9" });
    expect(handler).toHaveBeenCalledWith(match);
  });

  it("shouldNormalizeEncodedBasePathsForBrowserStartsAndHrefs", () => {
    const handler = vi.fn();
    const router = trackStartedRouter(createRouter({ basePath: "/caf\u00e9" }).on("/settings", handler));

    history.replaceState(null, "", "/caf%c3%a9/settings?tab=profile");

    const match = router.start();

    expect(match).toMatchObject({ path: "/settings", pathname: "/settings" });
    expect(match?.searchParams.get("tab")).toBe("profile");
    expect(handler).toHaveBeenCalledWith(match);
    expect(router.href("/settings")).toBe("/caf%C3%A9/settings");
  });

  // ---------------------------------------------------------------------------
  // Prototype safety
  // ---------------------------------------------------------------------------

  it("shouldCaptureParameterNamesThatOverlapObjectPrototypeFields", () => {
    const router = createRouter().on("/users/:__proto__", vi.fn());

    const match = router.navigate("/users/alice");

    expect(match?.params["__proto__"]).toBe("alice");
    expect(Object.hasOwn(match?.params ?? {}, "__proto__")).toBe(true);
  });

  it("shouldReturnRouteParamsAsOrdinaryObjects", () => {
    const router = createRouter().on("/users/:id", vi.fn());

    const match = router.navigate("/users/alice");

    expect(Object.getPrototypeOf(match?.params)).toBe(Object.prototype);
    expect(Object.hasOwn(match?.params ?? {}, "id")).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Validation — integration boundary
  // ---------------------------------------------------------------------------

  it("shouldValidateBasePathsRoutePathsAndNavigationTargets", () => {
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

  it("shouldRejectDotPathSegmentsBeforeUrlNormalization", () => {
    const router = createRouter();
    const handler = vi.fn();

    expect(() => createRouter({ basePath: "/admin/../app" })).toThrow(Error);
    expect(() => createRouter({ basePath: "/admin/./app" })).toThrow(Error);
    expect(() => router.on("/admin/../users", handler)).toThrow(Error);
    expect(() => router.on("/admin/./users", handler)).toThrow(Error);
    expect(() => router.navigate("/admin/../users")).toThrow(Error);
    expect(() => router.href("/admin/%2e%2e/users")).toThrow(Error);
  });

  // ---------------------------------------------------------------------------
  // href
  // ---------------------------------------------------------------------------

  it("shouldReturnBasePathPrefixedHrefForRootPath", () => {
    const router = createRouter({ basePath: "/app" });
    expect(router.href("/")).toBe("/app/");
  });

  it("shouldStripBasePathOnStartAndRestoreForHrefsAndHistoryNavigation", () => {
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

  // ---------------------------------------------------------------------------
  // Malformed params
  // ---------------------------------------------------------------------------

  it("shouldTreatMalformedEncodedPathParametersAsMisses", () => {
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

  // ---------------------------------------------------------------------------
  // Route path validation via on()
  // ---------------------------------------------------------------------------

  it("shouldRejectRoutePathsWithQueriesHashesAndDuplicateParameterNames", () => {
    const router = createRouter();
    const handler = vi.fn();

    expect(() => router.on("/users?tab=active", handler)).toThrow(Error);
    expect(() => router.on("/users#active", handler)).toThrow(Error);
    expect(() => router.on("/teams/:id/users/:id", handler)).toThrow(Error);
    router.on("/settings", handler);
    expect(() => router.on("/settings", handler)).toThrow(Error);
  });

  // ---------------------------------------------------------------------------
  // Lifecycle and chaining
  // ---------------------------------------------------------------------------

  it("shouldChainOnAndNotFound", () => {
    const router = createRouter();
    const chained = router.on("/", () => {}).notFound(() => {});
    expect(chained).toBe(router);
  });

  it("shouldCleanUpEventListenersOnDestroy", () => {
    const router = trackStartedRouter(createRouter({ shouldInterceptLinks: true }));
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const docAddSpy = vi.spyOn(document, "addEventListener");
    const docRemoveSpy = vi.spyOn(document, "removeEventListener");

    router.start();
    expect(addSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
    expect(docAddSpy).toHaveBeenCalledWith("click", expect.any(Function));

    router.destroy();
    expect(removeSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
    expect(docRemoveSpy).toHaveBeenCalledWith("click", expect.any(Function));
  });
});
