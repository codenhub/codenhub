// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createTheme as originalCreateTheme,
  THEME_CHANGE_EVENT,
  type ActiveTheme,
  type Theme,
  type ThemeChangeDetail,
  type ThemeChangeEvent,
  type ThemeOptions,
} from ".";

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
  it("should reject options that are not an object", () => {
    for (const options of [null, "dark", []]) {
      expect(() => createTheme(options as never)).toThrow("Theme options must be an object.");
    }
  });

  it("should reject a themes option that is not an object keyed by name", () => {
    for (const themes of [[], null]) {
      expect(() => createTheme({ themes: themes as never })).toThrow(
        "Theme options.themes must be an object keyed by theme name.",
      );
    }
  });

  it("should use the default for an option set to undefined", () => {
    const theme = createTheme({
      themes: undefined,
      defaultTheme: undefined,
      systemTheme: { light: undefined, dark: undefined } as never,
      storageKey: undefined,
      attribute: undefined,
      darkClass: undefined,
      className: undefined,
      tokenSchema: undefined,
    }).init();

    theme.set("dark");

    expect(window.localStorage.getItem("app-theme-preference")).toBe("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.className).toBe("theme-dark");
  });

  it("should accept options and token values that may be undefined under exactOptionalPropertyTypes", () => {
    const props: { storageKey?: string | undefined; primary?: string | undefined; revertDom?: boolean | undefined } =
      {};
    const theme = createTheme({
      themes: {
        light: { colorScheme: "light", tokens: { primary: props.primary }, pairedTheme: undefined },
        dark: { colorScheme: "dark" },
      },
      tokenSchema: { primary: "--color-primary" },
      storageKey: props.storageKey,
    }).init();

    expect(theme.setTokens({ primary: props.primary }).tokens).toEqual({});
    expect(() => theme.destroy({ revertDom: props.revertDom })).not.toThrow();
  });

  it("should reject a systemTheme option that is not an object", () => {
    for (const systemTheme of ["dark", 1, []]) {
      expect(() => createTheme({ systemTheme: systemTheme as never })).toThrow(
        "Theme systemTheme option must be an object with light and dark theme names.",
      );
    }
  });

  it("should reject a darkClass option that is not a boolean", () => {
    expect(() => createTheme({ darkClass: "yes" as unknown as boolean })).toThrow(
      "Theme darkClass option must be a boolean.",
    );
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
    for (const attribute of ["data theme", 'data-theme"', "data-theme>", "data-</script>", "data\u0000theme"]) {
      expect(() => createTheme({ attribute })).toThrow("Theme attribute option must be a valid HTML attribute name.");
    }
  });

  it("should reject the class and style attributes, which would replace the page's own values", () => {
    for (const attribute of ["class", "style", "CLASS", "Style"]) {
      expect(() => createTheme({ attribute })).toThrow(
        `Theme attribute option cannot be "${attribute.toLowerCase()}"; use the className option to apply a class.`,
      );
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
    // @ts-expect-error -- tokens need a tokenSchema
    expect(() => createTheme({ themes: { custom: { colorScheme: "light", tokens: { primary: "blue" } } } })).toThrow(
      'Theme "custom" defines tokens but no tokenSchema is configured.',
    );
  });

  it("should reject tokenSchema values that are not CSS custom property names", () => {
    for (const value of ["color-primary", "--", "--color primary", "--color;primary", "--color\\ primary", "-color"]) {
      expect(() => createTheme({ tokenSchema: { primary: value } })).toThrow(
        `Token schema key "primary" must map to a CSS custom property name, such as "--color-primary". Received: "${value}".`,
      );
    }
  });

  it("should reject two tokenSchema keys that map to the same CSS custom property", () => {
    expect(() => createTheme({ tokenSchema: { primary: "--color-primary", brand: "--color-primary" } })).toThrow(
      'Token schema keys "primary" and "brand" both map to "--color-primary".',
    );
  });

  it("should reject theme tokens that are not an object", () => {
    expect(() =>
      createTheme({
        themes: { light: { colorScheme: "light", tokens: "blue" as never }, dark: { colorScheme: "dark" } },
        tokenSchema,
      }),
    ).toThrow('Theme "light" tokens must be an object.');
  });

  it("should reject a tokenSchema that is not an object", () => {
    for (const value of [null, "--color-primary", ["--color-primary"]]) {
      expect(() => createTheme({ tokenSchema: value as never })).toThrow("Theme tokenSchema option must be an object.");
    }
  });

  it("should accept tokenSchema names made of letters, digits, hyphens, underscores, and non-ASCII characters", () => {
    for (const value of ["--color-primary", "--_x", "--1", "---", "--couleur-élevée", "--🎨"]) {
      expect(() => createTheme({ tokenSchema: { primary: value } })).not.toThrow();
    }
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

  it("should type the themechange event detail", () => {
    expectTypeOf<ThemeChangeEvent<"light" | "dim">["detail"]>().toEqualTypeOf<ThemeChangeDetail<"light" | "dim">>();
  });

  it("should type tokens from tokenSchema", () => {
    const theme = createTheme({ themes: tokenThemes, tokenSchema });

    expectTypeOf(theme.get().tokens).toEqualTypeOf<Readonly<Partial<Record<"primary" | "bg", string>>>>();
    expect(() => {
      // @ts-expect-error -- "secondary" is not in tokenSchema
      theme.setTokens({ secondary: "red" });
    }).toThrow('Runtime token override "secondary" is not present in tokenSchema.');
  });

  it("should reject tokens without a tokenSchema at compile time", () => {
    expect(() => {
      createTheme({
        // @ts-expect-error -- tokens need a tokenSchema
        themes: { light: { colorScheme: "light", tokens: { primary: "blue" } }, dark: { colorScheme: "dark" } },
      });
    }).toThrow('Theme "light" defines tokens but no tokenSchema is configured.');
    expect(() => {
      // @ts-expect-error -- setTokens needs a tokenSchema
      createTheme().setTokens({ primary: "blue" });
    }).toThrow("Runtime tokens provided but no tokenSchema is configured.");
  });

  it("should keep managers without a tokenSchema assignable to the default Theme type", () => {
    const withoutSchema: Theme = createTheme();
    const withSchema: Theme = createTheme({ themes: tokenThemes, tokenSchema });
    const wrap = <TName extends string>(options: ThemeOptions<TName>): Theme<TName> => createTheme(options);

    expectTypeOf(wrap({ themes: tokenThemes, tokenSchema }).setTokens)
      .parameter(0)
      .toEqualTypeOf<Partial<Record<string, string | undefined>>>();
    expect([withoutSchema, withSchema]).toHaveLength(2);
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

  it("should leave state, storage, and the DOM unchanged when a class resolver throws", () => {
    const listener = vi.fn();
    const theme = createTheme({ className: (definition) => (definition.name === "dark" ? "two classes" : "light") });
    theme.subscribe(listener);

    for (const operation of [() => theme.set("dark"), () => theme.toggle(), () => theme.clearPreference()]) {
      expect(operation).toThrow("Theme class resolver returned an invalid class for theme: dark.");
    }

    expect(theme.name).toBe("light");
    expect(theme.get().name).toBe("light");
    expect(theme.preference).toBeNull();
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("should keep runtime tokens unchanged when a class resolver throws in setTokens", () => {
    const theme = createTheme({ tokenSchema, className: () => "two classes" });

    expect(() => theme.setTokens({ primary: "purple" })).toThrow(
      "Theme class resolver returned an invalid class for theme: light.",
    );
    expect(theme.get().tokens).toEqual({});
  });

  it("should not start listening when init throws for a class resolver", () => {
    const mediaQueryList = createMatchMedia(false);
    const theme = createTheme({ className: () => "two classes" });

    expect(() => theme.init()).toThrow("Theme class resolver returned an invalid class for theme: light.");
    expect(mediaQueryList.addEventListener).not.toHaveBeenCalled();
    expect(() => theme.init()).toThrow("Theme class resolver returned an invalid class for theme: light.");
  });

  it("should follow OS changes through the legacy addListener API", () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQueryList = {
      matches: false,
      addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
      removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    };
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue(mediaQueryList) });
    const theme = createTheme().init();

    for (const listener of listeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }
    expect(theme.name).toBe("dark");

    theme.destroy();
    expect(mediaQueryList.removeListener).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
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

  it("should keep a choice made before init when storage is unavailable", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mediaQueryList = createMatchMedia(false);
    const restore = replaceLocalStorage({
      get: () => {
        throw new Error("blocked");
      },
    });

    try {
      const theme = createTheme();
      theme.set("dark");
      theme.init();
      expect(theme.name).toBe("dark");

      theme.clearPreference();
      mediaQueryList.dispatch(true);
      expect(theme.name).toBe("dark");
    } finally {
      restore();
    }
  });

  it("should keep an explicit choice over OS changes when storage is unavailable", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mediaQueryList = createMatchMedia(false);
    const restore = replaceLocalStorage({
      get: () => {
        throw new Error("blocked");
      },
    });

    try {
      const theme = createTheme().init();
      theme.set("dark");
      mediaQueryList.dispatch(true);
      mediaQueryList.dispatch(false);
      expect(theme.name).toBe("dark");

      theme.clearPreference();
      mediaQueryList.dispatch(true);
      expect(theme.name).toBe("dark");
      mediaQueryList.dispatch(false);
      expect(theme.name).toBe("light");
    } finally {
      restore();
    }
  });

  it("should log each kind of storage failure once per manager", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const restore = replaceLocalStorage({
      get: () => {
        throw new Error("blocked");
      },
    });

    try {
      const theme = createTheme().init();
      for (let attempt = 0; attempt < 3; attempt++) {
        void theme.preference;
        theme.set("dark");
        theme.clearPreference();
      }

      expect(consoleErrorSpy.mock.calls.map(([message]) => message)).toEqual([
        "[theme] Failed to read from localStorage:",
        "[theme] Failed to write to localStorage:",
        "[theme] Failed to remove from localStorage:",
      ]);
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

  it("should stop delivering a change once a listener starts a newer one", () => {
    const theme = createTheme().init();
    const seen: string[] = [];
    const eventListener = (event: Event): void => {
      seen.push(`event:${(event as ThemeChangeEvent).detail.name}`);
    };
    theme.subscribe(({ name }) => {
      if (name === "dark") {
        theme.set("light");
      }
    });
    theme.subscribe(({ name }) => seen.push(name));
    window.addEventListener(THEME_CHANGE_EVENT, eventListener);

    theme.set("dark");
    window.removeEventListener(THEME_CHANGE_EVENT, eventListener);

    expect(theme.name).toBe("light");
    expect(seen).toEqual(["light", "event:light"]);
  });

  it("should stop delivering a themechange event once a window listener starts a newer change", () => {
    const theme = createTheme().init();
    const seen: string[] = [];
    const changeOnDark = (event: Event): void => {
      if ((event as ThemeChangeEvent).detail.name === "dark") {
        theme.set("light");
      }
    };
    const record = (event: Event): void => {
      seen.push((event as ThemeChangeEvent).detail.name);
    };
    window.addEventListener(THEME_CHANGE_EVENT, changeOnDark);
    window.addEventListener(THEME_CHANGE_EVENT, record);

    try {
      theme.set("dark");
    } finally {
      window.removeEventListener(THEME_CHANGE_EVENT, changeOnDark);
      window.removeEventListener(THEME_CHANGE_EVENT, record);
    }

    expect(theme.name).toBe("light");
    expect(seen).toEqual(["light"]);
  });

  it("should not dispatch themechange for a change whose subscriber destroyed the manager", () => {
    const theme = createTheme().init();
    const eventListener = vi.fn();
    theme.subscribe(() => theme.destroy());
    window.addEventListener(THEME_CHANGE_EVENT, eventListener);

    try {
      theme.set("dark");
    } finally {
      window.removeEventListener(THEME_CHANGE_EVENT, eventListener);
    }

    expect(eventListener).not.toHaveBeenCalled();
  });

  it("should stop delivering a themechange event once a window listener destroys the manager", () => {
    const theme = createTheme().init();
    const destroy = (): void => theme.destroy();
    const record = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, destroy);
    window.addEventListener(THEME_CHANGE_EVENT, record);

    try {
      theme.set("dark");
    } finally {
      window.removeEventListener(THEME_CHANGE_EVENT, destroy);
      window.removeEventListener(THEME_CHANGE_EVENT, record);
    }

    expect(record).not.toHaveBeenCalled();
  });

  it("should not deliver a change to a listener subscribed during its delivery", () => {
    const theme = createTheme().init();
    const late = vi.fn();
    theme.subscribe(() => {
      theme.subscribe(late);
    });

    theme.set("dark");
    expect(late).not.toHaveBeenCalled();

    theme.set("light");
    expect(late).toHaveBeenCalledWith(expect.objectContaining({ name: "light" }));
  });

  it("should not deliver a change to a listener unsubscribed during its delivery", () => {
    const theme = createTheme().init();
    const later = vi.fn();
    let unsubscribeLater = (): void => {};
    theme.subscribe(() => unsubscribeLater());
    unsubscribeLater = theme.subscribe(later);

    theme.set("dark");

    expect(later).not.toHaveBeenCalled();
  });

  it("should build the themechange event with the window's CustomEvent", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    class WindowCustomEvent<T> extends CustomEvent<T> {}
    const dispatchEvent = vi.fn((_event: Event) => true);
    vi.stubGlobal(
      "window",
      Object.create(window, { CustomEvent: { value: WindowCustomEvent }, dispatchEvent: { value: dispatchEvent } }),
    );

    try {
      expect(() => createTheme().set("dark")).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(dispatchEvent.mock.calls[0]?.[0]).toBeInstanceOf(WindowCustomEvent);
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
  it("should follow OS changes again after another tab clears the preference", () => {
    const mediaQueryList = createMatchMedia(false);
    const theme = createTheme().init();
    theme.set("dark");

    window.localStorage.removeItem("app-theme-preference");
    dispatchStorage({ key: "app-theme-preference", oldValue: "dark", newValue: null });
    mediaQueryList.dispatch(true);
    mediaQueryList.dispatch(false);

    expect(theme.name).toBe("light");
  });

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

  it("should ignore sessionStorage events", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const theme = createTheme().init();
    theme.set("dark");
    const listener = vi.fn();
    theme.subscribe(listener);

    // As a same-origin frame calling sessionStorage.clear() fires it.
    dispatchStorage({ key: null, newValue: null, storageArea: window.sessionStorage });
    dispatchStorage({ key: "app-theme-preference", newValue: null, storageArea: window.sessionStorage });

    expect(theme.name).toBe("dark");
    expect(listener).not.toHaveBeenCalled();
  });

  it("should apply localStorage events that name their storage area", () => {
    const theme = createTheme().init();

    window.localStorage.setItem("app-theme-preference", "dark");
    dispatchStorage({ key: "app-theme-preference", newValue: "dark", storageArea: window.localStorage });

    expect(theme.name).toBe("dark");
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
  it("should reject token values that are not strings or numbers", () => {
    expect(() =>
      createTheme({
        themes: { light: { colorScheme: "light", tokens: { primary: {} as never } }, dark: { colorScheme: "dark" } },
        tokenSchema,
      }),
    ).toThrow('Theme "light" token "primary" must be a string or a finite number.');
    expect(() => createTheme({ tokenSchema }).setTokens({ primary: null as never })).toThrow(
      'Runtime token "primary" must be a string or a finite number.',
    );
  });

  it("should reject token values that are not finite numbers", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createTheme({ tokenSchema }).setTokens({ primary: value as never })).toThrow(
        'Runtime token "primary" must be a string or a finite number.',
      );
    }
  });

  it("should treat an undefined runtime token as omitted", () => {
    const theme = createTheme({ themes: tokenThemes, tokenSchema }).init();

    expect(theme.setTokens({ primary: undefined }).tokens.primary).toBe("blue");
    expect(root.style.getPropertyValue("--color-primary")).toBe("blue");
  });

  it("should treat an empty-string token as omitted", () => {
    const theme = createTheme({
      themes: { light: { colorScheme: "light", tokens: { primary: "blue", bg: "" } }, dark: { colorScheme: "dark" } },
      tokenSchema,
    }).init();

    expect(Object.hasOwn(theme.get().tokens, "bg")).toBe(false);
    theme.setTokens({ primary: "red" });
    expect(theme.setTokens({ primary: "" }).tokens.primary).toBe("blue");
    expect(root.style.getPropertyValue("--color-primary")).toBe("blue");
    expect(theme.getPrePaintScript()).not.toContain("--color-bg");
  });

  it("should write number token values as strings", () => {
    const theme = createTheme({
      themes: { light: { colorScheme: "light", tokens: { primary: 4 as never } }, dark: { colorScheme: "dark" } },
      tokenSchema,
    }).init();

    expect(theme.get().tokens.primary).toBe("4");
    expect(theme.setTokens({ bg: 0 as never }).tokens.bg).toBe("0");
    expect(root.style.getPropertyValue("--color-bg")).toBe("0");
  });

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

  it("should only record runtime overrides set before a theme is applied", () => {
    window.localStorage.setItem("app-theme-preference", "dark");
    // As the pre-paint script leaves the page.
    root.setAttribute("data-theme", "dark");
    const theme = createTheme({ tokenSchema });
    const sources: string[] = [];
    theme.subscribe(({ name, source }) => sources.push(`${name}/${source}`));

    expect(theme.setTokens({ primary: "orange" }).tokens).toEqual({ primary: "orange" });
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.style.getPropertyValue("--color-primary")).toBe("");
    expect(sources).toEqual([]);

    theme.init();
    expect(root.style.getPropertyValue("--color-primary")).toBe("orange");
    expect(sources).toEqual(["dark/init"]);
  });

  it("should apply runtime overrides set after set() runs before init()", () => {
    const theme = createTheme({ tokenSchema });
    theme.set("dark");

    theme.setTokens({ primary: "orange" });

    expect(root.style.getPropertyValue("--color-primary")).toBe("orange");
  });

  it("should only record runtime overrides set after destroy() until a theme is applied again", () => {
    const theme = createTheme({ tokenSchema }).init();
    theme.destroy();

    theme.setTokens({ primary: "orange" });

    expect(root.style.getPropertyValue("--color-primary")).toBe("");
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

  it("should treat token names shared with Object.prototype as ordinary tokens", () => {
    const styleEl = document.createElement("style");
    styleEl.textContent = `:root { --token-constructor: red; --token-proto: blue; }`;
    document.head.append(styleEl);

    try {
      const schema = JSON.parse(
        '{"constructor":"--token-constructor","toString":"--token-to-string","__proto__":"--token-proto"}',
      ) as Record<string, string>;
      const theme = createTheme({ tokenSchema: schema }).init();

      expect(root.style.getPropertyValue("--token-constructor")).toBe("");
      expect(root.style.getPropertyValue("--token-to-string")).toBe("");

      const tokens = theme.readTokens();
      expect(Object.hasOwn(tokens, "constructor") && tokens.constructor).toBe("red");
      expect(Object.hasOwn(tokens, "toString")).toBe(false);
      expect(Object.hasOwn(tokens, "__proto__") && tokens["__proto__"]).toBe("blue");

      new Function(theme.getPrePaintScript())();
      expect(root.style.getPropertyValue("--token-constructor")).toBe("");
    } finally {
      styleEl.remove();
    }
  });

  it("should write and serialize static tokens named after Object.prototype members", () => {
    const schema = JSON.parse(
      '{"constructor":"--token-constructor","toString":"--token-to-string","__proto__":"--token-proto"}',
    ) as Record<string, string>;
    const themes = JSON.parse(
      '{"light":{"colorScheme":"light","tokens":{"constructor":"red","toString":"green","__proto__":"blue"}},"dark":{"colorScheme":"dark"}}',
    ) as Record<"light" | "dark", { colorScheme: "light" | "dark"; tokens?: Record<string, string> }>;
    const theme = createTheme({ themes, tokenSchema: schema });
    const expected = { "--token-constructor": "red", "--token-to-string": "green", "--token-proto": "blue" };

    expect(Object.hasOwn(theme.get().tokens, "__proto__")).toBe(true);
    expect(theme.get().tokens).toEqual(themes.light.tokens);

    new Function(theme.getPrePaintScript())();
    for (const [property, value] of Object.entries(expected)) {
      expect(root.style.getPropertyValue(property)).toBe(value);
    }

    root.removeAttribute("style");
    theme.init();
    for (const [property, value] of Object.entries(expected)) {
      expect(root.style.getPropertyValue(property)).toBe(value);
    }
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
