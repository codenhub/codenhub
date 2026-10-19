import { isPlainObject } from "../core/plain-object";
import { resolveConfiguredLocale } from "./configured-locale";
import { isValidLocaleIdentifier } from "./identifier";

/**
 * Configuration is checked by hand rather than with `@codenhub/validation`: inlining that library cost about 5 kB
 * minified and gzipped, most of the core and routing entrypoints, to check a few properties once.
 */

const DICTIONARY_LIMIT_NAMES = ["maxDepth", "maxTranslations", "maxProperties", "maxValueLength", "maxTotalLength"];

/** A configuration problem, thrown with where it is so `assertConfig` can word it. */
class ConfigIssue extends Error {
  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

const describeType = (value: unknown): string => {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return Number.isNaN(value) ? "nan" : "infinity";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
};

const fail = (path: string, message: string): never => {
  throw new ConfigIssue(path, message);
};

const expectType = (path: string, expected: string, value: unknown): never =>
  fail(path, `Expected ${expected}, received ${describeType(value)}`);

const readObject = (path: string, value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    return fail(
      path,
      `Expected object, received ${typeof value === "object" && value !== null && !Array.isArray(value) ? "non-plain object" : describeType(value)}`,
    );
  }
  return value as Record<string, unknown>;
};

/** Reads an own property only, so a value inherited from a polluted `Object.prototype` is never taken. */
const own = (object: Record<string, unknown>, name: string): unknown =>
  Object.hasOwn(object, name) ? object[name] : undefined;

const readBoolean = (path: string, value: unknown): boolean =>
  typeof value === "boolean" ? value : expectType(path, "boolean", value);

const readFunction = (path: string, value: unknown): void => {
  if (typeof value !== "function") {
    fail(path, "Must be a function");
  }
};

/** Trimmed, non-empty, case-insensitively unique locale identifiers. */
const readLocales = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return expectType("locales", "array", value);
  }
  if (value.length === 0) {
    fail("locales", "Must contain at least 1 item");
  }

  const seen = new Set<string>();
  const locales: string[] = [];
  // An index loop, unlike `map`, visits the holes of a sparse array.
  for (let index = 0; index < value.length; index += 1) {
    const entry: unknown = value[index];
    const path = `locales[${index}]`;
    if (typeof entry !== "string") {
      return expectType(path, "string", entry);
    }
    const locale = entry.trim();
    if (locale.length === 0) {
      fail(path, "Must not be empty");
    }
    if (!isValidLocaleIdentifier(locale)) {
      fail(path, "Must be an ASCII locale identifier with alphanumeric, hyphen-separated subtags");
    }
    if (seen.has(locale.toLowerCase())) {
      fail(path, "Must be unique, ignoring letter case");
    }
    seen.add(locale.toLowerCase());
    locales.push(locale);
  }
  return locales;
};

const readDefaultLocale = (value: unknown, locales: readonly string[]): string => {
  if (typeof value !== "string") {
    return expectType("defaultLocale", "string", value);
  }
  if (resolveConfiguredLocale(locales, value) === undefined) {
    fail("defaultLocale", "Must match a configured locale");
  }
  return value;
};

const readDictionaryLimits = (value: unknown): Record<string, number> | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const limits = readObject("dictionaryLimits", value);
  const checked: Record<string, number> = {};
  // Own names, enumerable or not, and each value read once, so the value used is the value checked.
  for (const name of Object.getOwnPropertyNames(limits)) {
    if (!DICTIONARY_LIMIT_NAMES.includes(name)) {
      fail(`dictionaryLimits.${name}`, "Is not a recognized limit");
    }
    const limit = limits[name];
    if (limit === undefined) {
      continue;
    }
    if (!(Number.isSafeInteger(limit) && (limit as number) >= 1)) {
      fail(`dictionaryLimits.${name}`, "Must be a positive whole number");
    }
    checked[name] = limit as number;
  }
  return checked;
};

/** The checked configuration of an `I18n` manager, with locales trimmed. @internal */
export interface CheckedI18nConfig {
  readonly locales: string[];
  readonly loadLocale: (locale: string) => unknown;
  readonly getLocaleDirection: (locale: string) => unknown;
  readonly defaultLocale: string;
  readonly isSilent?: boolean;
  readonly dictionaryLimits?: Record<string, number>;
}

/** The checked configuration of locale routing, with locales trimmed. @internal */
export interface CheckedLocaleRoutingConfig {
  readonly locales: string[];
  readonly defaultLocale: string;
  readonly prefixDefaultLocale: boolean;
}

/**
 * Checks the configuration of an `I18n` manager: the locales, the default locale, the loader and direction
 * callbacks, the optional silent flag, and the optional dictionary limits. Only own properties are read.
 *
 * @internal
 */
export const i18nConfig = (input: unknown): CheckedI18nConfig => {
  const config = readObject("", input);
  const locales = readLocales(own(config, "locales"));
  const defaultLocale = readDefaultLocale(own(config, "defaultLocale"), locales);
  const loadLocale = own(config, "loadLocale");
  readFunction("loadLocale", loadLocale);
  const getLocaleDirection = own(config, "getLocaleDirection");
  readFunction("getLocaleDirection", getLocaleDirection);
  const isSilent = own(config, "isSilent");

  return {
    locales,
    defaultLocale,
    loadLocale: loadLocale as CheckedI18nConfig["loadLocale"],
    getLocaleDirection: getLocaleDirection as CheckedI18nConfig["getLocaleDirection"],
    isSilent: isSilent === undefined ? undefined : readBoolean("isSilent", isSilent),
    dictionaryLimits: readDictionaryLimits(own(config, "dictionaryLimits")),
  };
};

/**
 * Checks the configuration of locale routing: the locales, the default locale and the default-prefix policy.
 *
 * @internal
 */
export const localeRoutingConfig = (input: unknown): CheckedLocaleRoutingConfig => {
  const config = readObject("", input);
  const locales = readLocales(own(config, "locales"));

  return {
    locales,
    defaultLocale: readDefaultLocale(own(config, "defaultLocale"), locales),
    prefixDefaultLocale: readBoolean("prefixDefaultLocale", own(config, "prefixDefaultLocale")),
  };
};

/**
 * Returns the checked value, or throws a `TypeError` that names the first problem and where it is.
 *
 * @param check - What the configuration must satisfy.
 * @param input - The consumer's configuration.
 * @param subject - What was being configured, for the start of the message.
 * @returns The checked configuration, with locales trimmed.
 * @throws {TypeError} When the configuration does not satisfy the check.
 * @internal
 */
export function assertConfig<T>(check: (input: unknown) => T, input: unknown, subject: string): T {
  try {
    return check(input);
  } catch (error) {
    if (!(error instanceof ConfigIssue)) {
      throw error;
    }
    const where = error.path.length > 0 ? `${error.path}: ` : "";
    throw new TypeError(`${subject}: ${where}${error.message}`);
  }
}
