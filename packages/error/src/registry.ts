import {
  createFeedbackMapBucket,
  createPatternBucket,
  createPrefixBucket,
  normalizeErrorMessage,
  normalizeExactErrorIdentifier,
} from "./bucket";
import type { ErrorRegistry, ReadonlyErrorRegistry } from "./types";

type RegistryBuckets = Pick<ErrorRegistry, "codes" | "names" | "messages" | "prefixes" | "patterns">;

interface RegistryBucketMethods {
  /** Methods required on the identifier-keyed `codes`, `names`, and `messages` buckets. */
  readonly bucketMethods: readonly PropertyKey[];

  /** Methods required on the definition-list `prefixes` and `patterns` buckets. */
  readonly definitionBucketMethods: readonly PropertyKey[];
}

const MUTABLE_BUCKET_METHODS = ["add", "addList", "clear", "delete", "get", "values"] as const;
const MUTABLE_DEFINITION_BUCKET_METHODS = ["add", "addList", "clear", "delete", "values"] as const;
const READABLE_BUCKET_METHODS = ["get", "values"] as const;
const READABLE_DEFINITION_BUCKET_METHODS = ["values"] as const;

const MUTABLE_REGISTRY_METHODS: RegistryBucketMethods = {
  bucketMethods: MUTABLE_BUCKET_METHODS,
  definitionBucketMethods: MUTABLE_DEFINITION_BUCKET_METHODS,
};

const READABLE_REGISTRY_METHODS: RegistryBucketMethods = {
  bucketMethods: READABLE_BUCKET_METHODS,
  definitionBucketMethods: READABLE_DEFINITION_BUCKET_METHODS,
};

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

const hasRegistryBuckets = (
  value: object,
  { bucketMethods, definitionBucketMethods }: RegistryBucketMethods,
): boolean => {
  return (
    hasMethods(getSafeProperty(value, "codes"), bucketMethods) &&
    hasMethods(getSafeProperty(value, "names"), bucketMethods) &&
    hasMethods(getSafeProperty(value, "messages"), bucketMethods) &&
    hasMethods(getSafeProperty(value, "prefixes"), definitionBucketMethods) &&
    hasMethods(getSafeProperty(value, "patterns"), definitionBucketMethods)
  );
};

const isMutableErrorRegistry = (value: unknown): value is ErrorRegistry => {
  if (!isObject(value)) {
    return false;
  }

  return (
    hasRegistryBuckets(value, MUTABLE_REGISTRY_METHODS) &&
    typeof getSafeProperty(value, "clear") === "function" &&
    typeof getSafeProperty(value, "merge") === "function"
  );
};

/**
 * Checks that a value exposes the read-facing bucket surface needed to classify errors
 * and to act as a merge or preset source.
 *
 * @internal
 */
export const isReadableErrorRegistry = (value: unknown): value is ReadonlyErrorRegistry => {
  return isObject(value) && hasRegistryBuckets(value, READABLE_REGISTRY_METHODS);
};

const copyRegistryEntries = (
  sourceRegistry: ErrorRegistry | ReadonlyErrorRegistry,
  targetRegistry: RegistryBuckets,
): void => {
  targetRegistry.codes.addList([...sourceRegistry.codes.values()]);
  targetRegistry.names.addList([...sourceRegistry.names.values()]);
  targetRegistry.messages.addList([...sourceRegistry.messages.values()]);
  targetRegistry.prefixes.addList(
    sourceRegistry.prefixes.values().map(({ prefix, ...feedback }) => [prefix, feedback] as const),
  );
  targetRegistry.patterns.addList(
    sourceRegistry.patterns.values().map(({ pattern, ...feedback }) => [pattern, feedback] as const),
  );
};

/**
 * Creates an empty, isolated error registry.
 *
 * Optionally merges a list of preset registries into the newly created registry.
 *
 * @param presets - Optional list of existing registries to merge during creation.
 * @returns A new, mutable ErrorRegistry instance.
 * @throws TypeError - If `presets` is not a list, if a preset does not implement the readable
 * registry interface, or if any preset contains an invalid identifier, pattern, or feedback field.
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
      if (!isReadableErrorRegistry(sourceRegistry)) {
        throw new TypeError("Error registry merge source must implement the readable registry interface.");
      }

      const stagedRegistry: RegistryBuckets = {
        codes: createFeedbackMapBucket(normalizeExactErrorIdentifier),
        names: createFeedbackMapBucket(normalizeExactErrorIdentifier),
        messages: createFeedbackMapBucket(normalizeErrorMessage),
        prefixes: createPrefixBucket(),
        patterns: createPatternBucket(),
      };

      copyRegistryEntries(sourceRegistry, stagedRegistry);
      copyRegistryEntries(stagedRegistry, registry);
    },
  };

  for (const bucketName of ["codes", "names", "messages", "prefixes", "patterns"] as const) {
    Object.defineProperty(registry, bucketName, { configurable: false, writable: false });
  }

  if (presets !== undefined) {
    if (!Array.isArray(presets)) {
      throw new TypeError("Error registry presets must be a list of registries.");
    }

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
