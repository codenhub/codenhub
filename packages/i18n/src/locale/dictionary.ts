import type { LocaleDictionary } from "../core/types";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_DICTIONARY_DEPTH = 100;
const MAX_TRANSLATIONS = 10_000;
const MAX_FLATTENED_KEY_LENGTH = 1_000;

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidKey = (key: string): boolean =>
  key.split(".").every((segment) => {
    const normalizedSegment = segment.trim();
    return segment === normalizedSegment && normalizedSegment.length > 0 && !DANGEROUS_KEYS.has(normalizedSegment);
  });

/**
 * Validates and flattens an unknown locale payload into an immutable dictionary.
 *
 * @param input - Flat or nested object with at most 100 levels of nesting, 10,000 translations,
 * and 1,000 characters per flattened key.
 * @returns A frozen, null-prototype dictionary with dot-separated keys.
 * @throws {TypeError} When the payload cannot safely represent translations or exceeds a resource limit.
 * @internal
 */
export function normalizeDictionary(input: unknown): LocaleDictionary {
  if (!isObject(input)) {
    throw new TypeError("[I18n] A locale dictionary must be a non-null object.");
  }

  const dictionary = Object.create(null) as Record<string, string>;
  const ancestors = new WeakSet<object>();
  let translationCount = 0;

  const visit = (value: object, prefix = "", depth = 0): void => {
    if (depth > MAX_DICTIONARY_DEPTH) {
      throw new TypeError(`[I18n] A locale dictionary must not exceed ${MAX_DICTIONARY_DEPTH} levels of nesting.`);
    }

    if (ancestors.has(value)) {
      throw new TypeError("[I18n] A locale dictionary must not contain cycles.");
    }

    ancestors.add(value);

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") {
        throw new TypeError("[I18n] A locale dictionary must not contain symbol keys.");
      }

      if (!isValidKey(key)) {
        throw new TypeError(`[I18n] Invalid locale dictionary key "${key}".`);
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (descriptor === undefined || "get" in descriptor || "set" in descriptor) {
        throw new TypeError("[I18n] A locale dictionary must not contain accessors.");
      }

      const flattenedKey = prefix.length === 0 ? key : `${prefix}.${key}`;
      const nestedValue = descriptor.value;

      if (flattenedKey.length > MAX_FLATTENED_KEY_LENGTH) {
        throw new TypeError(
          `[I18n] Locale dictionary flattened keys must not exceed ${MAX_FLATTENED_KEY_LENGTH} characters.`,
        );
      }

      if (typeof nestedValue === "string") {
        if (Object.hasOwn(dictionary, flattenedKey)) {
          throw new TypeError(`[I18n] Locale dictionary key collision at "${flattenedKey}".`);
        }

        translationCount += 1;

        if (translationCount > MAX_TRANSLATIONS) {
          throw new TypeError(`[I18n] A locale dictionary must not exceed ${MAX_TRANSLATIONS} translations.`);
        }

        dictionary[flattenedKey] = nestedValue;
      } else if (isObject(nestedValue)) {
        visit(nestedValue, flattenedKey, depth + 1);
      } else {
        throw new TypeError(`[I18n] Locale dictionary value at "${flattenedKey}" must be a string.`);
      }
    }

    ancestors.delete(value);
  };

  visit(input);

  if (Object.keys(dictionary).length === 0) {
    throw new TypeError("[I18n] A locale dictionary must contain at least one translation.");
  }

  return Object.freeze(dictionary);
}
