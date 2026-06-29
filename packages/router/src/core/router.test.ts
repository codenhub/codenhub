// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouter } from "./router";

describe("createRouter", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should chain on() and notFound()", () => {
    const router = createRouter();
    const chained = router.on("/", () => {}).notFound(() => {});
    expect(chained).toBe(router);
  });

  it("should register routes and find a match", () => {
    const handler = vi.fn();
    const router = createRouter().on("/test", handler);
    const match = router.match("/test");
    expect(match).not.toBeNull();
    expect(match?.pathname).toBe("/test");
  });

  it("should support custom base path in href generation", () => {
    const router = createRouter({ basePath: "/my-app" });
    expect(router.href("/settings")).toBe("/my-app/settings");
    expect(router.href("/")).toBe("/my-app/");
  });

  it("should clean up event listeners on destroy", () => {
    const router = createRouter({ shouldInterceptLinks: true });
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    router.start();
    expect(addSpy).toHaveBeenCalledWith("popstate", expect.any(Function));

    router.destroy();
    expect(removeSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
  });
});
