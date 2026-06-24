// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DARK_THEME, LIGHT_THEME, createTheme, THEME_CHANGE_EVENT, type ThemeChangeDetail } from ".";

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
    expect(() => createTheme({ themes: [{ name: "", colorScheme: "light" }] })).toThrow(
      "Theme names must be non-empty.",
    );
  });

  it("should reject duplicate theme names", () => {
    expect(() => createTheme({ themes: [LIGHT_THEME, { name: "light", colorScheme: "dark" }] })).toThrow(
      "Duplicate theme name: light.",
    );
  });

  it("should reject missing default and system mappings", () => {
    expect(() => createTheme({ defaultTheme: "missing" })).toThrow("Default theme is not configured: missing.");
    expect(() => createTheme({ systemTheme: { light: "missing", dark: "dark" } })).toThrow(
      "System light theme is not configured: missing.",
    );
    expect(() => createTheme({ systemTheme: { light: "light", dark: "missing" } })).toThrow(
      "System dark theme is not configured: missing.",
    );
  });

  it("should reject default theme classes that are not single DOM tokens", () => {
    expect(() =>
      createTheme({ themes: [LIGHT_THEME, DARK_THEME, { name: "high contrast", colorScheme: "dark" }] }),
    ).toThrow("Theme name cannot be used as a default theme class: high contrast.");
  });
});

describe("Theme behavior", () => {
  it("should apply the system theme when no valid preference is stored", () => {
    createMatchMedia(true);
    window.localStorage.setItem("app-theme-preference", "unknown");

    const theme = createTheme().init();

    expect(theme.get().name).toBe("dark");
    expect(theme.getStored()).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("should remove pre-existing configured theme classes on init", () => {
    document.documentElement.className = "app-shell theme-dark keep-me";

    createTheme().init();

    expect(document.documentElement.classList.contains("theme-dark")).toBe(false);
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
    expect(document.documentElement.classList.contains("app-shell")).toBe(true);
    expect(document.documentElement.classList.contains("keep-me")).toBe(true);
  });

  it("should store and apply an explicit theme", () => {
    const theme = createTheme({ isTailwindcss: true }).init();

    const nextTheme = theme.set("dark");

    expect(nextTheme.name).toBe("dark");
    expect(window.localStorage.getItem("app-theme-preference")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("theme-light")).toBe(false);
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should keep shouldApplyClass independent from isTailwindcss", () => {
    const theme = createTheme({ shouldApplyClass: false, isTailwindcss: true }).init();

    theme.set("dark");

    expect(document.documentElement.classList.contains("theme-dark")).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should not remove pre-existing dark classes when isTailwindcss is disabled", () => {
    document.documentElement.className = "dark app-shell";

    createTheme({ isTailwindcss: false }).init();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("app-shell")).toBe(true);
  });

  it("should apply the exact default theme class", () => {
    const theme = createTheme({
      themes: [LIGHT_THEME, DARK_THEME, { name: "BrandDark", colorScheme: "dark" }],
      systemTheme: { light: "light", dark: "BrandDark" },
    }).init();

    theme.set("BrandDark");

    expect(document.documentElement.classList.contains("theme-BrandDark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-branddark")).toBe(false);
  });

  it("should support custom attributes, custom class names, and more than two themes", () => {
    const theme = createTheme({
      themes: [LIGHT_THEME, DARK_THEME, { name: "high contrast", colorScheme: "dark" }],
      systemTheme: { light: "light", dark: "high contrast" },
      attribute: "data-mode",
      shouldApplyClass: (definition) => `mode-${definition.name.replace(" ", "-")}`,
      isTailwindcss: true,
    }).init();

    theme.set("high contrast");

    expect(document.documentElement.getAttribute("data-mode")).toBe("high contrast");
    expect(document.documentElement.classList.contains("mode-high-contrast")).toBe(true);
    expect(document.documentElement.classList.contains("theme-high-contrast")).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should reject invalid custom theme classes before applying", () => {
    const theme = createTheme({ shouldApplyClass: () => "two classes" });

    expect(() => theme.init()).toThrow("Theme class resolver returned an invalid class for theme: light.");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("should reject invalid non-active custom theme classes before DOM writes", () => {
    document.documentElement.className = "app-shell";
    document.documentElement.setAttribute("data-theme", "server");
    document.documentElement.style.colorScheme = "dark";

    const theme = createTheme({
      shouldApplyClass: (definition) => (definition.name === "dark" ? "two classes" : "theme-light"),
    });

    expect(() => theme.init()).toThrow("Theme class resolver returned an invalid class for theme: dark.");
    expect(document.documentElement.getAttribute("data-theme")).toBe("server");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.className).toBe("app-shell");
  });

  it("should toggle between configured system light and dark themes", () => {
    const theme = createTheme({
      themes: [LIGHT_THEME, DARK_THEME, { name: "midnight", colorScheme: "dark" }],
      systemTheme: { light: "light", dark: "midnight" },
    }).init();

    expect(theme.toggle().name).toBe("midnight");
    expect(theme.toggle().name).toBe("light");
  });

  it("should clear preference and return to system theme", () => {
    createMatchMedia(true);
    const theme = createTheme().init();

    theme.set("light");
    const systemTheme = theme.clearPreference();

    expect(systemTheme.name).toBe("dark");
    expect(theme.getStored()).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("should notify subscribers and dispatch themechange events", () => {
    const theme = createTheme().init();
    const listener = vi.fn();
    const eventListener = vi.fn((event: CustomEvent<ThemeChangeDetail>) => event.detail);
    const unsubscribe = theme.subscribe(listener);

    window.addEventListener(THEME_CHANGE_EVENT, eventListener as unknown as EventListener);
    theme.set("dark");
    unsubscribe();
    theme.set("light");
    window.removeEventListener(THEME_CHANGE_EVENT, eventListener as unknown as EventListener);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]?.name).toBe("dark");
    expect(listener.mock.calls[0]?.[0]?.source).toBe("set");
    expect(eventListener).toHaveBeenCalledTimes(2);
    expect(eventListener.mock.results[0]?.value?.name).toBe("dark");
    expect(eventListener.mock.results[0]?.value?.source).toBe("set");
  });

  it("should respond to system changes only without a stored preference", () => {
    const mediaQueryList = createMatchMedia(false);
    const theme = createTheme().init();

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
      const theme = createTheme().init();

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
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    }
  });
});

describe("Theme CSS tokens support", () => {
  it("should reject theme tokens if no tokenSchema is configured", () => {
    const customTheme = { name: "custom", colorScheme: "light" as const, tokens: { primary: "blue" } };
    expect(() => createTheme({ themes: [customTheme] })).toThrow(
      'Theme "custom" defines tokens but no tokenSchema is configured.',
    );
  });

  it("should apply theme-defined tokens on init and theme change", () => {
    const tokenSchema = { primary: "--color-primary", bg: "--color-bg" };
    const customLight = {
      name: "light",
      colorScheme: "light" as const,
      tokens: { primary: "blue", bg: "white" },
    };
    const customDark = {
      name: "dark",
      colorScheme: "dark" as const,
      tokens: { primary: "red", bg: "black" },
    };

    const theme = createTheme({
      themes: [customLight, customDark],
      tokenSchema,
    }).init();

    theme.set("light");
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("blue");
    expect(document.documentElement.style.getPropertyValue("--color-bg")).toBe("white");

    theme.set("dark");
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("red");
    expect(document.documentElement.style.getPropertyValue("--color-bg")).toBe("black");
  });

  it("should apply dynamic overrides on set", () => {
    const tokenSchema = { primary: "--color-primary", bg: "--color-bg" };
    const customLight = {
      name: "light",
      colorScheme: "light" as const,
      tokens: { primary: "blue", bg: "white" },
    };
    const customDark = {
      name: "dark",
      colorScheme: "dark" as const,
      tokens: { primary: "red", bg: "black" },
    };

    const theme = createTheme({
      themes: [customLight, customDark],
      tokenSchema,
    }).init();

    theme.set("dark", { primary: "purple" });
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("purple");
    expect(document.documentElement.style.getPropertyValue("--color-bg")).toBe("black");

    expect(theme.get().tokens).toEqual({ primary: "purple", bg: "black" });
  });

  it("should clear omitted tokens to allow CSS fallback", () => {
    const tokenSchema = { primary: "--color-primary", bg: "--color-bg" };
    const customLight = {
      name: "light",
      colorScheme: "light" as const,
      tokens: { primary: "blue" },
    };
    const customDark = {
      name: "dark",
      colorScheme: "dark" as const,
      tokens: { primary: "red", bg: "black" },
    };

    const theme = createTheme({
      themes: [customLight, customDark],
      tokenSchema,
      defaultTheme: "dark",
    }).init();

    theme.set("dark");
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("red");
    expect(document.documentElement.style.getPropertyValue("--color-bg")).toBe("black");

    theme.set("light");
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("blue");
    expect(document.documentElement.style.getPropertyValue("--color-bg")).toBe("");
  });

  it("should allow partial changes on init and toggle", () => {
    const tokenSchema = { primary: "--color-primary", bg: "--color-bg" };
    const theme = createTheme({
      tokenSchema,
    });

    theme.init({ primary: "orange" });
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("orange");
    expect(document.documentElement.style.getPropertyValue("--color-bg")).toBe("");

    theme.toggle({ bg: "gray" });
    expect(document.documentElement.style.getPropertyValue("--color-bg")).toBe("gray");
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("");
  });

  it("should resolve missing tokens from computed styles on theme changes", () => {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :root {
        --color-primary: blue;
      }
      .theme-dark {
        --color-primary: red;
      }
    `;
    document.head.appendChild(styleEl);

    try {
      const tokenSchema = { primary: "--color-primary" };
      const customLight = { name: "light", colorScheme: "light" as const };
      const customDark = { name: "dark", colorScheme: "dark" as const };
      const forest = { name: "forest", colorScheme: "light" as const, tokens: { primary: "green" } };

      const theme = createTheme({
        themes: [customLight, customDark, forest],
        tokenSchema,
      }).init();

      // Switch to forest (uses JS token)
      theme.set("forest");
      expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("green");
      expect(theme.get().tokens).toEqual({ primary: "green" });

      // Switch to light (uses CSS fallback on :root)
      theme.set("light");
      expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("");
      expect(theme.get().tokens).toEqual({ primary: "blue" });

      // Switch to dark (uses CSS fallback on .theme-dark)
      theme.set("dark");
      expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("");
      expect(theme.get().tokens).toEqual({ primary: "red" });
    } finally {
      document.head.removeChild(styleEl);
    }
  });

  it("should handle dynamic token fallback gracefully under SSR", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);

    try {
      const tokenSchema = { primary: "--color-primary" };
      const theme = createTheme({
        tokenSchema,
      }).init();

      expect(theme.get().tokens).toEqual({});
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    }
  });
});
