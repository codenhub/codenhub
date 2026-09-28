import { BaseValidator, type Infer, type ValidationContext, type Validator } from "./core";
import {
  describeReceived,
  fail,
  ok,
  type ValidationIssue,
  type ValidationOptions,
  type ValidationResult,
} from "./result";

/**
 * Extracts the keys of an object shape whose inferred output type accepts `undefined`.
 */
type OptionalKeys<T> = {
  [K in keyof T]: undefined extends Infer<T[K]> ? K : never;
}[keyof T];

/**
 * Extracts the keys of an object shape whose inferred output type does not accept `undefined`.
 */
type RequiredKeys<T> = Exclude<keyof T, OptionalKeys<T>>;

/**
 * Infers the TypeScript object type produced by validating an object shape schema.
 *
 * @typeParam T - Record of property names mapped to child validators.
 */
export type InferObject<T extends Record<string, Validator<unknown>>> = {
  [K in RequiredKeys<T>]: Infer<T[K]>;
} & {
  [K in OptionalKeys<T>]?: Infer<T[K]>;
};

/** Plain object accepted by object validators, including null-prototype objects. */
export type PlainObject = Record<string, unknown>;

/** Object validators returned by legacy `val.object()`. */
export interface ObjectValidators {
  /** Returns the input when it is a plain object and rejects arrays, null, and class instances. */
  plain(): ValidationResult<PlainObject>;
  /** Validates that all listed keys exist as own properties on the plain object. */
  hasKeys(keys: readonly string[]): ValidationResult<PlainObject>;
}

/**
 * Tests whether a value is a plain JavaScript object or a null-prototype object.
 *
 * @param value - Value to test.
 * @returns `true` if the value is a plain object, `false` otherwise.
 */
export const isPlainObject = (value: unknown): value is PlainObject => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isValidator = (value: unknown): value is Validator<unknown, unknown> => {
  return (
    value !== null && typeof value === "object" && typeof (value as { validate?: unknown }).validate === "function"
  );
};

/**
 * Schema validator for structured JavaScript objects.
 *
 * Validates individual properties against child schemas, supports stripping unknown
 * keys by default, strict unrecognized key detection, passthrough of extra keys,
 * and schema transformations like pick, omit, extend, and partial.
 *
 * @typeParam TShape - Object mapping string property names to validator schemas.
 */
export class ObjectValidator<TShape extends Record<string, Validator<unknown>>> extends BaseValidator<
  InferObject<TShape>,
  unknown
> {
  private mode: "strip" | "strict" | "passthrough" = "strip";
  private strictMessage?: string;

  /**
   * Constructs an ObjectValidator with the given property shape definition.
   *
   * @param _shape - Record of property names mapped to field schemas.
   */
  constructor(protected readonly _shape: TShape) {
    super();
  }

  /**
   * Returns the underlying shape record containing the property validators.
   */
  get shape(): TShape {
    return this._shape;
  }

  /**
   * Enforces that no unrecognized keys exist on the input object.
   *
   * @param message - Optional custom failure message for unrecognized keys.
   * @returns This validator instance for method chaining.
   */
  strict(message?: string): this {
    this.mode = "strict";
    this.strictMessage = message;
    return this;
  }

  /**
   * Configures the validator to preserve unrecognized keys in the output object.
   *
   * @returns This validator instance for method chaining.
   */
  passthrough(): this {
    this.mode = "passthrough";
    return this;
  }

  /**
   * Configures the validator to strip unrecognized keys from the output object (default behavior).
   *
   * @returns This validator instance for method chaining.
   */
  strip(): this {
    this.mode = "strip";
    return this;
  }

  /**
   * Extends this object schema with additional or overridden property schemas.
   *
   * @typeParam TExtra - Additional shape properties to merge into the schema.
   * @param extension - Record of additional property schemas.
   * @returns A new ObjectValidator containing the merged shape.
   */
  extend<TExtra extends Record<string, Validator<unknown>>>(extension: TExtra): ObjectValidator<TShape & TExtra> {
    const next = new ObjectValidator({
      ...this._shape,
      ...extension,
    });
    next.mode = this.mode;
    next.strictMessage = this.strictMessage;
    return next;
  }

  /**
   * Creates a new object schema retaining only the specified keys.
   *
   * @typeParam TKey - Keys to retain in the new schema.
   * @param keys - Array of property keys to keep.
   * @returns A new ObjectValidator containing only the selected keys.
   */
  pick<TKey extends keyof TShape>(keys: readonly TKey[]): ObjectValidator<Pick<TShape, TKey>> {
    const newShape = {} as Pick<TShape, TKey>;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(this._shape, key)) {
        newShape[key] = this._shape[key];
      }
    }
    const next = new ObjectValidator(newShape);
    next.mode = this.mode;
    next.strictMessage = this.strictMessage;
    return next;
  }

  /**
   * Creates a new object schema omitting the specified keys.
   *
   * @typeParam TKey - Keys to exclude from the new schema.
   * @param keys - Array of property keys to omit.
   * @returns A new ObjectValidator without the omitted keys.
   */
  omit<TKey extends keyof TShape>(keys: readonly TKey[]): ObjectValidator<Omit<TShape, TKey>> {
    const keySet = new Set<keyof TShape>(keys);
    const newShape = {} as Record<string, Validator<unknown, unknown>>;
    for (const [key, validator] of Object.entries(this._shape)) {
      if (!keySet.has(key as TKey)) {
        newShape[key] = validator;
      }
    }
    const next = new ObjectValidator(newShape as Omit<TShape, TKey>);
    next.mode = this.mode;
    next.strictMessage = this.strictMessage;
    return next;
  }

  /**
   * Returns a new object schema where all properties are optional.
   *
   * @returns A new ObjectValidator with all fields marked optional.
   */
  partial(): ObjectValidator<{ [K in keyof TShape]: Validator<Infer<TShape[K]> | undefined, unknown> }> {
    const newShape = {} as Record<string, Validator<unknown, unknown>>;
    for (const [key, validator] of Object.entries(this._shape)) {
      newShape[key] = validator.optional();
    }
    const next = new ObjectValidator(
      newShape as { [K in keyof TShape]: Validator<Infer<TShape[K]> | undefined, unknown> },
    );
    next.mode = this.mode;
    next.strictMessage = this.strictMessage;
    return next;
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<InferObject<TShape>> {
    if (!isPlainObject(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected object, got ${describeReceived(input)}`,
        expected: "plain object",
        received: describeReceived(input),
        input,
      });
    }

    const localIssues: ValidationIssue[] = [];
    const output: Record<string, unknown> = {};

    if (this.mode === "strict") {
      for (const key of Object.keys(input)) {
        if (!Object.prototype.hasOwnProperty.call(this._shape, key)) {
          const issue: ValidationIssue = {
            code: "invalid_value",
            message: this.strictMessage ?? `Unrecognized key: ${key}`,
            path: [...ctx.path, key],
          };
          if (ctx.options.includeInput) {
            issue.input = input[key];
          }
          localIssues.push(issue);
          ctx.addIssue(issue);
          if (ctx.options.abortEarly) {
            return ctx.fail(issue);
          }
        }
      }
    }

    for (const [key, childValidator] of Object.entries(this._shape)) {
      const childPath = [...ctx.path, key];
      const hasProp = Object.prototype.hasOwnProperty.call(input, key);
      const propValue = hasProp ? input[key] : undefined;
      const res = childValidator.validate(propValue, {
        ...ctx.options,
        path: childPath,
      });

      if (!res.ok) {
        if (res.error.issues && res.error.issues.length > 0) {
          for (const iss of res.error.issues) {
            localIssues.push(iss);
            ctx.addIssue(iss);
          }
        } else {
          localIssues.push(res.error);
          ctx.addIssue(res.error);
        }

        if (ctx.options.abortEarly) {
          return ctx.fail(localIssues[0]);
        }
      } else {
        if (res.value !== undefined || hasProp) {
          Object.defineProperty(output, key, {
            value: res.value,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
      }
    }

    if (this.mode === "passthrough") {
      for (const key of Object.keys(input)) {
        if (!Object.prototype.hasOwnProperty.call(this._shape, key)) {
          Object.defineProperty(output, key, {
            value: input[key],
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
      }
    }

    if (localIssues.length > 0) {
      if (localIssues.length === 1) {
        return ctx.fail(localIssues[0]);
      }
      return ctx.fail({
        code: localIssues[0]?.code ?? "invalid_value",
        message: localIssues[0]?.message ?? "Object validation failed",
        path: localIssues[0]?.path ?? ctx.path,
        issues: localIssues,
      });
    }

    return ctx.ok(output as InferObject<TShape>);
  }
}

/** Legacy object validator implementation for 0.0.1 compatibility. */
function legacyObject(value: unknown, options: ValidationOptions = {}): ObjectValidators {
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

/**
 * Creates an empty object schema validator.
 *
 * @returns A new empty ObjectValidator instance.
 */
export function object(): ObjectValidator<Record<string, never>>;
/**
 * Creates an object schema validator for a defined shape of field validators.
 *
 * @typeParam TShape - Schema mapping property names to child validators.
 * @param shape - Record mapping field names to validator schemas.
 * @returns A new ObjectValidator instance.
 */
export function object<TShape extends Record<string, Validator<unknown>>>(
  shape: [keyof TShape] extends [never] ? never : TShape,
): ObjectValidator<TShape>;
/**
 * Evaluates legacy object checks on an input value.
 *
 * Note: `object({})` is treated as a target object value for legacy validation;
 * call `object()` without arguments to construct an empty schema validator.
 *
 * @param value - Value to validate.
 * @param options - Validation options.
 * @returns Object providing legacy validation methods.
 */
export function object(value: unknown, options?: ValidationOptions): ObjectValidators;
/**
 * Creates an object validator schema or evaluates legacy object checks.
 *
 * @param shapeOrValue - Schema shape definition or target value to validate.
 * @param options - Optional validation options.
 * @returns An ObjectValidator or legacy ObjectValidators.
 */
export function object(
  shapeOrValue?: unknown,
  options?: ValidationOptions,
): ObjectValidator<Record<string, Validator<unknown>>> | ObjectValidators {
  if (options !== undefined || arguments.length >= 2) {
    return legacyObject(shapeOrValue, options);
  }

  if (arguments.length === 0) {
    return new ObjectValidator({});
  }

  if (shapeOrValue === undefined) {
    return legacyObject(shapeOrValue, options);
  }

  if (!isPlainObject(shapeOrValue)) {
    return legacyObject(shapeOrValue, options);
  }

  const values = Object.values(shapeOrValue);
  if (values.length === 0) {
    return legacyObject(shapeOrValue, options);
  }

  const isShape = values.every((v) => isValidator(v));

  if (isShape) {
    return new ObjectValidator(shapeOrValue as Record<string, Validator<unknown>>);
  }

  return legacyObject(shapeOrValue, options);
}
