import { getDefaultThemeClass } from "./class-resolver";

/**
 * Options as `createTheme()` receives them from JavaScript callers, after defaults are applied.
 *
 * @internal
 */
export interface UncheckedThemeOptions {
  themes: unknown;
  defaultTheme: unknown;
  systemTheme: { light?: unknown; dark?: unknown };
  storageKey: unknown;
  attribute: unknown;
  className: unknown;
  darkClass: unknown;
  tokenSchema?: unknown;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

// A custom property a stylesheet can name without escapes: "--" and then ASCII letters, digits, "-", "_", or any
// non-ASCII character. Browsers do not apply "--" alone, and a name with a space or ";" is reachable only as an
// escaped `var(--a\ b)`.
const CUSTOM_PROPERTY_NAME = /^--(?:[\w-]|[^\x00-\x7F])+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Finite numbers are accepted from JavaScript callers, such as JSON configs, and written as strings; `undefined` is
// treated as an omitted token.
const isTokenValue = (value: unknown): boolean =>
  value === undefined || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));

/**
 * Validates that `createTheme()` received an options object.
 *
 * @internal
 */
export const assertOptionsObject = (options: unknown): void => {
  if (!isRecord(options)) {
    throw new Error("Theme options must be an object.");
  }
};

/**
 * Validates theme options, throwing descriptive errors on misconfiguration.
 *
 * @internal
 */
export const assertThemeConfig = (options: UncheckedThemeOptions): void => {
  if (!isNonEmptyString(options.attribute)) {
    throw new Error("Theme attribute option must be a non-empty string.");
  }

  if (/[\s"'/>=\0]/.test(options.attribute)) {
    throw new Error("Theme attribute option must be a valid HTML attribute name.");
  }

  // Setting either to the theme name would replace every class or inline style the page put on the root element.
  // HTML lowercases attribute names, so "CLASS" is the same attribute.
  const attributeName = options.attribute.toLowerCase();
  if (attributeName === "class" || attributeName === "style") {
    throw new Error(`Theme attribute option cannot be "${attributeName}"; use the className option to apply a class.`);
  }

  if (!isNonEmptyString(options.storageKey)) {
    throw new Error("Theme storageKey option must be a non-empty string.");
  }

  if (typeof options.className !== "boolean" && typeof options.className !== "function") {
    throw new Error("Theme className option must be a boolean or a function.");
  }

  if (typeof options.darkClass !== "boolean") {
    throw new Error("Theme darkClass option must be a boolean.");
  }

  if (!isRecord(options.themes)) {
    throw new Error("Theme options.themes must be an object keyed by theme name.");
  }

  const { tokenSchema } = options;
  if (tokenSchema !== undefined) {
    if (!isRecord(tokenSchema)) {
      throw new Error("Theme tokenSchema option must be an object.");
    }
    for (const [key, value] of Object.entries(tokenSchema)) {
      if (typeof value !== "string" || !CUSTOM_PROPERTY_NAME.test(value)) {
        throw new Error(
          `Token schema key "${key}" must map to a CSS custom property name, such as "--color-primary". Received: "${String(value)}".`,
        );
      }
    }
  }

  const themes = options.themes;
  const names = Object.keys(themes);

  for (const name of names) {
    const theme = themes[name];

    if (name.trim().length === 0) {
      throw new Error("Theme names must be non-empty strings.");
    }

    if (!isRecord(theme)) {
      throw new Error(`Theme "${name}" definition must be an object.`);
    }

    if (theme.colorScheme !== "light" && theme.colorScheme !== "dark") {
      throw new Error(
        `Theme "${name}" has an invalid colorScheme: ${String(theme.colorScheme)}. Must be "light" or "dark".`,
      );
    }

    if (theme.pairedTheme !== undefined) {
      if (!isNonEmptyString(theme.pairedTheme)) {
        throw new Error(`Theme "${name}" pairedTheme must be a non-empty string.`);
      }
      if (!Object.hasOwn(themes, theme.pairedTheme)) {
        throw new Error(`Theme "${name}" references unconfigured pairedTheme: ${theme.pairedTheme}.`);
      }
    }

    if (options.className === true) {
      getDefaultThemeClass(name);
    }

    if (theme.tokens !== undefined) {
      if (!isRecord(theme.tokens)) {
        throw new Error(`Theme "${name}" tokens must be an object.`);
      }
      if (tokenSchema === undefined) {
        throw new Error(`Theme "${name}" defines tokens but no tokenSchema is configured.`);
      }
      for (const [tokenKey, tokenValue] of Object.entries(theme.tokens)) {
        if (!Object.hasOwn(tokenSchema, tokenKey)) {
          throw new Error(`Theme "${name}" defines token "${tokenKey}" which is not present in tokenSchema.`);
        }
        if (!isTokenValue(tokenValue)) {
          throw new Error(`Theme "${name}" token "${tokenKey}" must be a string or a finite number.`);
        }
      }
    }
  }

  const isConfigured = (name: unknown): boolean => typeof name === "string" && Object.hasOwn(themes, name);

  if (!isConfigured(options.defaultTheme)) {
    throw new Error(`Default theme is not configured: ${String(options.defaultTheme)}.`);
  }

  if (!isConfigured(options.systemTheme.light)) {
    throw new Error(`System light theme is not configured: ${String(options.systemTheme.light)}.`);
  }

  if (!isConfigured(options.systemTheme.dark)) {
    throw new Error(`System dark theme is not configured: ${String(options.systemTheme.dark)}.`);
  }
};

/**
 * Validates the `systemTheme` option before it is merged over its default, where a non-object would vanish.
 *
 * @internal
 */
export const assertSystemThemeOption = (systemTheme: unknown): void => {
  if (systemTheme !== undefined && !isRecord(systemTheme)) {
    throw new Error("Theme systemTheme option must be an object with light and dark theme names.");
  }
};

/**
 * Validates runtime token overrides against the configured token schema.
 *
 * @internal
 */
export const assertRuntimeTokens = (tokens: unknown, tokenSchema: Record<string, string> | undefined): void => {
  if (!isRecord(tokens)) {
    throw new Error("Runtime tokens must be an object.");
  }
  if (tokenSchema === undefined) {
    throw new Error("Runtime tokens provided but no tokenSchema is configured.");
  }
  for (const [tokenKey, tokenValue] of Object.entries(tokens)) {
    if (!Object.hasOwn(tokenSchema, tokenKey)) {
      throw new Error(`Runtime token override "${tokenKey}" is not present in tokenSchema.`);
    }
    if (!isTokenValue(tokenValue)) {
      throw new Error(`Runtime token "${tokenKey}" must be a string or a finite number.`);
    }
  }
};
