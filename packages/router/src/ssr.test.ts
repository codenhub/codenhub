import { describe, expect, it, vi } from "vitest";

import { createRouter } from ".";

describe("createRouter without browser APIs", () => {
  it("matches and navigates app paths without touching browser history", () => {
    const handler = vi.fn();
    const listener = vi.fn();
    const router = createRouter().on("/users/:id", handler);

    router.subscribe(listener);

    expect(router.start()).toBeNull();
    expect(router.match("/users/42?tab=posts#bio")).toMatchObject({
      path: "/users/:id",
      pathname: "/users/42",
      params: { id: "42" },
      hash: "#bio",
    });

    const match = router.navigate("/users/42?tab=posts#bio");

    expect(match).toMatchObject({
      path: "/users/:id",
      pathname: "/users/42",
      params: { id: "42" },
      hash: "#bio",
    });
    expect(match?.searchParams.get("tab")).toBe("posts");
    expect(handler).toHaveBeenCalledWith(match);
    expect(listener).toHaveBeenCalledWith(match);
  });

  it("handles href building with and without base paths in SSR", () => {
    const routerWithBase = createRouter({ basePath: "/app" });
    const routerWithoutBase = createRouter();

    expect(routerWithBase.href("/settings")).toBe("/app/settings");
    expect(routerWithBase.href("/")).toBe("/app/");
    expect(routerWithoutBase.href("/settings")).toBe("/settings");
  });

  it("throws validation errors on match with invalid paths in SSR", () => {
    const router = createRouter();

    expect(() => router.match("settings")).toThrow(Error);
    expect(() => router.match("/\\example.com/settings")).toThrow(Error);
  });

  it("returns null on start even when basePath is configured in SSR", () => {
    const router = createRouter({ basePath: "/app" }).on("/settings", vi.fn());

    expect(router.start()).toBeNull();
  });
});
