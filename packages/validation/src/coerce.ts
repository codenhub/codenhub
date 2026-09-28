import { BooleanValidator } from "./boolean";
import { BaseValidator, type ValidationContext } from "./core";
import { DateValidator } from "./date";
import { NumberValidator } from "./number";
import { fail, ok, type ValidationOptions, type ValidationResult } from "./result";
import { StringValidator } from "./string";

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
 * Generic schema validator that coerces raw input to a target type using a custom coercion function.
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
 * Schema validator that coerces input to a string before running StringValidator constraints.
 */
export class CoercedStringValidator extends StringValidator {
  protected override clone(): CoercedStringValidator {
    const copy = new CoercedStringValidator();
    copy.steps.push(...this.steps);
    return copy;
  }

  protected override _validate(input: unknown, ctx: ValidationContext): ValidationResult<string> {
    const coerced = coerce.string(input, { ...ctx.options, path: ctx.path });
    if (!coerced.ok) {
      ctx.addIssue(coerced.error);
      return coerced;
    }
    return super._validate(coerced.value, ctx);
  }
}

/**
 * Schema validator that coerces input to a number before running NumberValidator constraints.
 */
export class CoercedNumberValidator extends NumberValidator {
  constructor(
    protected readonly coerceFn: (
      value: unknown,
      options?: ValidationOptions,
    ) => ValidationResult<number> = coerce.number,
  ) {
    super();
  }

  protected override clone(): CoercedNumberValidator {
    const copy = new CoercedNumberValidator(this.coerceFn);
    copy.steps.push(...this.steps);
    copy.allowNonFinite = this.allowNonFinite;
    return copy;
  }

  protected override _validate(input: unknown, ctx: ValidationContext): ValidationResult<number> {
    const coerced = this.coerceFn(input, { ...ctx.options, path: ctx.path });
    if (!coerced.ok) {
      ctx.addIssue(coerced.error);
      return coerced;
    }
    return super._validate(coerced.value, ctx);
  }
}

/**
 * Schema validator that coerces input to a boolean before running BooleanValidator constraints.
 */
export class CoercedBooleanValidator extends BooleanValidator {
  protected override clone(): CoercedBooleanValidator {
    const copy = new CoercedBooleanValidator();
    copy.checks.push(...this.checks);
    return copy;
  }

  protected override _validate(input: unknown, ctx: ValidationContext): ValidationResult<boolean> {
    const coerced = coerce.bool(input, { ...ctx.options, path: ctx.path });
    if (!coerced.ok) {
      ctx.addIssue(coerced.error);
      return coerced;
    }
    return super._validate(coerced.value, ctx);
  }
}

/**
 * Schema validator that coerces input to a Date instance before running DateValidator constraints.
 */
export class CoercedDateValidator extends DateValidator {
  protected override clone(): CoercedDateValidator {
    const copy = new CoercedDateValidator();
    copy.checks.push(...this.checks);
    return copy;
  }

  protected override _validate(input: unknown, ctx: ValidationContext): ValidationResult<Date> {
    const coerced = coerce.date(input, { ...ctx.options, path: ctx.path });
    if (!coerced.ok) {
      ctx.addIssue(coerced.error);
      return coerced;
    }
    return super._validate(coerced.value, ctx);
  }
}

/**
 * Factory collection of coercion-based schema validators.
 */
export interface ValCoerce {
  /** Creates a validator that coerces input to a safe integer and runs NumberValidator checks. */
  int(): NumberValidator;
  /** Creates a validator that coerces input to a finite number and runs NumberValidator checks. */
  number(): NumberValidator;
  /** Creates a validator that coerces input to a boolean and runs BooleanValidator checks. */
  bool(): BooleanValidator;
  /** Creates a validator that coerces input to a boolean (alias for bool). */
  boolean(): BooleanValidator;
  /** Creates a validator that coerces input to a string and runs StringValidator checks. */
  string(): StringValidator;
  /** Creates a validator that coerces input to a Date instance and runs DateValidator checks. */
  date(): DateValidator;
}

/**
 * Registry of schema validator factories that coerce input before validation.
 */
export const valCoerce: ValCoerce = {
  int: () => new CoercedNumberValidator(coerce.int).int(),
  number: () => new CoercedNumberValidator(coerce.number),
  bool: () => new CoercedBooleanValidator(),
  boolean: () => new CoercedBooleanValidator(),
  string: () => new CoercedStringValidator(),
  date: () => new CoercedDateValidator(),
};
