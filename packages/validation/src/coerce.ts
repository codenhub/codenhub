import { BaseValidator, type ValidationContext } from "./core";
import { fail, ok, type ValidationOptions, type ValidationResult } from "./result";

const DECIMAL_INTEGER_PATTERN = /^[+-]?\d+$/;
const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

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

  /** Coerces date string, timestamp number, or Date instance to a valid Date object. */
  date(value: unknown, options: ValidationOptions = {}): ValidationResult<Date> {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return fail(
          {
            code: "invalid_format",
            message: "Cannot coerce invalid date to Date",
            expected: "valid date",
            received: "Invalid Date",
          },
          options,
        );
      }
      return ok(value);
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return fail(
          {
            code: "invalid_format",
            message: `Cannot coerce ${value} to Date`,
            expected: "finite timestamp",
            received: String(value),
          },
          options,
        );
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return fail(
          {
            code: "invalid_format",
            message: `Cannot coerce ${value} to Date`,
            expected: "valid timestamp",
            received: String(value),
          },
          options,
        );
      }
      return ok(parsed);
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return fail(
          {
            code: "invalid_format",
            message: "Cannot coerce empty string to Date",
            expected: "non-empty date string",
            received: '""',
          },
          options,
        );
      }
      if (!ISO_DATE_PATTERN.test(trimmed)) {
        return fail(
          {
            code: "invalid_format",
            message: `Cannot coerce "${value}" to Date`,
            expected: "valid date string",
            received: value,
          },
          options,
        );
      }
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        return fail(
          {
            code: "invalid_format",
            message: `Cannot coerce "${value}" to Date`,
            expected: "valid date string",
            received: value,
          },
          options,
        );
      }
      return ok(parsed);
    }

    return fail(
      {
        code: "invalid_type",
        message: "Cannot coerce value to Date",
        expected: "Date, timestamp, or date string",
        received: typeof value,
      },
      options,
    );
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

/**
 * Schema validator that coerces raw input to a target type before producing results.
 *
 * @typeParam T - The coerced output type.
 */
export class CoerceValidator<T> extends BaseValidator<T, unknown> {
  /**
   * Constructs a CoerceValidator.
   *
   * @param coerceFn - Underlying coercion function.
   * @param typeName - Descriptive name of the target coerced type.
   */
  constructor(
    private readonly coerceFn: (value: unknown, options?: ValidationOptions) => ValidationResult<T>,
    readonly typeName: string,
  ) {
    super();
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<T> {
    const res = this.coerceFn(input, { ...ctx.options, path: ctx.path });
    if (!res.ok) {
      ctx.addIssue(res.error);
      return res;
    }
    return ctx.ok(res.value);
  }
}

/**
 * Factory collection of coercion-based schema validators.
 */
export interface ValCoerce {
  /** Creates a validator that coerces input to a safe integer. */
  int(): CoerceValidator<number>;
  /** Creates a validator that coerces input to a finite number. */
  number(): CoerceValidator<number>;
  /** Creates a validator that coerces input to a boolean. */
  bool(): CoerceValidator<boolean>;
  /** Creates a validator that coerces input to a boolean (alias for bool). */
  boolean(): CoerceValidator<boolean>;
  /** Creates a validator that coerces input to a string. */
  string(): CoerceValidator<string>;
  /** Creates a validator that coerces input to a Date instance. */
  date(): CoerceValidator<Date>;
}

/**
 * Registry of schema validator factories that coerce input before validation.
 */
export const valCoerce: ValCoerce = {
  int: () => new CoerceValidator<number>(coerce.int, "int"),
  number: () => new CoerceValidator<number>(coerce.number, "number"),
  bool: () => new CoerceValidator<boolean>(coerce.bool, "bool"),
  boolean: () => new CoerceValidator<boolean>(coerce.bool, "boolean"),
  string: () => new CoerceValidator<string>(coerce.string, "string"),
  date: () => new CoerceValidator<Date>(coerce.date, "date"),
};
