import { DEFAULT_MAX_TOKEN_LENGTH, MAX_TOKEN_LENGTH_LIMIT } from "../core/limits";
import type { KeySet, VerifierOptions } from "../core/types";
import type { StandardSchemaV1 } from "../interop/standard-schema";

/** Largest `clockTolerance`, in seconds. */
export const MAX_CLOCK_TOLERANCE = 300;

/** Verifier options after validation, with defaults applied and lists copied. */
export interface ResolvedOptions {
  readonly keys: KeySet;
  readonly issuers?: readonly string[];
  readonly audiences?: readonly string[];
  /** The required `typ`, already normalized by {@link normalizeType}. */
  readonly type?: string;
  readonly clockTolerance: number;
  readonly maxAge?: number;
  readonly maxLength: number;
  readonly requiredClaims: readonly string[];
  readonly claims?: StandardSchemaV1;
  readonly now: () => number;
}

const MEDIA_TYPE_PREFIX = "application/";

/** RFC 7515 §4.1.9: `typ` compares case-insensitively, and `application/` may be omitted. */
export function normalizeType(type: string): string {
  const lower = type.toLowerCase();
  return lower.startsWith(MEDIA_TYPE_PREFIX) ? lower.slice(MEDIA_TYPE_PREFIX.length) : lower;
}

function throwInvalid(message: string): never {
  throw new TypeError(`createVerifier: ${message}`);
}

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const isIntegerInRange = (value: unknown, minimum: number, maximum: number): value is number =>
  Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;

/**
 * Validates every verifier option and applies defaults.
 *
 * @throws TypeError naming the first invalid option and its constraint, never its value.
 */
export function resolveOptions(options: VerifierOptions<StandardSchemaV1 | undefined>): ResolvedOptions {
  if (typeof options !== "object" || options === null) {
    throwInvalid("options must be an object.");
  }
  const { keys, issuer, audience, type, clockTolerance, maxAge, maxLength, requiredClaims, claims, now } = options;
  if (typeof keys !== "object" || keys === null || typeof keys.select !== "function") {
    throwInvalid("options.keys must be a key set (an object with a select function).");
  }
  if (type !== undefined && !(isNonEmptyString(type) && normalizeType(type) !== "")) {
    throwInvalid("options.type must be a non-empty string other than application/.");
  }
  if (clockTolerance !== undefined && !isIntegerInRange(clockTolerance, 0, MAX_CLOCK_TOLERANCE)) {
    throwInvalid(`options.clockTolerance must be an integer number of seconds from 0 through ${MAX_CLOCK_TOLERANCE}.`);
  }
  if (maxAge !== undefined && !isIntegerInRange(maxAge, 1, Number.MAX_SAFE_INTEGER)) {
    throwInvalid("options.maxAge must be a positive integer number of seconds.");
  }
  if (maxLength !== undefined && !isIntegerInRange(maxLength, 1, MAX_TOKEN_LENGTH_LIMIT)) {
    throwInvalid(`options.maxLength must be an integer from 1 through ${MAX_TOKEN_LENGTH_LIMIT}.`);
  }
  if (now !== undefined && typeof now !== "function") {
    throwInvalid("options.now must be a function returning milliseconds.");
  }
  return {
    keys,
    ...optional("issuers", readStringList(issuer, "issuer")),
    ...optional("audiences", readStringList(audience, "audience")),
    ...optional("type", type === undefined ? undefined : normalizeType(type)),
    clockTolerance: clockTolerance ?? 0,
    ...optional("maxAge", maxAge),
    maxLength: maxLength ?? DEFAULT_MAX_TOKEN_LENGTH,
    requiredClaims: readRequiredClaims(requiredClaims),
    ...optional("claims", readSchema(claims)),
    now: now ?? Date.now,
  };
}

/** Spreads a member only when it has a value, so resolved options hold no `undefined` members. */
const optional = <TName extends string, TValue>(name: TName, value: TValue | undefined): { [key in TName]?: TValue } =>
  value === undefined ? {} : ({ [name]: value } as { [key in TName]: TValue });

function readStringList(value: unknown, name: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const list: unknown = typeof value === "string" ? [value] : value;
  const copy = Array.isArray(list) ? denseCopy(list) : undefined;
  if (copy === undefined || copy.length === 0 || !copy.every(isNonEmptyString)) {
    throwInvalid(`options.${name} must be a non-empty string or a non-empty array of non-empty strings.`);
  }
  return Object.freeze(copy as string[]);
}

function readRequiredClaims(value: unknown): readonly string[] {
  if (value === undefined) {
    return [];
  }
  const copy = Array.isArray(value) ? denseCopy(value) : undefined;
  if (copy === undefined || !copy.every(isNonEmptyString)) {
    throwInvalid("options.requiredClaims must be an array of non-empty strings.");
  }
  return Object.freeze(copy as string[]);
}

/** Copies an array by index, so a hole becomes `undefined` and fails the element check instead of being skipped. */
const denseCopy = (array: readonly unknown[]): unknown[] =>
  Array.from({ length: array.length }, (_, index) => array[index]);

function readSchema(value: unknown): StandardSchemaV1 | undefined {
  if (value === undefined) {
    return undefined;
  }
  // Some schema libraries make their schemas callable, so a function is as valid as an object.
  const props: unknown =
    (typeof value === "object" && value !== null) || typeof value === "function"
      ? (value as Record<string, unknown>)["~standard"]
      : undefined;
  if (
    typeof props !== "object" ||
    props === null ||
    (props as Record<string, unknown>).version !== 1 ||
    typeof (props as Record<string, unknown>).vendor !== "string" ||
    typeof (props as Record<string, unknown>).validate !== "function"
  ) {
    throwInvalid("options.claims must be a Standard Schema (version 1, with a vendor and a validate function).");
  }
  return value as StandardSchemaV1;
}
