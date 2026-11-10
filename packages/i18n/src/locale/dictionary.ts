import { isPlainObject } from "../core/plain-object";
import { hasAsciiControlCharacter } from "../core/string-validation";
import type { LocaleDictionary, LocaleDictionaryLimits } from "../core/types";

const DANGEROUS_KEY = "__proto__";
const MAX_FLATTENED_KEY_LENGTH = 1_000;
/** Keeps an error message readable when the rejected key is up to the 1,000-character flattened-key limit. */
const MAX_REPORTED_KEY_LENGTH = 100;

/** Every dictionary limit, resolved. @internal */
export type DictionaryLimits = { readonly [K in keyof LocaleDictionaryLimits]-?: number };

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

/** A group or root must be a plain object, so a Date or Map is not taken for an empty group. */
const isObject = isPlainObject;

const isValidKey = (key: string): boolean => {
  if (hasAsciiControlCharacter(key)) {
    return false;
  }

  return key.split(".").every((segment) => {
    const normalizedSegment = segment.trim();
    return segment === normalizedSegment && normalizedSegment.length > 0 && normalizedSegment !== DANGEROUS_KEY;
  });
};

// Characters JSON leaves as written that a log viewer may still break a line at: DEL, C1 controls such as NEL, and the
// Unicode line and paragraph separators.
const UNESCAPED_LINE_BREAKS = /[\u007f-\u009f\u2028\u2029]/g;

const quoteKey = (key: string): string =>
  JSON.stringify(key).replace(
    UNESCAPED_LINE_BREAKS,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

/** Quotes a rejected key, escaping control characters so it cannot forge log lines, and truncates a long one. */
const formatReportedKey = (key: string): string =>
  key.length > MAX_REPORTED_KEY_LENGTH ? `${quoteKey(key.slice(0, MAX_REPORTED_KEY_LENGTH))}...` : quoteKey(key);

/** How a payload is checked, and the locale its rejections name. @internal */
export interface NormalizeDictionaryOptions {
  /** Resource limits, {@link DEFAULT_DICTIONARY_LIMITS} when omitted. */
  readonly limits?: DictionaryLimits | undefined;
  /** Locale the payload was loaded for. */
  readonly locale?: string | undefined;
}

/**
 * Validates and flattens an unknown locale payload into an immutable dictionary.
 *
 * The result is shared by payload identity: normalizing the same object again returns the same dictionary
 * once it is checked against `limits`, so a payload is treated as immutable after its first load.
 *
 * @param input - Flat or nested object within the depth, property, translation, key, and value limits.
 * @param options - Resource limits, which exclude the fixed 1,000-character flattened-key limit, and the locale the
 * payload was loaded for, named in every rejection message.
 * @returns A frozen, null-prototype dictionary with dot-separated keys.
 * @throws {TypeError} When the payload cannot safely represent translations or exceeds a resource limit; an invalid
 * key is named by its quoted flattened path, truncated after 100 characters.
 * @internal
 */
export function normalizeDictionary(input: unknown, options: NormalizeDictionaryOptions = {}): LocaleDictionary {
  const { limits = DEFAULT_DICTIONARY_LIMITS, locale } = options;
  const localeSuffix = locale === undefined ? "" : ` in locale "${locale}"`;
  const invalid = (problem: string): TypeError => new TypeError(`[I18n] ${problem}${localeSuffix}.`);

  if (!isObject(input)) {
    throw invalid("A locale dictionary must be a non-null object");
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
      throw invalid(`A locale dictionary must not exceed ${limits.maxDepth} levels of nesting`);
    }

    maxDepth = Math.max(maxDepth, depth);

    if (visitedObjects.has(value)) {
      throw invalid("A locale dictionary must not contain repeated objects");
    }

    visitedObjects.add(value);

    for (const key of Reflect.ownKeys(value)) {
      propertyCount += 1;

      if (propertyCount > limits.maxProperties) {
        throw invalid(`A locale dictionary must not exceed ${limits.maxProperties} properties`);
      }
      if (typeof key === "symbol") {
        throw invalid("A locale dictionary must not contain symbol keys");
      }

      if (key.length > MAX_FLATTENED_KEY_LENGTH) {
        throw invalid(`Locale dictionary flattened keys must not exceed ${MAX_FLATTENED_KEY_LENGTH} characters`);
      }

      if (!isValidKey(key)) {
        throw invalid(
          `Invalid locale dictionary key ${formatReportedKey(prefix.length === 0 ? key : `${prefix}.${key}`)}`,
        );
      }

      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      if (descriptor === undefined || "get" in descriptor || "set" in descriptor) {
        throw invalid("A locale dictionary must not contain accessors");
      }

      const flattenedKey = prefix.length === 0 ? key : `${prefix}.${key}`;
      const nestedValue = descriptor.value;

      if (flattenedKey.length > MAX_FLATTENED_KEY_LENGTH) {
        throw invalid(`Locale dictionary flattened keys must not exceed ${MAX_FLATTENED_KEY_LENGTH} characters`);
      }

      if (typeof nestedValue === "string") {
        if (nestedValue.length > limits.maxValueLength) {
          throw invalid(`Locale dictionary translation values must not exceed ${limits.maxValueLength} characters`);
        }

        maxValueLength = Math.max(maxValueLength, nestedValue.length);
        totalTranslationLength += nestedValue.length;

        if (totalTranslationLength > limits.maxTotalLength) {
          throw invalid(
            `A locale dictionary must not exceed ${limits.maxTotalLength} aggregate translation characters`,
          );
        }

        if (Object.hasOwn(dictionary, flattenedKey)) {
          throw invalid(`Locale dictionary key collision at "${flattenedKey}"`);
        }

        translationCount += 1;

        if (translationCount > limits.maxTranslations) {
          throw invalid(`A locale dictionary must not exceed ${limits.maxTranslations} translations`);
        }

        dictionary[flattenedKey] = nestedValue;
      } else if (isObject(nestedValue)) {
        visit(nestedValue, flattenedKey, depth + 1);
      } else {
        throw invalid(`Locale dictionary value at "${flattenedKey}" must be a string`);
      }
    }
  };

  visit(input);

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
