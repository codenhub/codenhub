import {
  createFeedbackMapBucket,
  createPatternBucket,
  createPrefixBucket,
  normalizeErrorMessage,
  normalizeExactErrorIdentifier,
} from "./bucket";
import type { ErrorRegistry, ReadonlyErrorRegistry } from "./types";

const MUTABLE_BUCKET_METHODS = ["add", "addList", "clear", "delete", "get", "values"] as const;
const PREFIX_BUCKET_METHODS = ["add", "addList", "clear", "delete", "values"] as const;
const PATTERN_BUCKET_METHODS = ["add", "addList", "clear", "delete", "values"] as const;

const getSafeProperty = (value: object, key: PropertyKey): unknown => {
  try {
    return Reflect.get(value, key);
  } catch {
    return undefined;
  }
};

const isObject = (value: unknown): value is object => {
  return value !== null && (typeof value === "object" || typeof value === "function");
};

const hasMethods = (value: unknown, methodNames: readonly PropertyKey[]): boolean => {
  if (!isObject(value)) {
    return false;
  }

  return methodNames.every((methodName) => typeof getSafeProperty(value, methodName) === "function");
};

const isMutableErrorRegistry = (value: unknown): value is ErrorRegistry => {
  if (!isObject(value)) {
    return false;
  }

  return (
    hasMethods(getSafeProperty(value, "codes"), MUTABLE_BUCKET_METHODS) &&
    hasMethods(getSafeProperty(value, "names"), MUTABLE_BUCKET_METHODS) &&
    hasMethods(getSafeProperty(value, "messages"), MUTABLE_BUCKET_METHODS) &&
    hasMethods(getSafeProperty(value, "prefixes"), PREFIX_BUCKET_METHODS) &&
    hasMethods(getSafeProperty(value, "patterns"), PATTERN_BUCKET_METHODS) &&
    typeof getSafeProperty(value, "clear") === "function" &&
    typeof getSafeProperty(value, "merge") === "function"
  );
};

/**
 * Creates an empty, isolated error registry.
 *
 * Optionally merges a list of preset registries into the newly created registry.
 *
 * @param presets - Optional list of existing registries to merge during creation.
 * @returns A new, mutable ErrorRegistry instance.
 */
export const createErrorRegistry = (presets?: readonly (ErrorRegistry | ReadonlyErrorRegistry)[]): ErrorRegistry => {
  const codes = createFeedbackMapBucket(normalizeExactErrorIdentifier);
  const names = createFeedbackMapBucket(normalizeExactErrorIdentifier);
  const messages = createFeedbackMapBucket(normalizeErrorMessage);
  const prefixes = createPrefixBucket();
  const patterns = createPatternBucket();

  const registry: ErrorRegistry = {
    codes,
    names,
    messages,
    prefixes,
    patterns,
    clear(): void {
      codes.clear();
      names.clear();
      messages.clear();
      prefixes.clear();
      patterns.clear();
    },
    merge(sourceRegistry: ErrorRegistry | ReadonlyErrorRegistry): void {
      for (const [identifier, feedback] of sourceRegistry.codes.values()) {
        codes.add(identifier, feedback);
      }

      for (const [identifier, feedback] of sourceRegistry.names.values()) {
        names.add(identifier, feedback);
      }

      for (const [identifier, feedback] of sourceRegistry.messages.values()) {
        messages.add(identifier, feedback);
      }

      for (const { prefix, ...feedback } of sourceRegistry.prefixes.values()) {
        prefixes.add(prefix, feedback);
      }

      for (const { pattern, ...feedback } of sourceRegistry.patterns.values()) {
        patterns.add(pattern, feedback);
      }
    },
  };

  if (presets) {
    for (const preset of presets) {
      registry.merge(preset);
    }
  }

  return registry;
};

let activeRegistry: ErrorRegistry = createErrorRegistry();

/**
 * Retrieves the active global error registry.
 *
 * This registry is used as the default classification source for `createAppError`.
 *
 * @returns The current active ErrorRegistry.
 */
export const getErrorRegistry = (): ErrorRegistry => {
  return activeRegistry;
};

/**
 * Sets the active global error registry.
 *
 * Allows consumers to replace the default registry at application initialization.
 * Throws a TypeError if the provided value does not implement the mutable registry interface.
 *
 * @param registry - The ErrorRegistry instance to set as active.
 * @throws TypeError - If the parameter is not a valid ErrorRegistry.
 */
export const setErrorRegistry = (registry: ErrorRegistry): void => {
  if (!isMutableErrorRegistry(registry)) {
    throw new TypeError("Error registry must implement the mutable registry interface.");
  }
  activeRegistry = registry;
};

/**
 * Creates an immutable snapshot containing only read-facing bucket methods.
 *
 * @param registry - The ErrorRegistry instance to freeze.
 * @returns An immutable `ReadonlyErrorRegistry` snapshot.
 */
export const freezeRegistry = (registry: ErrorRegistry): ReadonlyErrorRegistry => {
  const snapshot = createErrorRegistry([registry]);

  return Object.freeze({
    codes: Object.freeze({ get: snapshot.codes.get, values: snapshot.codes.values }),
    names: Object.freeze({ get: snapshot.names.get, values: snapshot.names.values }),
    messages: Object.freeze({ get: snapshot.messages.get, values: snapshot.messages.values }),
    prefixes: Object.freeze({ values: snapshot.prefixes.values }),
    patterns: Object.freeze({ values: snapshot.patterns.values }),
  });
};
