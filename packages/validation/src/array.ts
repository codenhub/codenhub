import { describeReceived, fail, ok, type ValidationOptions, type ValidationResult } from "./result";

/** Array validators returned by `val.array()`. */
export interface ArrayValidators<T> {
  /** Validates that the array contains at least `length` items. */
  minLength(length: number): ValidationResult<T[]>;
  /** Validates that the array contains at most `length` items. */
  maxLength(length: number): ValidationResult<T[]>;
  /** Validates that the array contains at least one item. */
  notEmpty(): ValidationResult<T[]>;
}

const isValidLengthLimit = (value: number): boolean => Number.isFinite(value) && value >= 0;

/** Creates array validators that all return the same type failure when input is not an array. */
export function array<T = unknown>(value: unknown, options: ValidationOptions = {}): ArrayValidators<T> {
  if (!Array.isArray(value)) {
    const typeError = fail(
      {
        code: "invalid_type",
        message: `Expected array, got ${describeReceived(value)}`,
        expected: "array",
        received: describeReceived(value),
        input: value,
      },
      options,
    );
    const reject = () => typeError;

    return {
      minLength: reject,
      maxLength: reject,
      notEmpty: reject,
    };
  }

  const arrayValue = value as T[];

  return {
    minLength(length: number): ValidationResult<T[]> {
      if (!isValidLengthLimit(length)) {
        return fail({ code: "invalid_value", message: "Minimum length must be a finite non-negative number" }, options);
      }
      if (arrayValue.length < length) {
        return fail(
          {
            code: "too_small",
            message: `Must contain at least ${length} items`,
            expected: `at least ${length} items`,
            received: `${arrayValue.length} items`,
          },
          options,
        );
      }

      return ok(arrayValue);
    },

    maxLength(length: number): ValidationResult<T[]> {
      if (!isValidLengthLimit(length)) {
        return fail({ code: "invalid_value", message: "Maximum length must be a finite non-negative number" }, options);
      }
      if (arrayValue.length > length) {
        return fail(
          {
            code: "too_big",
            message: `Must contain at most ${length} items`,
            expected: `at most ${length} items`,
            received: `${arrayValue.length} items`,
          },
          options,
        );
      }

      return ok(arrayValue);
    },

    notEmpty(): ValidationResult<T[]> {
      if (arrayValue.length === 0) {
        return fail(
          { code: "too_small", message: "Array cannot be empty", expected: "non-empty array", received: "empty array" },
          options,
        );
      }

      return ok(arrayValue);
    },
  };
}
