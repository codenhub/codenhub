import { describeReceived, fail, ok, type ValidationOptions, type ValidationResult } from "./result";

/** Number validators returned by `val.number()`. */
export interface NumberValidators {
  /** Validates that the finite number is greater than zero. */
  positive(): ValidationResult<number>;
  /** Validates that the finite number is less than zero. */
  negative(): ValidationResult<number>;
  /** Validates that the finite number is zero or greater. */
  nonNegative(): ValidationResult<number>;
  /** Validates that the finite number is zero or less. */
  nonPositive(): ValidationResult<number>;
  /** Validates that the finite number is not zero. */
  nonZero(): ValidationResult<number>;
  /** Validates that the finite number is an integer. */
  int(): ValidationResult<number>;
  /** Validates that the finite number is a safe JavaScript integer. */
  safeInt(): ValidationResult<number>;
  /** Validates that the finite number is within optional inclusive min and max bounds. */
  range(options: { min?: number; max?: number }): ValidationResult<number>;
  /** Returns success for finite numbers; non-finite input fails before this method runs. */
  finite(): ValidationResult<number>;
  /** Validates that the finite number is an integer TCP/UDP port from 1 through 65535. */
  port(): ValidationResult<number>;
}

/** Creates number validators that reject non-number, `NaN`, and non-finite input before method-specific checks. */
export function number(value: unknown, options: ValidationOptions = {}): NumberValidators {
  if (typeof value !== "number" || Number.isNaN(value)) {
    const typeError = fail(
      {
        code: "invalid_type",
        message: `Expected number, got ${describeReceived(value)}`,
        expected: "number",
        received: describeReceived(value),
        input: value,
      },
      options,
    );
    const reject = () => typeError;

    return createRejectedNumberValidators(reject);
  }

  if (!Number.isFinite(value)) {
    const finiteError = fail(
      {
        code: "invalid_value",
        message: "Must be a finite number",
        expected: "finite number",
        received: String(value),
        input: value,
      },
      options,
    );
    const reject = () => finiteError;

    return createRejectedNumberValidators(reject);
  }

  return {
    positive: () =>
      value > 0
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be a positive number",
              expected: "positive number",
              received: String(value),
            },
            options,
          ),
    negative: () =>
      value < 0
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be a negative number",
              expected: "negative number",
              received: String(value),
            },
            options,
          ),
    nonNegative: () =>
      value >= 0
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be zero or greater",
              expected: "zero or greater",
              received: String(value),
            },
            options,
          ),
    nonPositive: () =>
      value <= 0
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be zero or less",
              expected: "zero or less",
              received: String(value),
            },
            options,
          ),
    nonZero: () =>
      value !== 0
        ? ok(value)
        : fail(
            { code: "invalid_value", message: "Must not be zero", expected: "non-zero number", received: "0" },
            options,
          ),
    int: () =>
      Number.isInteger(value)
        ? ok(value)
        : fail(
            { code: "invalid_value", message: "Must be an integer", expected: "integer", received: String(value) },
            options,
          ),
    safeInt: () =>
      Number.isSafeInteger(value)
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be a safe integer",
              expected: "safe integer",
              received: String(value),
            },
            options,
          ),

    range({ min, max }: { min?: number; max?: number }): ValidationResult<number> {
      if (min !== undefined && !Number.isFinite(min)) {
        return fail({ code: "invalid_value", message: "Range minimum must be a finite number" }, options);
      }
      if (max !== undefined && !Number.isFinite(max)) {
        return fail({ code: "invalid_value", message: "Range maximum must be a finite number" }, options);
      }
      if (min !== undefined && max !== undefined && min > max) {
        return fail({ code: "invalid_value", message: "Range minimum cannot be greater than maximum" }, options);
      }
      if (min !== undefined && value < min) {
        return fail(
          {
            code: "too_small",
            message: `Must be at least ${min}`,
            expected: `at least ${min}`,
            received: String(value),
          },
          options,
        );
      }
      if (max !== undefined && value > max) {
        return fail(
          { code: "too_big", message: `Must be at most ${max}`, expected: `at most ${max}`, received: String(value) },
          options,
        );
      }

      return ok(value);
    },

    finite: () => ok(value),
    port: () =>
      Number.isInteger(value) && value >= 1 && value <= 65535
        ? ok(value)
        : fail(
            {
              code: "invalid_value",
              message: "Must be a valid port number (1-65535)",
              expected: "integer from 1 to 65535",
              received: String(value),
            },
            options,
          ),
  };
}

const createRejectedNumberValidators = (reject: () => ValidationResult<number>): NumberValidators => ({
  positive: reject,
  negative: reject,
  nonNegative: reject,
  nonPositive: reject,
  nonZero: reject,
  int: reject,
  safeInt: reject,
  range: reject,
  finite: reject,
  port: reject,
});
