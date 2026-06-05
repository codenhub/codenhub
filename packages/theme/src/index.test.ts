// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { darkTheme, lightTheme, Theme, THEME_CHANGE_EVENT, type ThemeChangeDetail } from ".";

interface MockMediaQueryList {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatch: (matches: boolean) => void;
}

const createMatchMedia = (matches = false): MockMediaQueryList => {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList: MockMediaQueryList = {
    matches,
    addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    dispatch: (nextMatches: boolean) => {
      mediaQueryList.matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches: nextMatches } as MediaQueryListEvent);
      }
    },
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue(mediaQueryList as unknown as MediaQueryList),
  });

  return mediaQueryList;
};

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-mode");
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  window.localStorage.clear();
  createMatchMedia(false);
});

describe("Theme config", () => {
  it("should reject empty theme names", () => {
    expect(() => new Theme({ themes: [{ name: "", colorScheme: "light" }] })).toThrow("Theme names must be non-empty.");
  });

  it("should reject duplicate theme names", () => {
    expect(() => new Theme({ themes: [lightTheme, { name: "light", colorScheme: "dark" }] })).toThrow(
      "Duplicate theme name: light.",
    );
  });

  it("should reject missing default and system mappings", () => {
    expect(() => new Theme({ defaultTheme: "missing" })).toThrow("Default theme is not configured: missing.");
    expect(() => new Theme({ systemTheme: { light: "missing", dark: "dark" } })).toThrow(
      "System light theme is not configured: missing.",
    );
    expect(() => new Theme({ systemTheme: { light: "light", dark: "missing" } })).toThrow(
      "System dark theme is not configured: missing.",
    );
  });

  it("should reject default theme classes that are not single DOM tokens", () => {
    expect(() => new Theme({ themes: [lightTheme, darkTheme, { name: "high contrast", colorScheme: "dark" }] })).toThrow(
      "Theme name cannot be used as a default theme class: high contrast.",
    );
  });
});

describe("Theme behavior", () => {
  it("should apply the system theme when no valid preference is stored", () => {
    createMatchMedia(true);
    window.localStorage.setItem("app-theme-preference", "unknown");

    const theme = new Theme().init();

    expect(theme.get().name).toBe("dark");
    expect(theme.getStored()).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("should remove pre-existing configured theme classes on init", () => {
    document.documentElement.className = "app-shell theme-dark keep-me";

    new Theme().init();

    expect(document.documentElement.classList.contains("theme-dark")).toBe(false);
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
    expect(document.documentElement.classList.contains("app-shell")).toBe(true);
    expect(document.documentElement.classList.contains("keep-me")).toBe(true);
  });

  it("should store and apply an explicit theme", () => {
    const theme = new Theme({ tailwindcss: true }).init();

    const nextTheme = theme.set("dark");

    expect(nextTheme).toEqual(darkTheme);
    expect(window.localStorage.getItem("app-theme-preference")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("theme-light")).toBe(false);
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should keep applyClass independent from tailwindcss", () => {
    const theme = new Theme({ applyClass: false, tailwindcss: true }).init();

    theme.set("dark");

    expect(document.documentElement.classList.contains("theme-dark")).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should not remove pre-existing dark classes when tailwindcss is disabled", () => {
    document.documentElement.className = "dark app-shell";

    new Theme({ tailwindcss: false }).init();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("app-shell")).toBe(true);
  });

  it("should apply the exact default theme class", () => {
    const theme = new Theme({
      themes: [lightTheme, darkTheme, { name: "BrandDark", colorScheme: "dark" }],
      systemTheme: { light: "light", dark: "BrandDark" },
    }).init();

    theme.set("BrandDark");

    expect(document.documentElement.classList.contains("theme-BrandDark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-branddark")).toBe(false);
  });

  it("should support custom attributes, custom class names, and more than two themes", () => {
    const theme = new Theme({
      themes: [lightTheme, darkTheme, { name: "high contrast", colorScheme: "dark" }],
      systemTheme: { light: "light", dark: "high contrast" },
      attribute: "data-mode",
      applyClass: (definition) => `mode-${definition.name.replace(" ", "-")}`,
      tailwindcss: true,
    }).init();

    theme.set("high contrast");

    expect(document.documentElement.getAttribute("data-mode")).toBe("high contrast");
    expect(document.documentElement.classList.contains("mode-high-contrast")).toBe(true);
    expect(document.documentElement.classList.contains("theme-high-contrast")).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should reject invalid custom theme classes before applying", () => {
    const theme = new Theme({ applyClass: () => "two classes" });

    expect(() => theme.init()).toThrow("Theme class resolver returned an invalid class for theme: light.");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("should reject invalid non-active custom theme classes before DOM writes", () => {
    document.documentElement.className = "app-shell";
    document.documentElement.setAttribute("data-theme", "server");
    document.documentElement.style.colorScheme = "dark";

    const theme = new Theme({ applyClass: (definition) => (definition.name === "dark" ? "two classes" : "theme-light") });

    expect(() => theme.init()).toThrow("Theme class resolver returned an invalid class for theme: dark.");
    expect(document.documentElement.getAttribute("data-theme")).toBe("server");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.className).toBe("app-shell");
  });

  it("should toggle between configured system light and dark themes", () => {
    const theme = new Theme({
      themes: [lightTheme, darkTheme, { name: "midnight", colorScheme: "dark" }],
      systemTheme: { light: "light", dark: "midnight" },
    }).init();

    expect(theme.toggle().name).toBe("midnight");
    expect(theme.toggle().name).toBe("light");
  });

  it("should clear preference and return to system theme", () => {
    createMatchMedia(true);
    const theme = new Theme().init();

    theme.set("light");
    const systemTheme = theme.clearPreference();

    expect(systemTheme.name).toBe("dark");
    expect(theme.getStored()).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("should notify subscribers and dispatch themechange events", () => {
    const theme = new Theme().init();
    const listener = vi.fn();
    const eventListener = vi.fn((event: CustomEvent<ThemeChangeDetail>) => event.detail);
    const unsubscribe = theme.subscribe(listener);

    window.addEventListener(THEME_CHANGE_EVENT, eventListener as unknown as EventListener);
    theme.set("dark");
    unsubscribe();
    theme.set("light");
    window.removeEventListener(THEME_CHANGE_EVENT, eventListener as unknown as EventListener);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ name: "dark", theme: darkTheme, source: "set" });
    expect(eventListener).toHaveBeenCalledTimes(2);
    expect(eventListener.mock.results[0]?.value).toEqual({ name: "dark", theme: darkTheme, source: "set" });
  });

  it("should respond to system changes only without a stored preference", () => {
    const mediaQueryList = createMatchMedia(false);
    const theme = new Theme().init();

    mediaQueryList.dispatch(true);
    expect(theme.get().name).toBe("dark");

    theme.set("light");
    mediaQueryList.dispatch(true);
    expect(theme.get().name).toBe("light");

    theme.destroy();
    expect(mediaQueryList.removeEventListener).toHaveBeenCalledOnce();
  });

  it("should stay safe when localStorage operations throw", () => {
    const originalLocalStorage = window.localStorage;
    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new Error("get failed");
      }),
      removeItem: vi.fn(() => {
        throw new Error("remove failed");
      }),
      setItem: vi.fn(() => {
        throw new Error("set failed");
      }),
    };

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: throwingStorage,
    });

    try {
      const theme = new Theme().init();

      expect(theme.getStored()).toBeNull();
      expect(() => theme.set("dark")).not.toThrow();
      expect(() => theme.clearPreference()).not.toThrow();
      expect(throwingStorage.getItem).toHaveBeenCalled();
      expect(throwingStorage.setItem).toHaveBeenCalled();
      expect(throwingStorage.removeItem).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
      });
    }
  });

  it("should not throw without window or document", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);

    try {
      const listener = vi.fn();
      const theme = new Theme();

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
      expect(listener).toHaveBeenCalledWith({ name: "dark", theme: darkTheme, source: "set" });
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    }
  });
});
