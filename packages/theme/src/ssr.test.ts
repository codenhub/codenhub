import { describe, expect, it, vi } from "vitest";

import { createTheme } from ".";

describe("Theme SSR / non-browser behavior", () => {
  it("should not throw without window or document", () => {
    const listener = vi.fn();
    const theme = createTheme();

    expect(() => theme.init()).not.toThrow();
    expect(theme.get().name).toBe("light");
    expect(theme.getStored()).toBeNull();
    expect(theme.getSystem().name).toBe("light");
    expect(() => theme.set("dark")).not.toThrow();
    expect(theme.toggle().name).toBe("light");
    expect(theme.clearPreference().name).toBe("light");
    expect(() => theme.destroy()).not.toThrow();

    theme.subscribe(listener);
    theme.set("dark");
    expect(listener.mock.calls[0]?.[0]?.name).toBe("dark");
    expect(listener.mock.calls[0]?.[0]?.source).toBe("set");
  });

  it("should handle dynamic token fallback gracefully under SSR", () => {
    const tokenSchema = { primary: "--color-primary" };
    const theme = createTheme({
      tokenSchema,
    }).init();

    expect(theme.get().tokens).toEqual({});
  });
});
