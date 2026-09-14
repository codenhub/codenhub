import { describe, expect, it } from "vitest";

import { nextTheme, resolveInitialTheme, themeToggleAria, THEME_STORAGE_KEY } from "./theme.ts";

describe("THEME_STORAGE_KEY", () => {
  it("is the shared codenhub-theme key", () => {
    expect(THEME_STORAGE_KEY).toBe("codenhub-theme");
  });
});

describe("resolveInitialTheme", () => {
  it("uses the stored theme when it is valid", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });

  it("falls back to the system preference when nothing valid is stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
    expect(resolveInitialTheme("system", true)).toBe("dark");
    expect(resolveInitialTheme("", false)).toBe("light");
  });
});

describe("nextTheme", () => {
  it("flips between light and dark", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });
});

describe("themeToggleAria", () => {
  it("reports checked and the next-theme label for dark", () => {
    expect(themeToggleAria("dark")).toEqual({ checked: true, label: "Switch to light theme" });
  });

  it("reports unchecked and the next-theme label for light", () => {
    expect(themeToggleAria("light")).toEqual({ checked: false, label: "Switch to dark theme" });
  });
});
