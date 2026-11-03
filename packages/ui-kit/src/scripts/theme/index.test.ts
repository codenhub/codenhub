// @vitest-environment jsdom
import { expect, it } from "vitest";

import { clearThemePreference, getStoredTheme, getSystemTheme, getTheme, setTheme, toggleTheme } from "./index";

it("keeps an explicit theme preference until it is cleared back to the system theme", () => {
  localStorage.clear();
  expect(getStoredTheme()).toBeNull();
  expect(getSystemTheme()).toBe("light");

  setTheme("dark");
  expect(getTheme()).toBe("dark");
  expect(getStoredTheme()).toBe("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);

  expect(toggleTheme()).toBe("light");
  expect(getStoredTheme()).toBe("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);

  expect(clearThemePreference()).toBe("light");
  expect(getStoredTheme()).toBeNull();
});
