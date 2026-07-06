// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DARK_THEME,
  LIGHT_THEME,
  createTheme as originalCreateTheme,
  THEME_CHANGE_EVENT,
  type ThemeChangeDetail,
  type ThemeDefinition,
} from ".";

const activeThemes: ReturnType<typeof originalCreateTheme<Record<string, string>>>[] = [];
const createTheme = <TSchema extends Record<string, string> = Record<string, string>>(
  options?: Parameters<typeof originalCreateTheme<TSchema>>[0],
): ReturnType<typeof originalCreateTheme<TSchema>> => {
  const theme = originalCreateTheme(options);
  activeThemes.push(theme);
  return theme;
};

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

afterEach(() => {
  for (const theme of activeThemes) {
    theme.destroy();
  }
  activeThemes.length = 0;
});

describe("Theme config", () => {
  it("should reject non-array themes option", () => {
    expect(() => createTheme({ themes: {} as unknown as readonly ThemeDefinition[] })).toThrow(
      "Theme options.themes must be an array.",
    );
  });

  it("should reject non-string theme names", () => {
    expect(() => createTheme({ themes: [{ name: 123 as unknown as string, colorScheme: "light" }] })).toThrow(
      "Theme names must be non-empty strings.",
    );
  });

  it("should reject empty theme names", () => {
    expect(() => createTheme({ themes: [{ name: "", colorScheme: "light" }] })).toThrow(
      "Theme names must be non-empty strings.",
    );
  });

  it("should reject invalid color schemes", () => {
    expect(() => createTheme({ themes: [{ name: "custom", colorScheme: "invalid" as unknown as "light" }] })).toThrow(
      'Theme "custom" has an invalid colorScheme: invalid. Must be "light" or "dark".',
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

  it("should reject invalid attribute and storageKey options", () => {
    expect(() => createTheme({ attribute: "" })).toThrow("Theme attribute option must be a non-empty string.");
    expect(() => createTheme({ attribute: 123 as unknown as string })).toThrow(
      "Theme attribute option must be a non-empty string.",
    );
    expect(() => createTheme({ storageKey: "" })).toThrow("Theme storageKey option must be a non-empty string.");
    expect(() => createTheme({ storageKey: 123 as unknown as string })).toThrow(
      "Theme storageKey option must be a non-empty string.",
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
    const theme = createTheme({ isTailwindCss: true }).init();

    const nextTheme = theme.set("dark");

    expect(nextTheme.name).toBe("dark");
    expect(window.localStorage.getItem("app-theme-preference")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("theme-light")).toBe(false);
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should keep shouldApplyClass independent from isTailwindCss", () => {
    const theme = createTheme({ shouldApplyClass: false, isTailwindCss: true }).init();

    theme.set("dark");

    expect(document.documentElement.classList.contains("theme-dark")).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should not remove pre-existing dark classes when isTailwindCss is disabled", () => {
    document.documentElement.className = "dark app-shell";

    createTheme({ isTailwindCss: false }).init();

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
      isTailwindCss: true,
    }).init();

    theme.set("high contrast");

    expect(document.documentElement.getAttribute("data-mode")).toBe("high contrast");
    expect(document.documentElement.classList.contains("mode-high-contrast")).toBe(true);
    expect(document.documentElement.classList.contains("theme-high-contrast")).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("should reject invalid custom theme classes on initialization", () => {
    expect(() => createTheme({ shouldApplyClass: () => "two classes" }).init()).toThrow(
      "Theme class resolver returned an invalid class for theme: light.",
    );
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("should reject invalid non-active custom theme classes on initialization", () => {
    document.documentElement.className = "app-shell";
    document.documentElement.setAttribute("data-theme", "server");
    document.documentElement.style.colorScheme = "dark";

    expect(() =>
      createTheme({
        shouldApplyClass: (definition) => (definition.name === "dark" ? "two classes" : "theme-light"),
      }).init(),
    ).toThrow("Theme class resolver returned an invalid class for theme: dark.");
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

  it("should throw when setting an unconfigured theme", () => {
    const theme = createTheme().init();
    expect(() => theme.set("missing")).toThrow("Theme is not configured: missing.");
  });

  it("should isolate errors in theme change listeners", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const theme = createTheme().init();
    const badListener = () => {
      throw new Error("Bad listener error");
    };
    const goodListener = vi.fn();

    theme.subscribe(badListener);
    theme.subscribe(goodListener);

    theme.set("dark");

    expect(goodListener).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith("Error in theme change listener:", expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it("should respond to system changes only without a stored preference", () => {
    const mediaQueryList = createMatchMedia(false);
    const theme = createTheme().init();

    mediaQueryList.dispatch(true);
    expect(theme.get().name).toBe("dark");

    mediaQueryList.dispatch(false);
    expect(theme.get().name).toBe("light");

    theme.set("light");
    mediaQueryList.dispatch(true);
    expect(theme.get().name).toBe("light");

    theme.destroy();
    expect(mediaQueryList.removeEventListener).toHaveBeenCalledOnce();
  });

  it("should sync theme changes across tabs on storage events", () => {
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "app-theme-preference",
        newValue: "dark",
      }),
    );

    expect(theme.get().name).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]?.name).toBe("dark");
    expect(listener.mock.calls[0]?.[0]?.source).toBe("set");

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "app-theme-preference",
        newValue: null,
      }),
    );

    expect(theme.get().name).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[0]?.name).toBe("light");
    expect(listener.mock.calls[1]?.[0]?.source).toBe("clearPreference");

    theme.destroy();
  });

  it("should ignore unrelated storage events", () => {
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "unrelated-key",
        newValue: "dark",
      }),
    );

    expect(theme.get().name).toBe("light");
    expect(listener).not.toHaveBeenCalled();

    theme.destroy();
  });

  it("should ignore unconfigured themes on storage events", () => {
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "app-theme-preference",
        newValue: "unknown-theme",
      }),
    );

    expect(theme.get().name).toBe("light");
    expect(listener).not.toHaveBeenCalled();

    theme.destroy();
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

  it("should reject tokenSchema values that do not start with --", () => {
    expect(() =>
      createTheme({
        tokenSchema: { primary: "color-primary" },
      }),
    ).toThrow(
      'Token schema key "primary" must map to a CSS custom property starting with "--". Received: "color-primary".',
    );
  });

  it("should reject theme static tokens not present in tokenSchema", () => {
    const customTheme = {
      name: "custom",
      colorScheme: "light" as const,
      tokens: { secondary: "red" },
    };
    expect(() =>
      createTheme({
        tokenSchema: { primary: "--color-primary" },
        themes: [customTheme as unknown as ThemeDefinition],
      }),
    ).toThrow('Theme "custom" defines token "secondary" which is not present in tokenSchema.');
  });

  it("should reject runtime overrides not present in tokenSchema", () => {
    const theme = createTheme({
      tokenSchema: { primary: "--color-primary" },
    }).init();

    expect(() => theme.set("dark", { secondary: "red" } as unknown as Partial<Record<string, string>>)).toThrow(
      'Runtime token override "secondary" is not present in tokenSchema.',
    );
  });

  it("should reject custom resolvers returning non-string on initialization", () => {
    const theme = createTheme({
      shouldApplyClass: (() => 123) as unknown as boolean,
    });
    expect(() => theme.init()).toThrow("Theme class resolver returned an invalid class for theme: light.");
  });

  it("should throw when passing runtime tokens without tokenSchema", () => {
    const theme = createTheme().init();
    expect(() => theme.set("dark", { primary: "blue" } as unknown as Partial<Record<string, string>>)).toThrow(
      "Runtime tokens provided but no tokenSchema is configured.",
    );
  });

  it("should handle null or invalid runtime token types", () => {
    const theme = createTheme({
      tokenSchema: { primary: "--color-primary" },
    }).init();

    // null should be ignored (like undefined) and not throw
    expect(() => theme.set("dark", null as unknown as Partial<Record<string, string>>)).not.toThrow();

    // primitive or array overrides should throw
    expect(() => theme.set("dark", "invalid-token" as unknown as Partial<Record<string, string>>)).toThrow(
      "Runtime tokens must be an object.",
    );
    expect(() => theme.set("dark", [] as unknown as Partial<Record<string, string>>)).toThrow(
      "Runtime tokens must be an object.",
    );
  });

  it("should handle null getComputedStyle gracefully", () => {
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = vi.fn().mockReturnValue(null);

    try {
      const tokenSchema = { primary: "--color-primary" };
      const theme = createTheme({
        tokenSchema,
      }).init();

      expect(() => theme.set("dark")).not.toThrow();
      expect(theme.get().tokens).toEqual({});
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }
  });

  it("should be idempotent on multiple init calls", () => {
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const theme = createTheme();

    // First init
    theme.init();
    const listenersCountAfterFirst = addListenerSpy.mock.calls.length;

    // Second init
    theme.init();
    expect(addListenerSpy.mock.calls.length).toBe(listenersCountAfterFirst);

    theme.destroy();
    addListenerSpy.mockRestore();
  });

  it("should ignore storage events if targeted theme matches active theme", () => {
    const theme = createTheme().init();
    const listener = vi.fn();
    const unsubscribe = theme.subscribe(listener);

    // Trigger storage event with the current theme name
    const storageEvent = new StorageEvent("storage", {
      key: "app-theme-preference",
      newValue: theme.get().name,
    });
    window.dispatchEvent(storageEvent);

    expect(listener).not.toHaveBeenCalled();

    // Trigger storage event with a different theme name
    const nextTheme = theme.get().name === "light" ? "dark" : "light";
    const storageEventDiff = new StorageEvent("storage", {
      key: "app-theme-preference",
      newValue: nextTheme,
    });
    window.dispatchEvent(storageEventDiff);

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    theme.destroy();
  });

  it("should preserve active token overrides on argless set and toggle", () => {
    const tokenSchema = { primary: "--color-primary" };
    const theme = createTheme({
      tokenSchema,
    }).init({ primary: "orange" });

    expect(theme.get().tokens).toEqual({ primary: "orange" });

    // Set to dark without overrides
    theme.set("dark");
    expect(theme.get().tokens).toEqual({ primary: "orange" });

    // Toggle back without overrides
    theme.toggle();
    expect(theme.get().tokens).toEqual({ primary: "orange" });
  });

  it("should preserve active token overrides on system scheme changes", () => {
    const tokenSchema = { primary: "--color-primary" };
    const mediaQueryList = createMatchMedia(false);
    const theme = createTheme({
      tokenSchema,
    }).init({ primary: "orange" });

    expect(theme.get().tokens).toEqual({ primary: "orange" });

    // Change system preference to dark
    mediaQueryList.dispatch(true);
    expect(theme.get().name).toBe("dark");
    expect(theme.get().tokens).toEqual({ primary: "orange" });
  });

  it("should preserve active token overrides on storage changes", () => {
    const tokenSchema = { primary: "--color-primary" };
    const theme = createTheme({
      tokenSchema,
    }).init({ primary: "orange" });

    expect(theme.get().tokens).toEqual({ primary: "orange" });

    // Dispatch storage event to switch theme
    const storageEvent = new StorageEvent("storage", {
      key: "app-theme-preference",
      newValue: "dark",
    });
    window.dispatchEvent(storageEvent);

    expect(theme.get().name).toBe("dark");
    expect(theme.get().tokens).toEqual({ primary: "orange" });
  });

  it("should not throw or run custom resolver function during constructor", () => {
    const resolver = vi.fn().mockReturnValue("theme-custom");
    expect(() =>
      createTheme({
        shouldApplyClass: resolver,
      }),
    ).not.toThrow();

    expect(resolver).not.toHaveBeenCalled();
  });

  it("should reject null or non-object theme definitions", () => {
    expect(() =>
      createTheme({
        themes: [null as unknown as ThemeDefinition],
      }),
    ).toThrow("Theme definitions must be objects.");
  });

  it("should sync clearPreference storage events when active theme matches system theme", () => {
    createMatchMedia(false); // system theme light
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    // Active theme is "light" (matches system).
    // Now trigger storage clear event (newValue: null)
    const storageEvent = new StorageEvent("storage", {
      key: "app-theme-preference",
      newValue: null,
    });
    window.dispatchEvent(storageEvent);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]?.name).toBe("light");
    expect(listener.mock.calls[0]?.[0]?.source).toBe("clearPreference");
    theme.destroy();
  });

  it("should dynamically resolve computed styles when stylesheet finishes loading after init", () => {
    const tokenSchema = { primary: "--color-primary" };
    const theme = createTheme({
      tokenSchema,
    }).init();

    // Before stylesheet loaded: tokens is empty
    expect(theme.get().tokens).toEqual({});

    // Inject stylesheet
    const styleEl = document.createElement("style");
    styleEl.textContent = `:root { --color-primary: purple; }`;
    document.head.appendChild(styleEl);

    try {
      // Now get() should dynamically query the style and return the correct value
      expect(theme.get().tokens).toEqual({ primary: "purple" });
    } finally {
      document.head.removeChild(styleEl);
      theme.destroy();
    }
  });

  it("should handle matchMedia throwing an error in getSystem and init", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => {
        throw new Error("Sandbox error");
      }),
    });

    try {
      const theme = createTheme();
      // getSystem should catch the error and fallback to default theme
      expect(theme.getSystem().name).toBe("light");

      // init should not throw
      expect(() => theme.init()).not.toThrow();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("should reset active token overrides on destroy", () => {
    const tokenSchema = { primary: "--color-primary" };
    const theme = createTheme({ tokenSchema }).init({ primary: "orange" });

    expect(theme.get().tokens).toEqual({ primary: "orange" });

    theme.destroy();
    theme.init();
    expect(theme.get().tokens).toEqual({});
  });

  it("should reset active theme name to defaultTheme on destroy", () => {
    const theme = createTheme().init();

    theme.set("dark");
    expect(theme.get().name).toBe("dark");

    // After destroy, activeName resets to defaultTheme ("light").
    // get() before re-init should reflect defaultTheme, not the stale "dark".
    theme.destroy();
    expect(theme.get().name).toBe("light");

    // Clear storage so re-init does not restore the previous explicit preference.
    window.localStorage.clear();

    // Re-init resolves from system preference (light, no media override), starting clean.
    theme.init();
    expect(theme.get().name).toBe("light");
  });

  it("should reject token definitions or overrides that use prototype properties", () => {
    expect(() =>
      createTheme({
        tokenSchema: { primary: "--color-primary" },
        themes: [
          {
            name: "light",
            colorScheme: "light",
            tokens: { toString: "bad" } as unknown as Partial<Record<string, string>>,
          },
        ],
      }),
    ).toThrow('Theme "light" defines token "toString" which is not present in tokenSchema.');

    const theme = createTheme({
      tokenSchema: { primary: "--color-primary" },
    }).init();

    expect(() => theme.set("dark", { toString: "bad" } as unknown as Partial<Record<string, string>>)).toThrow(
      'Runtime token override "toString" is not present in tokenSchema.',
    );
  });

  it("should reject attribute option containing invalid characters", () => {
    expect(() => createTheme({ attribute: "data theme" })).toThrow(
      "Theme attribute option must be a valid HTML attribute name.",
    );
    expect(() => createTheme({ attribute: 'data-theme"' })).toThrow(
      "Theme attribute option must be a valid HTML attribute name.",
    );
    expect(() => createTheme({ attribute: "data-theme>" })).toThrow(
      "Theme attribute option must be a valid HTML attribute name.",
    );
  });

  it("should cache class resolution and call custom resolver only once per theme", () => {
    const resolver = vi.fn().mockImplementation((theme) => `custom-${theme.name}`);
    const theme = createTheme({
      shouldApplyClass: resolver,
    });

    theme.init();
    expect(resolver).toHaveBeenCalledTimes(2); // Resolved once for light, once for dark

    resolver.mockClear();
    theme.set("dark");
    theme.set("light");
    expect(resolver).not.toHaveBeenCalled(); // Cached, no more resolver calls
  });
});
