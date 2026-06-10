import { fail, ok, type ValidationOptions, type ValidationResult } from "./result";

const DECIMAL_INTEGER_PATTERN = /^[+-]?\d+$/;
const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

/** Primitive coercion helpers for boundary input such as env vars, forms, and query params. */
export const coerce = {
  /** Coerces primitive decimal integer input to a safe integer or returns a validation failure. */
  int(value: unknown, options: ValidationOptions = {}): ValidationResult<number> {
    const stringResult = stringify(value, options);
    if (!stringResult.ok) {
      return fail(
        {
          code: "invalid_type",
          message: "Cannot coerce value to integer",
          expected: "primitive",
          received: typeof value,
        },
        options,
      );
    }

    const input = stringResult.value.trim();
    if (!DECIMAL_INTEGER_PATTERN.test(input)) {
      return fail(
        {
          code: "invalid_format",
          message: `Cannot coerce "${stringResult.value}" to integer`,
          expected: "integer string",
          received: stringResult.value,
        },
        options,
      );
    }

    const numberValue = Number(input);
    if (input.length === 0 || !Number.isSafeInteger(numberValue)) {
      return fail(
        {
          code: "invalid_format",
          message: `Cannot coerce "${stringResult.value}" to integer`,
          expected: "safe integer string",
          received: stringResult.value,
        },
        options,
      );
    }

    return ok(numberValue);
  },

  /** Coerces primitive decimal number input to a finite number or returns a validation failure. */
  number(value: unknown, options: ValidationOptions = {}): ValidationResult<number> {
    const stringResult = stringify(value, options);
    if (!stringResult.ok) {
      return fail(
        {
          code: "invalid_type",
          message: "Cannot coerce value to number",
          expected: "primitive",
          received: typeof value,
        },
        options,
      );
    }

    const input = stringResult.value.trim();
    if (!DECIMAL_NUMBER_PATTERN.test(input)) {
      return fail(
        {
          code: "invalid_format",
          message: `Cannot coerce "${stringResult.value}" to number`,
          expected: "number string",
          received: stringResult.value,
        },
        options,
      );
    }

    const numberValue = Number(input);
    if (input.length === 0 || !Number.isFinite(numberValue)) {
      return fail(
        {
          code: "invalid_format",
          message: `Cannot coerce "${stringResult.value}" to number`,
          expected: "finite number string",
          received: stringResult.value,
        },
        options,
      );
    }

    return ok(numberValue);
  },

  /** Coerces booleans and common boolean strings like `yes`, `no`, `on`, and `off`. */
  bool(value: unknown, options: ValidationOptions = {}): ValidationResult<boolean> {
    if (typeof value === "boolean") {
      return ok(value);
    }

    const stringResult = stringify(value, options);
    if (!stringResult.ok) {
      return fail(
        {
          code: "invalid_type",
          message: "Cannot coerce value to boolean",
          expected: "primitive",
          received: typeof value,
        },
        options,
      );
    }

    const input = stringResult.value.toLowerCase().trim();
    if (["true", "1", "yes", "on"].includes(input)) {
      return ok(true);
    }
    if (["false", "0", "no", "off"].includes(input)) {
      return ok(false);
    }

    return fail(
      {
        code: "invalid_format",
        message: `Cannot coerce "${stringResult.value}" to boolean`,
        expected: "boolean string",
        received: stringResult.value,
      },
      options,
    );
  },

  /** Coerces defined primitive input to a string and rejects null, undefined, objects, and functions. */
  string(value: unknown, options: ValidationOptions = {}): ValidationResult<string> {
    if (value === null || value === undefined) {
      return fail(
        {
          code: "invalid_type",
          message: "Cannot coerce null or undefined to string",
          expected: "defined primitive",
          received: value === null ? "null" : "undefined",
        },
        options,
      );
    }

    return stringify(value, options);
  },
};

const stringify = (value: unknown, options: ValidationOptions): ValidationResult<string> => {
  if (typeof value === "object" || typeof value === "function") {
    return fail(
      {
        code: "invalid_type",
        message: "Cannot convert value to string",
        expected: "primitive",
        received: typeof value,
      },
      options,
    );
  }

  try {
    return ok(String(value));
  } catch {
    return fail(
      { code: "invalid_type", message: "Cannot convert value to string", expected: "string-convertible value" },
      options,
    );
  }
};
