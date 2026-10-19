import { hasAsciiControlCharacter } from "../core/string-validation";
import type { LocaleDictionary, LocaleDictionaryLimits } from "../core/types";

const DANGEROUS_KEY = "__proto__";
const MAX_FLATTENED_KEY_LENGTH = 1_000;

/** Every dictionary limit, resolved. @internal */
export type DictionaryLimits = Readonly<Required<LocaleDictionaryLimits>>;

/** The limits used when a manager configures none. @internal */
export const DEFAULT_DICTIONARY_LIMITS: DictionaryLimits = Object.freeze({
  maxDepth: 100,
  maxTranslations: 10_000,
  maxProperties: 20_000,
  maxValueLength: 100_000,
  maxTotalLength: 5_000_000,
});

/** What a normalized payload used of each limit, so a later caller can check it against its own. */
type DictionaryUsage = DictionaryLimits;

interface NormalizedPayload {
  readonly dictionary: LocaleDictionary;
  readonly usage: DictionaryUsage;
}

/** Normalized dictionaries shared by payload identity, so per-request managers do not redo the work. */
const normalizedPayloads = new WeakMap<object, NormalizedPayload>();

const fitsLimits = (usage: DictionaryUsage, limits: DictionaryLimits): boolean =>
  usage.maxDepth <= limits.maxDepth &&
  usage.maxTranslations <= limits.maxTranslations &&
  usage.maxProperties <= limits.maxProperties &&
  usage.maxValueLength <= limits.maxValueLength &&
  usage.maxTotalLength <= limits.maxTotalLength;

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidKey = (key: string): boolean => {
  if (hasAsciiControlCharacter(key)) {
    return false;
  }

  return key.split(".").every((segment) => {
    const normalizedSegment = segment.trim();
    return segment === normalizedSegment && normalizedSegment.length > 0 && normalizedSegment !== DANGEROUS_KEY;
  });
};

/**
 * Validates and flattens an unknown locale payload into an immutable dictionary.
 *
 * The result is shared by payload identity: normalizing the same object again returns the same dictionary
 * once it is checked against `limits`, so a payload is treated as immutable after its first load.
 *
 * @param input - Flat or nested object within the depth, property, translation, key, and value limits.
 * @param limits - Resource limits; the fixed 1,000-character flattened-key limit is not among them.
 * @returns A frozen, null-prototype dictionary with dot-separated keys.
 * @throws {TypeError} When the payload cannot safely represent translations or exceeds a resource limit.
 * @internal
 */
export function normalizeDictionary(
  input: unknown,
  limits: DictionaryLimits = DEFAULT_DICTIONARY_LIMITS,
): LocaleDictionary {
  if (!isObject(input)) {
    throw new TypeError("[I18n] A locale dictionary must be a non-null object.");
  }

  const shared = normalizedPayloads.get(input);

  if (shared !== undefined && fitsLimits(shared.usage, limits)) {
    return shared.dictionary;
  }

  const dictionary = Object.create(null) as Record<string, string>;
  const visitedObjects = new WeakSet<object>();
  let maxDepth = 0;
  let propertyCount = 0;
  let translationCount = 0;
  let maxValueLength = 0;
  let totalTranslationLength = 0;

  const visit = (value: object, prefix = "", depth = 0): void => {
    if (depth > limits.maxDepth) {
      throw new TypeError(`[I18n] A locale dictionary must not exceed ${limits.maxDepth} levels of nesting.`);
    }

    maxDepth = Math.max(maxDepth, depth);

    if (visitedObjects.has(value)) {
      throw new TypeError("[I18n] A locale dictionary must not contain repeated objects.");
    }

    visitedObjects.add(value);

    for (const key of Reflect.ownKeys(value)) {
      propertyCount += 1;

      if (propertyCount > limits.maxProperties) {
        throw new TypeError(`[I18n] A locale dictionary must not exceed ${limits.maxProperties} properties.`);
      }
      if (typeof key === "symbol") {
        throw new TypeError("[I18n] A locale dictionary must not contain symbol keys.");
      }

      if (key.length > MAX_FLATTENED_KEY_LENGTH) {
        throw new TypeError(
          `[I18n] Locale dictionary flattened keys must not exceed ${MAX_FLATTENED_KEY_LENGTH} characters.`,
        );
      }

      if (!isValidKey(key)) {
        throw new TypeError("[I18n] Invalid locale dictionary key.");
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
        if (nestedValue.length > limits.maxValueLength) {
          throw new TypeError(
            `[I18n] Locale dictionary translation values must not exceed ${limits.maxValueLength} characters.`,
          );
        }

        maxValueLength = Math.max(maxValueLength, nestedValue.length);
        totalTranslationLength += nestedValue.length;

        if (totalTranslationLength > limits.maxTotalLength) {
          throw new TypeError(
            `[I18n] A locale dictionary must not exceed ${limits.maxTotalLength} aggregate translation characters.`,
          );
        }

        if (Object.hasOwn(dictionary, flattenedKey)) {
          throw new TypeError(`[I18n] Locale dictionary key collision at "${flattenedKey}".`);
        }

        translationCount += 1;

        if (translationCount > limits.maxTranslations) {
          throw new TypeError(`[I18n] A locale dictionary must not exceed ${limits.maxTranslations} translations.`);
        }

        dictionary[flattenedKey] = nestedValue;
      } else if (isObject(nestedValue)) {
        visit(nestedValue, flattenedKey, depth + 1);
      } else {
        throw new TypeError(`[I18n] Locale dictionary value at "${flattenedKey}" must be a string.`);
      }
    }
  };

  visit(input);

  if (Object.keys(dictionary).length === 0) {
    throw new TypeError("[I18n] A locale dictionary must contain at least one translation.");
  }

  const frozenDictionary = Object.freeze(dictionary);
  normalizedPayloads.set(input, {
    dictionary: frozenDictionary,
    usage: {
      maxDepth,
      maxTranslations: translationCount,
      maxProperties: propertyCount,
      maxValueLength,
      maxTotalLength: totalTranslationLength,
    },
  });

  return frozenDictionary;
}
