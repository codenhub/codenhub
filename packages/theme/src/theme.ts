import { getThemeClass } from "./class-resolver";
import { applyTheme, createThemeEvent, readComputedTokens, removeAppliedTheme } from "./dom";
import { resolveOptions, toTokenValues } from "./options";
import { buildPrePaintScript } from "./pre-paint";
import { createPreferenceStorage } from "./storage";
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
 * @throws {Error} When the options are invalid: an `options` value that is not an object, a `themes`, `systemTheme`,
 *   `tokenSchema`, or theme `tokens` value that is set but is not a plain, non-array object, an empty theme name or, while `className` is `true`, a class-unsafe
 *   one, an invalid `colorScheme`, a `defaultTheme`, `systemTheme`, or `pairedTheme` naming an unconfigured theme,
 *   theme tokens outside `tokenSchema` or whose value is not a string, a finite number, or `undefined`, a `tokenSchema` value that is not a custom property name such as `--color-primary` or that another key already maps to, a `className` that is neither a
 *   boolean nor a function, a non-boolean `darkClass`, an empty or invalid `attribute` or `storageKey`, or an `attribute` of `class` or `style`. An option
 *   set to `undefined` is treated as omitted.
 */
export function createTheme<
  TName extends string = "light" | "dark",
  // No keys without a tokenSchema, so the types reject tokens, which then throw.
  TSchema extends Record<string, string> = Record<never, string>,
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
  // Counts applied changes, so a change started by a listener stops delivery of the one that called it.
  let changeCount = 0;
  // The themechange event being dispatched, stopped when a window listener starts a newer change.
  let dispatchingEvent: Event | null = null;
  // Kept in memory as well as storage, so an explicit choice still wins over OS changes when storage is unavailable.
  let hasExplicitChoice = false;
  // Whether a theme has been applied since construction or destroy(); until then setTokens() only records overrides,
  // so it cannot replace the theme the pre-paint script applied with defaultTheme.
  let hasApplied = false;
  const storage = createPreferenceStorage(config.storageKey, config.themes);

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

  const readPreference = (): TName | null => storage.read();

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
    hasApplied = true;
    const active = get();
    applyTheme({
      theme: active,
      options: config,
      classes: getClassList(),
      nextClass: getClasses().get(active.name) ?? null,
    });

    const change = ++changeCount;
    dispatchingEvent?.stopImmediatePropagation();
    const detail = { name: active.name, theme: active, source };
    // A copy, so a listener subscribed during delivery receives only later changes.
    for (const listener of Array.from(listeners)) {
      if (change !== changeCount) {
        return active;
      }
      if (!listeners.has(listener)) {
        continue;
      }
      try {
        listener(detail);
      } catch (error) {
        console.error("[theme] Error in theme change listener:", error);
      }
    }
    const event = change === changeCount ? createThemeEvent(detail) : null;
    if (event !== null) {
      const previousEvent = dispatchingEvent;
      dispatchingEvent = event;
      try {
        window.dispatchEvent(event);
      } finally {
        dispatchingEvent = previousEvent;
      }
    }

    return active;
  };

  const activate = (name: TName, source: ThemeChangeSource, shouldStore: boolean): ActiveTheme<TName, TSchema> => {
    const { name: nextName } = getDefinition(name);
    // Resolved before any state changes, so a throwing class resolver leaves state, storage, and the DOM as they were.
    getClasses();
    activeName = nextName;
    if (shouldStore) {
      hasExplicitChoice = true;
      storage.write(activeName);
    }
    return apply(source);
  };

  const handleSystemChange = (event: MediaQueryListEvent): void => {
    if (hasExplicitChoice || readPreference() !== null) {
      return;
    }
    const name = event.matches ? config.systemTheme.dark : config.systemTheme.light;
    if (name !== activeName) {
      activate(name, "system", false);
    }
  };

  const handleStorageChange = (event: StorageEvent): void => {
    if (!storage.isArea(event.storageArea)) {
      return;
    }
    // A null key means another tab called localStorage.clear(), which also removes the preference.
    if (event.key !== null && event.key !== config.storageKey) {
      return;
    }
    const preference = readPreference();
    hasExplicitChoice = preference !== null;
    activate(preference ?? readSystem(), "storage", false);
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
        // A choice made before init() stands when storage could not keep it.
        activate(readPreference() ?? (hasExplicitChoice ? activeName : readSystem()), "init", false);
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
      hasExplicitChoice = false;
      storage.remove();
      return activate(readSystem(), "clearPreference", false);
    },
    setTokens(tokens) {
      assertRuntimeTokens(tokens, config.tokenSchema);
      getClasses();
      runtimeTokens = Object.freeze(toTokenValues(tokens));
      if (!hasApplied) {
        snapshot = null;
        return get();
      }
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
      // Ends delivery of a change in progress, as a newer change would.
      changeCount++;
      dispatchingEvent?.stopImmediatePropagation();
      listeners.clear();
      runtimeTokens = noTokens;
      activeName = config.defaultTheme;
      hasExplicitChoice = false;
      hasApplied = false;
      snapshot = null;
      classes = null;
    },
  };

  return theme;
}
