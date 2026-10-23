// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createTheme as originalCreateTheme, THEME_CHANGE_EVENT, type ActiveTheme, type ThemeChangeDetail } from ".";

const activeThemes: Array<{ destroy(): void }> = [];
const createTheme = ((options) => {
  const theme = originalCreateTheme(options);
  activeThemes.push(theme);
  return theme;
}) as typeof originalCreateTheme;

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

const dispatchStorage = (init: StorageEventInit): void => {
  window.dispatchEvent(new StorageEvent("storage", init));
};

const replaceLocalStorage = (value: unknown): (() => void) => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", { configurable: true, ...(value as PropertyDescriptor) });
  return () => {
    if (original) {
      Object.defineProperty(window, "localStorage", original);
    }
  };
};

const root = document.documentElement;

const tokenThemes = {
  light: { colorScheme: "light", tokens: { primary: "blue", bg: "white" } },
  dark: { colorScheme: "dark", tokens: { primary: "red", bg: "black" } },
} as const;
const tokenSchema = { primary: "--color-primary", bg: "--color-bg" };

beforeEach(() => {
  root.removeAttribute("data-theme");
  root.removeAttribute("data-mode");
  root.className = "";
  root.removeAttribute("style");
  window.localStorage.clear();
  createMatchMedia(false);
});

afterEach(() => {
  for (const theme of activeThemes) {
    theme.destroy();
  }
  activeThemes.length = 0;
  vi.restoreAllMocks();
});

describe("Theme config", () => {
  it("should reject a themes option that is not an object keyed by name", () => {
    for (const themes of [[], null, undefined]) {
      expect(() => createTheme({ themes: themes as never })).toThrow(
        "Theme options.themes must be an object keyed by theme name.",
      );
    }
  });

  it("should reject empty theme names", () => {
    expect(() => createTheme({ themes: { " ": { colorScheme: "light" } } as never })).toThrow(
      "Theme names must be non-empty strings.",
    );
  });

  it("should reject non-object theme definitions", () => {
    expect(() => createTheme({ themes: { light: null, dark: { colorScheme: "dark" } } as never })).toThrow(
      'Theme "light" definition must be an object.',
    );
  });

  it("should reject invalid color schemes", () => {
    expect(() => createTheme({ themes: { custom: { colorScheme: "invalid" as "light" } } })).toThrow(
      'Theme "custom" has an invalid colorScheme: invalid. Must be "light" or "dark".',
    );
  });

  it("should reject missing default and system mappings", () => {
    expect(() => createTheme({ defaultTheme: "missing" as "light" })).toThrow(
      "Default theme is not configured: missing.",
    );
    expect(() => createTheme({ systemTheme: { light: "missing" as "light", dark: "dark" } })).toThrow(
      "System light theme is not configured: missing.",
    );
    expect(() => createTheme({ systemTheme: { light: "light", dark: "missing" as "dark" } })).toThrow(
      "System dark theme is not configured: missing.",
    );
  });

  it("should reject a name inherited from Object.prototype as default theme", () => {
    expect(() => createTheme({ defaultTheme: "toString" as "light" })).toThrow(
      "Default theme is not configured: toString.",
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

  it("should reject attribute option containing invalid characters", () => {
    for (const attribute of ["data theme", 'data-theme"', "data-theme>", "data-</script>"]) {
      expect(() => createTheme({ attribute })).toThrow("Theme attribute option must be a valid HTML attribute name.");
    }
  });

  it("should reject a className option that is neither a boolean nor a function", () => {
    expect(() => createTheme({ className: "theme" as unknown as boolean })).toThrow(
      "Theme className option must be a boolean or a function.",
    );
  });

  it("should reject default theme classes that are not single DOM tokens", () => {
    expect(() =>
      createTheme({
        themes: {
          light: { colorScheme: "light" },
          dark: { colorScheme: "dark" },
          "high contrast": { colorScheme: "dark" },
        },
      }),
    ).toThrow("Theme name cannot be used as a default theme class: high contrast.");
  });

  it("should accept names that are not class-safe when className is false", () => {
    expect(() =>
      createTheme({
        themes: { "high contrast": { colorScheme: "dark" } },
        defaultTheme: "high contrast",
        systemTheme: { light: "high contrast", dark: "high contrast" },
        className: false,
      }),
    ).not.toThrow();
  });

  it("should reject invalid or unconfigured pairedTheme", () => {
    expect(() =>
      createTheme({
        themes: { light: { colorScheme: "light", pairedTheme: "missing" as "dark" }, dark: { colorScheme: "dark" } },
      }),
    ).toThrow('Theme "light" references unconfigured pairedTheme: missing.');

    expect(() =>
      createTheme({
        themes: { light: { colorScheme: "light", pairedTheme: "" as "dark" }, dark: { colorScheme: "dark" } },
      }),
    ).toThrow('Theme "light" pairedTheme must be a non-empty string.');
  });

  it("should reject theme tokens if no tokenSchema is configured", () => {
    expect(() => createTheme({ themes: { custom: { colorScheme: "light", tokens: { primary: "blue" } } } })).toThrow(
      'Theme "custom" defines tokens but no tokenSchema is configured.',
    );
  });

  it("should reject tokenSchema values that do not start with --", () => {
    expect(() => createTheme({ tokenSchema: { primary: "color-primary" } })).toThrow(
      'Token schema key "primary" must map to a CSS custom property starting with "--". Received: "color-primary".',
    );
  });

  it("should reject theme static tokens not present in tokenSchema", () => {
    expect(() =>
      createTheme({
        tokenSchema: { primary: "--color-primary" },
        themes: { custom: { colorScheme: "light", tokens: { secondary: "red" } as never } },
        defaultTheme: "custom",
        systemTheme: { light: "custom", dark: "custom" },
      }),
    ).toThrow('Theme "custom" defines token "secondary" which is not present in tokenSchema.');
  });

  it("should reject theme tokens that use prototype properties", () => {
    expect(() =>
      createTheme({
        tokenSchema: { primary: "--color-primary" },
        themes: {
          light: { colorScheme: "light", tokens: { toString: "bad" } as never },
          dark: { colorScheme: "dark" },
        },
      }),
    ).toThrow('Theme "light" defines token "toString" which is not present in tokenSchema.');
  });

  it("should not run a custom class resolver during construction", () => {
    const resolver = vi.fn().mockReturnValue("theme-custom");

    expect(() => createTheme({ className: resolver })).not.toThrow();
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("Theme types", () => {
  it("should infer theme names from the keys of themes", () => {
    const theme = createTheme({
      themes: { light: { colorScheme: "light" }, dim: { colorScheme: "dark", pairedTheme: "light" } },
      systemTheme: { light: "light", dark: "dim" },
    });

    expectTypeOf(theme.name).toEqualTypeOf<"light" | "dim">();
    expectTypeOf(theme.preference).toEqualTypeOf<"light" | "dim" | null>();
    expectTypeOf(theme.set).parameter(0).toEqualTypeOf<"light" | "dim">();
  });

  it("should default theme names to the built-in light and dark themes", () => {
    expectTypeOf(createTheme().name).toEqualTypeOf<"light" | "dark">();
  });

  it("should reject unconfigured theme names at compile time", () => {
    const options = { themes: { light: { colorScheme: "light" }, dark: { colorScheme: "dark" } } } as const;

    expect(() => {
      // @ts-expect-error -- "ligth" is not a configured theme
      createTheme({ ...options, defaultTheme: "ligth" });
    }).toThrow("Default theme is not configured: ligth.");
    expect(() => {
      // @ts-expect-error -- "drak" is not a configured theme
      createTheme(options).set("drak");
    }).toThrow("Theme is not configured: drak.");
    expect(() => {
      // @ts-expect-error -- pairedTheme must name a configured theme
      createTheme({ themes: { light: { colorScheme: "light", pairedTheme: "drak" } } });
    }).toThrow('Theme "light" references unconfigured pairedTheme: drak.');
  });

  it("should type tokens from tokenSchema", () => {
    const theme = createTheme({ themes: tokenThemes, tokenSchema });

    expectTypeOf(theme.get().tokens).toEqualTypeOf<Readonly<Partial<Record<"primary" | "bg", string>>>>();
    expect(() => {
      // @ts-expect-error -- "secondary" is not in tokenSchema
      theme.setTokens({ secondary: "red" });
    }).toThrow('Runtime token override "secondary" is not present in tokenSchema.');
  });
});

describe("Theme behavior", () => {
  it("should apply the system theme when no valid preference is stored", () => {
    createMatchMedia(true);
    window.localStorage.setItem("app-theme-preference", "unknown");

    const theme = createTheme().init();

    expect(theme.name).toBe("dark");
    expect(theme.preference).toBeNull();
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(root.classList.contains("theme-dark")).toBe(true);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("should apply the stored preference on init", () => {
    window.localStorage.setItem("app-theme-preference", "dark");

    const theme = createTheme().init();

    expect(theme.name).toBe("dark");
    expect(theme.preference).toBe("dark");
  });

  it("should report the default theme before init", () => {
    window.localStorage.setItem("app-theme-preference", "dark");

    expect(createTheme().name).toBe("light");
  });

  it("should remove pre-existing configured theme classes on init", () => {
    root.className = "app-shell theme-dark keep-me";

    createTheme().init();

    expect(root.className).toBe("app-shell keep-me theme-light");
  });

  it("should store and apply an explicit theme", () => {
    const theme = createTheme({ darkClass: true }).init();

    const nextTheme = theme.set("dark");

    expect(nextTheme.name).toBe("dark");
    expect(theme.preference).toBe("dark");
    expect(window.localStorage.getItem("app-theme-preference")).toBe("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.classList.contains("theme-light")).toBe(false);
    expect(root.classList.contains("theme-dark")).toBe(true);
    expect(root.classList.contains("dark")).toBe(true);
  });

  it("should keep className independent from darkClass", () => {
    const theme = createTheme({ className: false, darkClass: true }).init();

    theme.set("dark");

    expect(root.className).toBe("dark");
  });

  it("should not remove pre-existing dark classes when darkClass is disabled", () => {
    root.className = "dark app-shell";

    createTheme().init();

    expect(root.classList.contains("dark")).toBe(true);
    expect(root.classList.contains("app-shell")).toBe(true);
  });

  it("should apply the exact default theme class", () => {
    const theme = createTheme({
      themes: { light: { colorScheme: "light" }, dark: { colorScheme: "dark" }, BrandDark: { colorScheme: "dark" } },
    }).init();

    theme.set("BrandDark");

    expect(root.classList.contains("theme-BrandDark")).toBe(true);
  });

  it("should support custom attributes, custom class names, and more than two themes", () => {
    const theme = createTheme({
      themes: {
        light: { colorScheme: "light" },
        dark: { colorScheme: "dark" },
        "high contrast": { colorScheme: "dark" },
      },
      systemTheme: { light: "light", dark: "high contrast" },
      attribute: "data-mode",
      className: (definition) => `mode-${definition.name.replace(" ", "-")}`,
      darkClass: true,
    }).init();

    theme.set("high contrast");

    expect(root.getAttribute("data-mode")).toBe("high contrast");
    expect(root.className).toBe("mode-high-contrast dark");
  });

  it("should pass the theme with its static tokens to a custom class resolver", () => {
    const resolver = vi.fn().mockReturnValue("custom");
    const theme = createTheme({ themes: tokenThemes, tokenSchema, className: resolver });

    theme.setTokens({ primary: "orange" });

    expect(resolver).toHaveBeenCalledWith({
      name: "light",
      colorScheme: "light",
      tokens: { primary: "blue", bg: "white" },
    });
  });

  it("should reject invalid custom theme classes without touching the DOM", () => {
    root.className = "app-shell";
    root.setAttribute("data-theme", "server");

    expect(() =>
      createTheme({ className: (definition) => (definition.name === "dark" ? "two classes" : "theme-light") }).init(),
    ).toThrow("Theme class resolver returned an invalid class for theme: dark.");
    expect(() => createTheme({ className: (() => 123) as unknown as () => string }).init()).toThrow(
      "Theme class resolver returned an invalid class for theme: light.",
    );
    expect(root.getAttribute("data-theme")).toBe("server");
    expect(root.className).toBe("app-shell");
  });

  it("should call a custom class resolver once per theme", () => {
    const resolver = vi.fn().mockImplementation((theme: ActiveTheme) => `custom-${theme.name}`);
    const theme = createTheme({ className: resolver }).init();

    expect(resolver).toHaveBeenCalledTimes(2);

    resolver.mockClear();
    theme.set("dark");
    theme.set("light");
    theme.getPrePaintScript();
    expect(resolver).not.toHaveBeenCalled();
  });

  it("should toggle between configured system light and dark themes", () => {
    const theme = createTheme({
      themes: { light: { colorScheme: "light" }, dark: { colorScheme: "dark" }, midnight: { colorScheme: "dark" } },
      systemTheme: { light: "light", dark: "midnight" },
    }).init();

    expect(theme.toggle().name).toBe("midnight");
    expect(theme.toggle().name).toBe("light");
    expect(theme.preference).toBe("light");
  });

  it("should prefer pairedTheme when toggling", () => {
    const theme = createTheme({
      themes: {
        "solarized-light": { colorScheme: "light", pairedTheme: "solarized-dark" },
        "solarized-dark": { colorScheme: "dark", pairedTheme: "solarized-light" },
        light: { colorScheme: "light" },
        dark: { colorScheme: "dark" },
      },
    }).init();

    theme.set("solarized-light");

    expect(theme.toggle().name).toBe("solarized-dark");
    expect(theme.toggle().name).toBe("solarized-light");
  });

  it("should clear preference and return to system theme", () => {
    createMatchMedia(true);
    const theme = createTheme().init();

    theme.set("light");
    const systemTheme = theme.clearPreference();

    expect(systemTheme.name).toBe("dark");
    expect(theme.preference).toBeNull();
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("should report the system theme from the current OS preference", () => {
    const mediaQueryList = createMatchMedia(false);
    const theme = createTheme();

    expect(theme.system).toBe("light");
    mediaQueryList.matches = true;
    expect(theme.system).toBe("dark");
  });

  it("should throw when setting an unconfigured theme", () => {
    const theme = createTheme().init();

    expect(() => theme.set("missing" as "dark")).toThrow("Theme is not configured: missing.");
    expect(() => theme.set("toString" as "dark")).toThrow("Theme is not configured: toString.");
    expect(theme.preference).toBeNull();
  });

  it("should keep methods working when passed as callbacks", () => {
    const { init, toggle, subscribe, get, set } = createTheme();
    const listener = vi.fn();

    const button = document.createElement("button");
    button.addEventListener("click", toggle);

    subscribe(listener);
    init();
    button.click();

    expect(get().name).toBe("dark");
    expect(set("light").name).toBe("light");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("should be idempotent on multiple init calls", () => {
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const theme = createTheme();
    const listener = vi.fn();
    theme.subscribe(listener);

    theme.init();
    const listenersCountAfterFirst = addListenerSpy.mock.calls.length;
    theme.init();

    expect(addListenerSpy.mock.calls.length).toBe(listenersCountAfterFirst);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should stay safe when localStorage operations throw", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
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
    const restore = replaceLocalStorage({ value: throwingStorage });

    try {
      const theme = createTheme().init();

      expect(theme.preference).toBeNull();
      expect(() => theme.set("dark")).not.toThrow();
      expect(() => theme.clearPreference()).not.toThrow();
      expect(throwingStorage.getItem).toHaveBeenCalled();
      expect(throwingStorage.setItem).toHaveBeenCalled();
      expect(throwingStorage.removeItem).toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("should fall back to the default theme when matchMedia throws", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation(() => {
        throw new Error("Sandbox error");
      }),
    });
    const theme = createTheme({ defaultTheme: "dark" });

    expect(theme.system).toBe("dark");
    expect(() => theme.init()).not.toThrow();
    expect(theme.name).toBe("dark");
  });
});

describe("Theme snapshots", () => {
  it("should return the same frozen object until the next change", () => {
    const theme = createTheme().init();
    const snapshot = theme.get();

    expect(theme.get()).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tokens)).toBe(true);

    theme.set("dark");

    expect(theme.get()).not.toBe(snapshot);
    expect(snapshot.name).toBe("light");
  });

  it("should keep a snapshot's tokens when the theme changes later", () => {
    const styleEl = document.createElement("style");
    styleEl.textContent = `[data-theme="light"] { --color-accent: white; } [data-theme="dark"] { --color-accent: black; }`;
    document.head.append(styleEl);

    try {
      const theme = createTheme({
        themes: tokenThemes,
        tokenSchema: { ...tokenSchema, accent: "--color-accent" },
      }).init();
      const snapshot = theme.get();

      theme.set("dark");

      expect(snapshot).toEqual({ name: "light", colorScheme: "light", tokens: { primary: "blue", bg: "white" } });
    } finally {
      styleEl.remove();
    }
  });

  it("should deliver the snapshot get() returns to subscribers", () => {
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    theme.set("dark");

    expect(listener.mock.calls[0]?.[0]?.theme).toBe(theme.get());
  });

  it("should not read the DOM in get()", () => {
    const theme = createTheme({ tokenSchema }).init();
    const spy = vi.spyOn(window, "getComputedStyle");

    theme.set("dark");

    expect(theme.get().tokens).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("Theme change notifications", () => {
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
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ name: "dark", source: "set" });
    expect(eventListener).toHaveBeenCalledTimes(2);
    expect(eventListener.mock.results[0]?.value).toMatchObject({ name: "dark", source: "set" });
  });

  it("should report the method that caused each change", () => {
    const theme = createTheme({ tokenSchema });
    const listener = vi.fn();
    theme.subscribe(listener);

    theme.init();
    theme.set("dark");
    theme.toggle();
    theme.setTokens({});
    theme.clearPreference();

    expect(listener.mock.calls.map(([detail]) => detail.source)).toEqual([
      "init",
      "set",
      "toggle",
      "setTokens",
      "clearPreference",
    ]);
  });

  it("should isolate errors in theme change listeners", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const theme = createTheme().init();
    const goodListener = vi.fn();

    theme.subscribe(() => {
      throw new Error("Bad listener error");
    });
    theme.subscribe(goodListener);
    theme.set("dark");

    expect(goodListener).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith("[theme] Error in theme change listener:", expect.any(Error));
  });

  it("should respond to system changes only without a stored preference", () => {
    const mediaQueryList = createMatchMedia(false);
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    mediaQueryList.dispatch(true);
    expect(theme.name).toBe("dark");
    expect(listener.mock.calls[0]?.[0]?.source).toBe("system");

    mediaQueryList.dispatch(false);
    expect(theme.name).toBe("light");

    theme.set("light");
    mediaQueryList.dispatch(true);
    expect(theme.name).toBe("light");

    theme.destroy();
    expect(mediaQueryList.removeEventListener).toHaveBeenCalledOnce();
  });
});

describe("Theme cross-tab sync", () => {
  it("should apply a preference set in another tab and report it as storage", () => {
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    window.localStorage.setItem("app-theme-preference", "dark");
    dispatchStorage({ key: "app-theme-preference", newValue: "dark" });

    expect(theme.name).toBe("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ name: "dark", source: "storage" });
  });

  it("should apply the system theme when another tab clears the preference", () => {
    window.localStorage.setItem("app-theme-preference", "dark");
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    window.localStorage.removeItem("app-theme-preference");
    dispatchStorage({ key: "app-theme-preference", newValue: null });

    expect(theme.name).toBe("light");
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ name: "light", source: "storage" });
  });

  it("should notify a preference change even when the active theme stays the same", () => {
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    window.localStorage.setItem("app-theme-preference", "light");
    dispatchStorage({ key: "app-theme-preference", newValue: "light" });

    expect(theme.preference).toBe("light");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("should apply the system theme when another tab calls localStorage.clear()", () => {
    window.localStorage.setItem("app-theme-preference", "dark");
    const theme = createTheme().init();

    window.localStorage.clear();
    dispatchStorage({ key: null, newValue: null });

    expect(theme.name).toBe("light");
    expect(theme.preference).toBeNull();
  });

  it("should treat an unconfigured stored name from another tab as no preference", () => {
    createMatchMedia(true);
    window.localStorage.setItem("app-theme-preference", "light");
    const theme = createTheme().init();

    window.localStorage.setItem("app-theme-preference", "unknown-theme");
    dispatchStorage({ key: "app-theme-preference", newValue: "unknown-theme" });

    expect(theme.name).toBe("dark");
  });

  it("should ignore unrelated storage events", () => {
    const theme = createTheme().init();
    const listener = vi.fn();
    theme.subscribe(listener);

    dispatchStorage({ key: "unrelated-key", newValue: "dark" });

    expect(theme.name).toBe("light");
    expect(listener).not.toHaveBeenCalled();
  });

  it("should stop syncing after destroy", () => {
    const theme = createTheme().init();
    theme.destroy();

    window.localStorage.setItem("app-theme-preference", "dark");
    dispatchStorage({ key: "app-theme-preference", newValue: "dark" });

    expect(theme.name).toBe("light");
  });
});

describe("Theme CSS tokens", () => {
  it("should apply theme-defined tokens on init and theme change", () => {
    const theme = createTheme({ themes: tokenThemes, tokenSchema }).init();

    expect(root.style.getPropertyValue("--color-primary")).toBe("blue");
    expect(root.style.getPropertyValue("--color-bg")).toBe("white");

    theme.set("dark");
    expect(root.style.getPropertyValue("--color-primary")).toBe("red");
    expect(root.style.getPropertyValue("--color-bg")).toBe("black");
  });

  it("should clear omitted tokens to allow CSS fallback", () => {
    const theme = createTheme({
      themes: { light: { colorScheme: "light", tokens: { primary: "blue" } }, dark: tokenThemes.dark },
      tokenSchema,
      defaultTheme: "dark",
    }).init();

    theme.set("dark");
    theme.set("light");

    expect(root.style.getPropertyValue("--color-primary")).toBe("blue");
    expect(root.style.getPropertyValue("--color-bg")).toBe("");
  });

  it("should apply runtime overrides over static tokens", () => {
    const theme = createTheme({ themes: tokenThemes, tokenSchema }).init();

    const active = theme.setTokens({ primary: "purple" });

    expect(active.tokens).toEqual({ primary: "purple", bg: "white" });
    expect(root.style.getPropertyValue("--color-primary")).toBe("purple");
    expect(root.style.getPropertyValue("--color-bg")).toBe("white");
  });

  it("should keep runtime overrides across theme, system, and storage changes", () => {
    const mediaQueryList = createMatchMedia(false);
    const theme = createTheme({ tokenSchema });
    theme.setTokens({ primary: "orange" });
    theme.init();

    theme.set("dark");
    expect(theme.get().tokens).toEqual({ primary: "orange" });
    theme.toggle();
    expect(theme.get().tokens).toEqual({ primary: "orange" });

    theme.clearPreference();
    mediaQueryList.dispatch(true);
    expect(theme.get()).toMatchObject({ name: "dark", tokens: { primary: "orange" } });

    window.localStorage.setItem("app-theme-preference", "light");
    dispatchStorage({ key: "app-theme-preference", newValue: "light" });
    expect(theme.get()).toMatchObject({ name: "light", tokens: { primary: "orange" } });
  });

  it("should replace runtime overrides on each setTokens call", () => {
    const theme = createTheme({ themes: tokenThemes, tokenSchema }).init();

    theme.setTokens({ primary: "purple" });
    theme.setTokens({ bg: "gray" });
    expect(theme.get().tokens).toEqual({ primary: "blue", bg: "gray" });

    theme.setTokens({});
    expect(theme.get().tokens).toEqual({ primary: "blue", bg: "white" });
  });

  it("should not be affected by later mutation of the object passed to setTokens", () => {
    const theme = createTheme({ tokenSchema }).init();
    const tokens: Record<string, string> = { primary: "purple" };

    theme.setTokens(tokens);
    tokens.primary = "green";

    expect(theme.get().tokens).toEqual({ primary: "purple" });
  });

  it("should reject invalid runtime overrides", () => {
    const theme = createTheme({ tokenSchema: { primary: "--color-primary" } }).init();

    for (const tokens of [null, undefined, "invalid", []]) {
      expect(() => theme.setTokens(tokens as never)).toThrow("Runtime tokens must be an object.");
    }
    expect(() => theme.setTokens({ secondary: "red" } as never)).toThrow(
      'Runtime token override "secondary" is not present in tokenSchema.',
    );
    expect(() => theme.setTokens({ toString: "bad" } as never)).toThrow(
      'Runtime token override "toString" is not present in tokenSchema.',
    );
  });

  it("should throw when passing runtime tokens without tokenSchema", () => {
    const theme = createTheme().init();

    expect(() => theme.setTokens({ primary: "blue" } as never)).toThrow(
      "Runtime tokens provided but no tokenSchema is configured.",
    );
  });

  it("should reset runtime overrides on destroy", () => {
    const theme = createTheme({ tokenSchema });
    theme.setTokens({ primary: "orange" });

    theme.destroy();
    theme.init();

    expect(theme.get().tokens).toEqual({});
  });

  it("should complete tokens from computed styles in readTokens()", () => {
    const styleEl = document.createElement("style");
    styleEl.textContent = `:root { --color-primary: blue; } .theme-dark { --color-primary: red; }`;
    document.head.append(styleEl);

    try {
      const theme = createTheme({
        themes: {
          light: { colorScheme: "light" },
          dark: { colorScheme: "dark" },
          forest: { colorScheme: "light", tokens: { primary: "green" } },
        },
        tokenSchema: { primary: "--color-primary" },
      }).init();

      theme.set("forest");
      expect(theme.readTokens()).toEqual({ primary: "green" });

      theme.set("light");
      expect(theme.get().tokens).toEqual({});
      expect(theme.readTokens()).toEqual({ primary: "blue" });

      theme.set("dark");
      expect(theme.readTokens()).toEqual({ primary: "red" });
    } finally {
      styleEl.remove();
    }
  });

  it("should read computed styles at the time of each readTokens() call", () => {
    const theme = createTheme({ tokenSchema: { primary: "--color-primary" } }).init();
    expect(theme.readTokens()).toEqual({});

    const styleEl = document.createElement("style");
    styleEl.textContent = `:root { --color-primary: purple; }`;
    document.head.append(styleEl);

    try {
      expect(theme.readTokens()).toEqual({ primary: "purple" });
    } finally {
      styleEl.remove();
    }
  });

  it("should skip computed styles in readTokens() when every token is known", () => {
    const theme = createTheme({ themes: tokenThemes, tokenSchema }).init();
    const spy = vi.spyOn(window, "getComputedStyle");

    expect(theme.readTokens()).toEqual({ primary: "blue", bg: "white" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("should fall back to known tokens when getComputedStyle fails", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const theme = createTheme({ tokenSchema }).init();
    theme.setTokens({ primary: "orange" });

    vi.spyOn(window, "getComputedStyle").mockReturnValue(null as unknown as CSSStyleDeclaration);
    expect(theme.readTokens()).toEqual({ primary: "orange" });

    vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(theme.readTokens()).toEqual({ primary: "orange" });
    expect(consoleErrorSpy).toHaveBeenCalledWith("[theme] Failed to read computed token styles:", expect.any(Error));
  });
});

describe("Theme destroy", () => {
  it("should reset the active theme name to defaultTheme", () => {
    const theme = createTheme().init();
    theme.set("dark");

    theme.destroy();
    expect(theme.name).toBe("light");
    expect(theme.get().name).toBe("light");

    window.localStorage.clear();
    theme.init();
    expect(theme.name).toBe("light");
  });

  it("should leave the DOM as it is by default", () => {
    const theme = createTheme().init();
    theme.set("dark");

    theme.destroy();

    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("should revert DOM attributes, classes, and properties with revertDom", () => {
    const theme = createTheme({ tokenSchema, darkClass: true }).init();
    theme.setTokens({ primary: "blue" });
    theme.set("dark");

    theme.destroy({ revertDom: true });

    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(root.className).toBe("");
    expect(root.style.colorScheme).toBe("");
    expect(root.style.getPropertyValue("--color-primary")).toBe("");
  });
});

describe("Theme pre-paint script", () => {
  const run = (script: string): void => {
    new Function(script)();
  };

  it("should apply the stored theme, its classes, and its static tokens", () => {
    const script = createTheme({
      themes: tokenThemes,
      tokenSchema,
      storageKey: "custom-key",
      attribute: "data-mode",
      className: (t) => `app-${t.name}`,
      darkClass: true,
    }).getPrePaintScript();

    window.localStorage.setItem("custom-key", "dark");
    run(script);

    expect(root.getAttribute("data-mode")).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(root.className).toBe("app-dark dark");
    expect(root.style.getPropertyValue("--color-primary")).toBe("red");
  });

  it("should leave out runtime overrides", () => {
    const theme = createTheme({ themes: tokenThemes, tokenSchema });
    theme.setTokens({ primary: "purple" });

    run(theme.getPrePaintScript());

    expect(root.style.getPropertyValue("--color-primary")).toBe("blue");
  });

  it("should apply the system theme when no valid preference is stored", () => {
    createMatchMedia(true);
    window.localStorage.setItem("app-theme-preference", "unknown");

    run(createTheme().getPrePaintScript());

    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("should apply the system theme when localStorage access throws", () => {
    createMatchMedia(true);
    const script = createTheme().getPrePaintScript();
    const restore = replaceLocalStorage({
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });

    try {
      run(script);
    } finally {
      restore();
    }

    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.className).toBe("theme-dark");
  });

  it("should apply the default theme when matchMedia is unavailable, as init() does", () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
    const theme = createTheme({ defaultTheme: "dark" });

    run(theme.getPrePaintScript());

    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(theme.system).toBe("dark");
  });

  it("should replace a server-rendered theme class", () => {
    createMatchMedia(true);
    root.className = "app-shell theme-light";

    run(createTheme().getPrePaintScript());

    expect(root.className).toBe("app-shell theme-dark");
  });

  it("should remove the dark class for a light theme when darkClass is enabled", () => {
    root.className = "dark";

    run(createTheme({ darkClass: true }).getPrePaintScript());

    expect(root.className).toBe("theme-light");
  });

  it("should keep token values from closing the inline script element", () => {
    const font = "</script><script>alert(1)</script><!--\u2028a\u2029b";
    const script = createTheme({
      themes: { light: { colorScheme: "light", tokens: { font } } },
      systemTheme: { light: "light", dark: "light" },
      tokenSchema: { font: "--font-body" },
    }).getPrePaintScript();

    expect(script).not.toMatch(/<\/script|<!--|\u2028|\u2029/i);

    run(script);

    expect(root.style.getPropertyValue("--font-body")).toBe(font);
  });

  it("should keep theme names and storage keys from closing the inline script element", () => {
    const name = "</script><!--dark";
    const storageKey = "</script>key";
    const script = createTheme({
      themes: { [name]: { colorScheme: "dark" } },
      defaultTheme: name,
      systemTheme: { light: name, dark: name },
      storageKey,
      className: false,
    }).getPrePaintScript();

    expect(script).not.toMatch(/<\/script|<!--/i);

    window.localStorage.setItem(storageKey, name);
    run(script);

    expect(root.getAttribute("data-theme")).toBe(name);
  });

  it("should apply a configured theme named __proto__ when it is stored", () => {
    const themes = JSON.parse(
      '{"light":{"colorScheme":"light","tokens":{"primary":"#ffffff"}},"__proto__":{"colorScheme":"dark","tokens":{"primary":"#000000"}}}',
    ) as Record<"light" | "__proto__", { colorScheme: "light" | "dark"; tokens: { primary: string } }>;
    const theme = createTheme({
      themes,
      systemTheme: { light: "light", dark: "light" },
      tokenSchema: { primary: "--color-primary" },
      className: false,
    });

    window.localStorage.setItem("app-theme-preference", "__proto__");
    run(theme.getPrePaintScript());

    expect(root.getAttribute("data-theme")).toBe("__proto__");
    expect(root.style.getPropertyValue("--color-primary")).toBe("#000000");

    theme.init();
    expect(theme.name).toBe("__proto__");
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "should fall back as for an unknown name when the stored theme is the Object property %s",
    (storedName) => {
      const theme = createTheme();
      const script = theme.getPrePaintScript();

      window.localStorage.setItem("app-theme-preference", storedName);
      run(script);

      expect(root.getAttribute("data-theme")).toBe("light");
      expect(theme.preference).toBeNull();
    },
  );
});
