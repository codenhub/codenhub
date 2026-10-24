/**
 * Token values keyed by `tokenSchema` names, or `never` when no `tokenSchema` is configured, since any token then throws.
 *
 * @internal
 */
type TokenValues<TSchema extends Record<string, string>> = [keyof TSchema] extends [never]
  ? never
  : Partial<Record<keyof TSchema, string>>;

/**
 * Configured theme, keyed by its name in {@link ThemeOptions.themes}.
 *
 * @typeParam TName - Names of every configured theme, used to type `pairedTheme`.
 * @typeParam TSchema - Token schema from {@link ThemeOptions.tokenSchema}, used to type `tokens`.
 */
export interface ThemeDefinition<
  TName extends string = string,
  TSchema extends Record<string, string> = Record<string, string>,
> {
  /** Browser color scheme applied to `document.documentElement.style.colorScheme`; also decides what `toggle()` falls back to and whether `darkClass` applies. */
  colorScheme: "light" | "dark";
  /**
   * Static token values written to the CSS custom properties named by `tokenSchema`, which they require. A number from
   * JavaScript is written as a string, and an empty string counts as omitted.
   */
  tokens?: TokenValues<TSchema>;
  /** Theme activated when calling `toggle()` from this theme, instead of the opposite `systemTheme` entry. */
  pairedTheme?: TName;
}

/**
 * Frozen view of a configured theme with its name and its static and runtime token values.
 *
 * @typeParam TName - Names of every configured theme.
 * @typeParam TSchema - Token schema from {@link ThemeOptions.tokenSchema}.
 */
export interface ActiveTheme<
  TName extends string = string,
  TSchema extends Record<string, string> = Record<string, string>,
> {
  /** Configured theme name. */
  readonly name: TName;
  /** Browser color scheme of the theme. */
  readonly colorScheme: "light" | "dark";
  /**
   * Static theme tokens merged with the runtime overrides from `setTokens()`, which win.
   * Tokens defined only in CSS are not included; read them with `readTokens()`.
   */
  readonly tokens: Readonly<Partial<Record<keyof TSchema, string>>>;
  /** Theme activated when calling `toggle()` from this theme, when configured. */
  readonly pairedTheme?: TName;
}

/**
 * Mapping from OS color-scheme preferences to configured theme names.
 *
 * @typeParam TName - Names of every configured theme.
 */
export interface SystemThemeMap<TName extends string = string> {
  /** Theme used when the OS preference is light, and the one `toggle()` selects from a dark theme without `pairedTheme`. */
  light: TName;
  /** Theme used when the OS preference is dark, and the one `toggle()` selects from a light theme without `pairedTheme`. */
  dark: TName;
}

/**
 * Returns the single DOM class token applied to `document.documentElement` for a theme.
 *
 * @typeParam TName - Names of every configured theme.
 * @typeParam TSchema - Token schema from {@link ThemeOptions.tokenSchema}.
 * @param theme - The configured theme, with its static tokens only.
 * @returns A non-empty class name without whitespace. Any other value makes the calling theme operation throw.
 */
export type ThemeClassResolver<
  TName extends string = string,
  TSchema extends Record<string, string> = Record<string, string>,
> = (theme: ActiveTheme<TName, TSchema>) => string;

/**
 * Reason a theme change notification was emitted: the `Theme` method that caused it, `"system"` for an
 * OS color-scheme change, or `"storage"` for a preference change made in another tab.
 */
export type ThemeChangeSource = "init" | "set" | "toggle" | "clearPreference" | "setTokens" | "system" | "storage";

/**
 * Payload passed to subscribers and the browser `themechange` event after a theme change.
 *
 * @typeParam TName - Names of every configured theme.
 * @typeParam TSchema - Token schema from {@link ThemeOptions.tokenSchema}.
 */
export interface ThemeChangeDetail<
  TName extends string = string,
  TSchema extends Record<string, string> = Record<string, string>,
> {
  /** Active theme name after the change. */
  name: TName;
  /** Active theme after the change; the same object `get()` returns until the next change. */
  theme: ActiveTheme<TName, TSchema>;
  /** Operation or browser signal that caused the change notification. */
  source: ThemeChangeSource;
}

/**
 * Browser event dispatched on `window` under the `THEME_CHANGE_EVENT` name after a theme change, such as
 * `window.addEventListener(THEME_CHANGE_EVENT, (event) => (event as ThemeChangeEvent).detail)`.
 *
 * @typeParam TName - Names of every configured theme.
 * @typeParam TSchema - Token schema from {@link ThemeOptions.tokenSchema}.
 */
export type ThemeChangeEvent<
  TName extends string = string,
  TSchema extends Record<string, string> = Record<string, string>,
> = CustomEvent<ThemeChangeDetail<TName, TSchema>>;

/**
 * Callback registered with `Theme.subscribe()`, called after every applied change.
 *
 * @typeParam TName - Names of every configured theme.
 * @typeParam TSchema - Token schema from {@link ThemeOptions.tokenSchema}.
 * @param detail - The applied change.
 */
export type ThemeChangeListener<
  TName extends string = string,
  TSchema extends Record<string, string> = Record<string, string>,
> = (detail: ThemeChangeDetail<TName, TSchema>) => void;

/**
 * Configuration for theme definitions, persistence, DOM application, and system preference mapping. An option set
 * to `undefined` uses its default, as an omitted one does.
 *
 * @typeParam TName - Names of every configured theme, inferred from the keys of `themes`.
 * @typeParam TSchema - Token schema, inferred from `tokenSchema`.
 */
export interface ThemeOptions<
  TName extends string = string,
  TSchema extends Record<string, string> = Record<string, string>,
> {
  /**
   * Available themes keyed by name. Replaces the built-in list entirely. Names must be non-empty and, while
   * `className` is `true`, usable in a class name.
   *
   * @defaultValue `{ light: { colorScheme: "light" }, dark: { colorScheme: "dark" } }`
   */
  themes?: { readonly [K in TName]: ThemeDefinition<NoInfer<TName>, NoInfer<TSchema>> };
  /**
   * Theme used before initialization and when `matchMedia` is unavailable.
   *
   * @defaultValue `"light"`
   */
  defaultTheme?: NoInfer<TName>;
  /**
   * Themes selected for OS light and dark color-scheme preferences.
   *
   * @defaultValue `{ light: "light", dark: "dark" }`
   */
  systemTheme?: SystemThemeMap<NoInfer<TName>>;
  /**
   * `localStorage` key used for the explicit user preference.
   *
   * @defaultValue `"app-theme-preference"`
   */
  storageKey?: string;
  /**
   * Attribute set on `document.documentElement` to the active theme name. It cannot be `class` or `style`, in any letter case, which
   * would replace the page's own classes or inline styles; use `className` to apply a class.
   *
   * @defaultValue `"data-theme"`
   */
  attribute?: string;
  /**
   * Whether to add a `dark` class to `document.documentElement` while a theme with `colorScheme: "dark"` is active,
   * as Tailwind CSS's class-based `dark:` variant expects.
   *
   * @defaultValue `false`
   */
  darkClass?: boolean;
  /**
   * Class applied to `document.documentElement` for the active theme: `true` applies `theme-<name>`, `false` applies
   * none, and a {@link ThemeClassResolver} returns a custom one.
   *
   * @defaultValue `true`
   */
  className?: boolean | ThemeClassResolver<NoInfer<TName>, NoInfer<TSchema>>;
  /**
   * Maps token names to the CSS custom properties they are written to, such as `{ primary: "--color-primary" }`. Each
   * property is `--` followed by ASCII letters, digits, `-`, `_`, or non-ASCII characters, so a stylesheet can name it
   * without escapes.
   */
  tokenSchema?: TSchema;
}

/**
 * Theme preference manager returned by `createTheme()`. Methods are bound, so they can be passed as callbacks.
 *
 * @remarks
 * Every member is safe to use without browser APIs: storage, DOM, and listener work is skipped, and the system
 * theme falls back to `defaultTheme`.
 *
 * @typeParam TName - Names of every configured theme.
 * @typeParam TSchema - Token schema from {@link ThemeOptions.tokenSchema}.
 */
export interface Theme<TName extends string = string, TSchema extends Record<string, string> = Record<string, string>> {
  /** Active theme name. `defaultTheme` until `init()` or another change runs. */
  readonly name: TName;
  /** Explicit preference stored in `localStorage`, or `null` when none is stored, the stored name is not configured, or storage is unavailable. */
  readonly preference: TName | null;
  /** Theme matching the current OS color-scheme preference, or `defaultTheme` when `matchMedia` is unavailable. */
  readonly system: TName;

  /**
   * Applies the stored preference, or the system theme when there is none, and starts following OS
   * color-scheme changes and preference changes from other tabs. Calling it again does nothing until `destroy()`.
   *
   * @returns This manager.
   * @throws {Error} When a `className` resolver returns an empty or whitespace-containing class.
   */
  init(): Theme<TName, TSchema>;

  /**
   * Returns the active theme without reading the DOM.
   *
   * @returns The same frozen object on every call until the next change, so it can serve as a store snapshot.
   */
  get(): ActiveTheme<TName, TSchema>;

  /**
   * Activates a theme and stores it as the explicit preference.
   *
   * @param name - Configured theme name.
   * @returns The activated theme.
   * @throws {Error} When `name` is not a configured theme, or a `className` resolver returns an invalid class.
   */
  set(name: TName): ActiveTheme<TName, TSchema>;

  /**
   * Activates the active theme's `pairedTheme`, or else the `systemTheme` entry for the opposite color scheme, and
   * stores it as the explicit preference.
   *
   * @returns The activated theme.
   * @throws {Error} When a `className` resolver returns an invalid class.
   */
  toggle(): ActiveTheme<TName, TSchema>;

  /**
   * Removes the explicit preference and activates the system theme, which then follows OS changes again.
   *
   * @returns The activated theme.
   * @throws {Error} When a `className` resolver returns an invalid class.
   */
  clearPreference(): ActiveTheme<TName, TSchema>;

  /**
   * Replaces the runtime token overrides, which win over every theme's static tokens until replaced again. Pass
   * `{}` to remove them. Overrides are not stored and are not part of the pre-paint script.
   *
   * @param tokens - Token values keyed by `tokenSchema` names.
   * @returns The active theme with the new overrides.
   * @throws {Error} When `tokens` is not an object, no `tokenSchema` is configured, a key is not in `tokenSchema`, or a
   *   value is not a string, a finite number, or `undefined`. An `undefined` or empty value counts as omitted.
   */
  setTokens(tokens: TokenValues<TSchema>): ActiveTheme<TName, TSchema>;

  /**
   * Reads every `tokenSchema` token: the values in `get().tokens`, completed with the computed CSS values of
   * `document.documentElement` for tokens defined only in CSS.
   *
   * @remarks
   * Reading computed styles can force a synchronous layout. Prefer `get().tokens` when CSS-only tokens are not needed.
   *
   * @returns Token values at the time of the call. Tokens with no value anywhere are omitted, and computed values
   * are omitted without browser APIs or when reading them fails, which is logged with `console.error`.
   */
  readTokens(): Partial<Record<keyof TSchema, string>>;

  /**
   * Registers a listener called after every applied change. A listener that throws is logged with
   * `console.error` and does not stop the others. When a listener or a `themechange` listener makes another change,
   * the listeners after it receive only that newer change.
   *
   * @param listener - Callback receiving the change.
   * @returns A function that removes the listener.
   */
  subscribe(listener: ThemeChangeListener<TName, TSchema>): () => void;

  /**
   * Returns an inline script that applies the stored or system theme, its class, and its static tokens before the
   * first paint, preventing a theme flash. Runtime overrides from `setTokens()` are not included.
   *
   * @returns Minified JavaScript, safe to place inside an inline `<script>` element.
   * @throws {Error} When a `className` resolver returns an invalid class.
   */
  getPrePaintScript(): string;

  /**
   * Stops following OS and cross-tab changes, removes every listener and runtime override, and resets `name` to
   * `defaultTheme`, so `init()` can run again. The DOM and stored preference stay as they are unless `revertDom` is set.
   *
   * @param options - Set `revertDom: true` to also remove the attribute, classes, `color-scheme`, and custom
   * properties this manager writes to `document.documentElement`.
   */
  destroy(options?: { revertDom?: boolean }): void;
}
