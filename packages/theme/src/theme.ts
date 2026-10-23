import { getThemeClass } from "./class-resolver";
import { applyTheme, emitThemeEvent, readComputedTokens, removeAppliedTheme } from "./dom";
import { resolveOptions } from "./options";
import { buildPrePaintScript } from "./pre-paint";
import { readStorage, removeStorage, writeStorage } from "./storage";
import { readSystemTheme, registerStorageListener, registerSystemListener } from "./system";
import type { ActiveTheme, Theme, ThemeChangeListener, ThemeChangeSource, ThemeOptions } from "./types";
import { assertRuntimeTokens } from "./validation";

/**
 * Creates a theme preference manager. Nothing touches the DOM, storage, or listeners until a method is called.
 *
 * @example
 * ```ts
 * const theme = createTheme({
 *   themes: {
 *     light: { colorScheme: "light", tokens: { primary: "#171717" } },
 *     dark: { colorScheme: "dark", tokens: { primary: "#f9fafb" } },
 *   },
 *   tokenSchema: { primary: "--color-primary" },
 *   darkClass: true,
 * }).init();
 *
 * document.querySelector("#theme-toggle")?.addEventListener("click", theme.toggle);
 * ```
 *
 * @typeParam TName - Names of every configured theme, inferred from the keys of `options.themes`.
 * @typeParam TSchema - Token schema, inferred from `options.tokenSchema`.
 * @param options - Themes, persistence key, DOM attribute and classes, system mapping, and token schema.
 * @returns A {@link Theme} whose methods are bound to it.
 * @throws {Error} When the options are invalid: a `themes`, `systemTheme`, `tokenSchema`, or theme `tokens` value that
 *   is set but is not a plain, non-array object, an empty theme name or, while `className` is `true`, a class-unsafe
 *   one, an invalid `colorScheme`, a `defaultTheme`, `systemTheme`, or `pairedTheme` naming an unconfigured theme,
 *   theme tokens outside `tokenSchema`, a `tokenSchema` value not starting with `--`, a `className` that is neither a
 *   boolean nor a function, a non-boolean `darkClass`, or an empty or invalid `attribute` or `storageKey`. An option
 *   set to `undefined` is treated as omitted.
 */
export function createTheme<
  TName extends string = "light" | "dark",
  TSchema extends Record<string, string> = Record<string, string>,
>(options: ThemeOptions<TName, TSchema> = {}): Theme<TName, TSchema> {
  const config = resolveOptions(options);
  const listeners = new Set<ThemeChangeListener<TName, TSchema>>();
  let activeName = config.defaultTheme;
  const noTokens: Readonly<Partial<Record<keyof TSchema, string>>> = Object.freeze({});
  let runtimeTokens = noTokens;
  let snapshot: ActiveTheme<TName, TSchema> | null = null;
  // Resolved on first use, so a custom resolver never runs during construction.
  let classes: Map<TName, string | null> | null = null;
  let stopListening: (() => void) | null = null;

  const getClasses = (): Map<TName, string | null> => {
    if (classes === null) {
      const resolved = new Map<TName, string | null>();
      for (const [name, definition] of config.themes) {
        resolved.set(name, getThemeClass(definition, config.className));
      }
      classes = resolved;
    }
    return classes;
  };

  const getClassList = (): string[] =>
    Array.from(getClasses().values()).filter((className): className is string => className !== null);

  const getDefinition = (name: TName): ActiveTheme<TName, TSchema> => {
    const definition = config.themes.get(name);
    if (definition === undefined) {
      throw new Error(`Theme is not configured: ${String(name)}.`);
    }
    return definition;
  };

  const readPreference = (): TName | null => readStorage(config.storageKey, config.themes);

  const readSystem = (): TName => readSystemTheme(config);

  const get = (): ActiveTheme<TName, TSchema> => {
    if (snapshot === null) {
      const definition = getDefinition(activeName);
      snapshot = Object.freeze({
        ...definition,
        tokens: Object.freeze({ ...definition.tokens, ...runtimeTokens }),
      });
    }
    return snapshot;
  };

  const apply = (source: ThemeChangeSource): ActiveTheme<TName, TSchema> => {
    snapshot = null;
    const active = get();
    applyTheme({
      theme: active,
      options: config,
      classes: getClassList(),
      nextClass: getClasses().get(active.name) ?? null,
    });

    const detail = { name: active.name, theme: active, source };
    for (const listener of listeners) {
      try {
        listener(detail);
      } catch (error) {
        console.error("[theme] Error in theme change listener:", error);
      }
    }
    emitThemeEvent(detail);

    return active;
  };

  const activate = (name: TName, source: ThemeChangeSource, shouldStore: boolean): ActiveTheme<TName, TSchema> => {
    const { name: nextName } = getDefinition(name);
    // Resolved before any state changes, so a throwing class resolver leaves state, storage, and the DOM as they were.
    getClasses();
    activeName = nextName;
    if (shouldStore) {
      writeStorage(config.storageKey, activeName);
    }
    return apply(source);
  };

  const handleSystemChange = (event: MediaQueryListEvent): void => {
    if (readPreference() !== null) {
      return;
    }
    const name = event.matches ? config.systemTheme.dark : config.systemTheme.light;
    if (name !== activeName) {
      activate(name, "system", false);
    }
  };

  const handleStorageChange = (event: StorageEvent): void => {
    // A null key means another tab called localStorage.clear(), which also removes the preference.
    if (event.key !== null && event.key !== config.storageKey) {
      return;
    }
    activate(readPreference() ?? readSystem(), "storage", false);
  };

  const theme: Theme<TName, TSchema> = {
    get name() {
      return activeName;
    },
    get preference() {
      return readPreference();
    },
    get system() {
      return readSystem();
    },
    init() {
      if (stopListening === null) {
        getClasses();
        const stopSystem = registerSystemListener(handleSystemChange);
        const stopStorage = registerStorageListener(handleStorageChange);
        stopListening = () => {
          stopSystem();
          stopStorage();
        };
        activate(readPreference() ?? readSystem(), "init", false);
      }
      return theme;
    },
    get,
    set(name) {
      return activate(name, "set", true);
    },
    toggle() {
      const current = getDefinition(activeName);
      const next =
        current.pairedTheme ?? (current.colorScheme === "dark" ? config.systemTheme.light : config.systemTheme.dark);
      return activate(next, "toggle", true);
    },
    clearPreference() {
      getClasses();
      removeStorage(config.storageKey);
      return activate(readSystem(), "clearPreference", false);
    },
    setTokens(tokens) {
      assertRuntimeTokens(tokens, config.tokenSchema);
      getClasses();
      runtimeTokens = Object.freeze({ ...tokens });
      return apply("setTokens");
    },
    readTokens() {
      const known = get().tokens;
      return { ...readComputedTokens(config.tokenSchema, known), ...known };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getPrePaintScript() {
      return buildPrePaintScript(config, getClasses());
    },
    destroy(destroyOptions) {
      if (destroyOptions?.revertDom) {
        removeAppliedTheme({ options: config, classes: getClassList() });
      }
      stopListening?.();
      stopListening = null;
      listeners.clear();
      runtimeTokens = noTokens;
      activeName = config.defaultTheme;
      snapshot = null;
      classes = null;
    },
  };

  return theme;
}
