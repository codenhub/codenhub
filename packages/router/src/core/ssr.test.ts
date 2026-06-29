// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createRouter } from "../index";

describe("SSR environment (node)", () => {
  it("shouldReturnNullOnStartWhenWindowIsNotAvailable", () => {
    const router = createRouter().on("/", vi.fn());
    expect(router.start()).toBeNull();
  });

  it("shouldReturnNullOnStartWhenBasePathIsConfiguredButWindowIsUnavailable", () => {
    const router = createRouter({ basePath: "/app" }).on("/settings", vi.fn());
    expect(router.start()).toBeNull();
  });

  it("shouldNavigateAndMatchWithoutBrowserHistory", () => {
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

  it("shouldHandleHrefBuildingWithAndWithoutBasePaths", () => {
    const routerWithBase = createRouter({ basePath: "/app" });
    const routerWithoutBase = createRouter();

    expect(routerWithBase.href("/settings")).toBe("/app/settings");
    expect(routerWithBase.href("/")).toBe("/app/");
    expect(routerWithoutBase.href("/settings")).toBe("/settings");
  });

  it("shouldMatchWithoutSideEffects", () => {
    const handler = vi.fn();
    const router = createRouter().on("/users/:id", handler);

    const match = router.match("/users/alice");
    expect(match?.path).toBe("/users/:id");
    expect(match?.params["id"]).toBe("alice");
    expect(handler).not.toHaveBeenCalled();
  });

  it("shouldThrowValidationErrorsOnMatchWithInvalidPaths", () => {
    const router = createRouter();
    expect(() => router.match("settings")).toThrow(Error);
    expect(() => router.match("/\\example.com/settings")).toThrow(Error);
  });
});
