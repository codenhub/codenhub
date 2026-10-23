// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createTheme } from ".";

describe("Theme SSR / non-browser behavior", () => {
  it("should not throw without window or document", () => {
    const listener = vi.fn();
    const theme = createTheme();

    expect(() => theme.init()).not.toThrow();
    expect(theme.name).toBe("light");
    expect(theme.preference).toBeNull();
    expect(theme.system).toBe("light");
    expect(() => theme.set("dark")).not.toThrow();
    expect(theme.toggle().name).toBe("light");
    expect(theme.clearPreference().name).toBe("light");
    expect(() => theme.destroy({ revertDom: true })).not.toThrow();

    theme.subscribe(listener);
    theme.set("dark");
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ name: "dark", source: "set" });
  });

  it("should return known tokens without computed styles", () => {
    const theme = createTheme({ tokenSchema: { primary: "--color-primary", bg: "--color-bg" } }).init();

    theme.setTokens({ primary: "blue" });

    expect(theme.readTokens()).toEqual({ primary: "blue" });
  });

  it("should generate the pre-paint script on the server", () => {
    expect(createTheme().getPrePaintScript()).toMatch(/^!\(function\(\)\{/);
  });
});
