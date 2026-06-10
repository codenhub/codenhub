import { describeReceived, fail, ok, type ValidationOptions, type ValidationResult } from "./result";

/** Plain object accepted by object validators, including null-prototype objects. */
export type PlainObject = Record<string, unknown>;

/** Object validators returned by `val.object()`. */
export interface ObjectValidators {
  /** Returns the input when it is a plain object and rejects arrays, null, and class instances. */
  plain(): ValidationResult<PlainObject>;
  /** Validates that all listed keys exist as own properties on the plain object. */
  hasKeys(keys: readonly string[]): ValidationResult<PlainObject>;
}

const isPlainObject = (value: unknown): value is PlainObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Creates object validators that all return the same type failure when input is not a plain object. */
export function object(value: unknown, options: ValidationOptions = {}): ObjectValidators {
  if (!isPlainObject(value)) {
    const typeError = fail(
      {
        code: "invalid_type",
        message: `Expected object, got ${describeReceived(value)}`,
        expected: "plain object",
        received: describeReceived(value),
        input: value,
      },
      options,
    );
    const reject = () => typeError;

    return {
      plain: reject,
      hasKeys: reject,
    };
  }

  return {
    plain: () => ok(value),

    hasKeys(keys: readonly string[]): ValidationResult<PlainObject> {
      const missingKey = keys.find((key) => !Object.hasOwn(value, key));
      if (missingKey !== undefined) {
        return fail(
          {
            code: "missing_key",
            message: `Missing required key: ${missingKey}`,
            path: [...(options.path ?? []), missingKey],
            expected: "required key",
            received: "missing",
          },
          options,
        );
      }

      return ok(value);
    },
  };
}
