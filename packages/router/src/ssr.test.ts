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
});
