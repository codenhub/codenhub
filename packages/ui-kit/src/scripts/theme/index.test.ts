// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

import { clearThemePreference, getStoredTheme, getSystemTheme, getTheme, setTheme, toggleTheme } from "./index";

const prefersDark = (matches: boolean): void => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query }));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it("reads the system theme from the color scheme preference, with light as the fallback", () => {
  expect(getSystemTheme()).toBe("light");

  prefersDark(true);
  expect(getSystemTheme()).toBe("dark");

  prefersDark(false);
  expect(getSystemTheme()).toBe("light");
});

it("keeps an explicit theme preference until it is cleared back to the system theme", () => {
  localStorage.clear();
  expect(getStoredTheme()).toBeNull();

  setTheme("dark");
  expect(getTheme()).toBe("dark");
  expect(getStoredTheme()).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);

  expect(toggleTheme()).toBe("light");
  expect(getStoredTheme()).toBe("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);

  setTheme("dark");
  expect(clearThemePreference()).toBe("light");
  expect(getStoredTheme()).toBeNull();
  expect(getTheme()).toBe("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});
