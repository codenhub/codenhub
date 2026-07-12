import { createFeedbackMapBucket, createPatternBucket, createPrefixBucket } from "./bucket";
import type { ErrorRegistry, ReadonlyErrorRegistry } from "./types";

/**
 * Creates an empty, isolated error registry.
 *
 * Optionally merges a list of preset registries into the newly created registry.
 *
 * @param presets - Optional list of existing registries to merge during creation.
 * @returns A new, mutable ErrorRegistry instance.
 */
export const createErrorRegistry = (presets?: readonly (ErrorRegistry | ReadonlyErrorRegistry)[]): ErrorRegistry => {
  const codes = createFeedbackMapBucket();
  const names = createFeedbackMapBucket();
  const messages = createFeedbackMapBucket();
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
 * Throws a TypeError if the provided value is null or not an object.
 *
 * @param registry - The ErrorRegistry instance to set as active.
 * @throws TypeError - If the parameter is not a valid ErrorRegistry.
 */
export const setErrorRegistry = (registry: ErrorRegistry): void => {
  if (typeof registry !== "object" || registry === null) {
    throw new TypeError("Error registry must be an object.");
  }
  activeRegistry = registry;
};

/**
 * Wraps an ErrorRegistry in a read-only Proxy to prevent any future mutations.
 *
 * All mutating methods (such as `add`, `addList`, `clear`, `delete`) will throw a TypeError
 * if called on a frozen registry bucket. The returned type is `ReadonlyErrorRegistry`,
 * which only exposes the read-facing bucket surface at the type level.
 *
 * @param registry - The ErrorRegistry instance to freeze.
 * @returns A read-only `ReadonlyErrorRegistry` instance.
 */
export const freezeRegistry = (registry: ErrorRegistry): ReadonlyErrorRegistry => {
  const throwReadOnly = (): never => {
    throw new TypeError("Cannot modify a read-only error registry.");
  };

  const freezeBucket = <T extends object>(bucket: T): T => {
    return new Proxy(bucket, {
      get(target, prop, receiver) {
        if (prop === "add" || prop === "addList" || prop === "clear" || prop === "delete") {
          return throwReadOnly;
        }
        return Reflect.get(target, prop, receiver);
      },
      set() {
        throwReadOnly();
        return false;
      },
      defineProperty() {
        throwReadOnly();
        return false;
      },
      deleteProperty() {
        throwReadOnly();
        return false;
      },
      preventExtensions() {
        throwReadOnly();
        return false;
      },
      setPrototypeOf() {
        throwReadOnly();
        return false;
      },
    });
  };

  return Object.freeze({
    codes: freezeBucket(registry.codes),
    names: freezeBucket(registry.names),
    messages: freezeBucket(registry.messages),
    prefixes: freezeBucket(registry.prefixes),
    patterns: freezeBucket(registry.patterns),
  });
};
