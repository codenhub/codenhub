import { BaseValidator, type Infer, type ValidationContext, type Validator } from "./core";
import { EnumValidator } from "./literal";
import { describeReceived, type ValidationIssue, type ValidationResult } from "./result";

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

/**
 * Recursively maps an object shape definition so that all nested object schemas and properties are optional.
 *
 * @typeParam TShape - Object shape schema record.
 */
export type DeepPartial<TShape extends Record<string, Validator<unknown>>> = {
  [K in keyof TShape]: TShape[K] extends ObjectValidator<infer SubShape>
    ? ObjectValidator<DeepPartial<SubShape>> extends Validator<infer O>
      ? Validator<O | undefined, unknown>
      : Validator<unknown | undefined, unknown>
    : Validator<Infer<TShape[K]> | undefined, unknown>;
};

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

/**
 * Schema validator for structured JavaScript objects.
 *
 * Validates individual properties against child schemas, supports stripping unknown
 * keys by default, strict unrecognized key detection, passthrough of extra keys,
 * and schema transformations like pick, omit, extend, merge, partial, and deepPartial.
 *
 * @typeParam TShape - Object mapping string property names to validator schemas.
 */
export class ObjectValidator<
  TShape extends Record<string, Validator<unknown>> = Record<string, never>,
> extends BaseValidator<InferObject<TShape>, unknown> {
  /**
   * Constructs an ObjectValidator with the given property shape definition and mode.
   *
   * @param _shape - Record of property names mapped to field schemas.
   * @param mode - Key handling mode: 'strip', 'strict', or 'passthrough'. Defaults to 'strip'.
   * @param strictMessage - Optional custom failure message used in strict mode.
   */
  constructor(
    protected readonly _shape: TShape,
    private readonly mode: "strip" | "strict" | "passthrough" = "strip",
    private readonly strictMessage?: string,
  ) {
    super();
  }

  /**
   * Returns the underlying shape record containing the property validators.
   */
  get shape(): TShape {
    return this._shape;
  }

  /**
   * Creates an immutable clone of this validator with updated configuration.
   *
   * @param mode - New key handling mode. Defaults to current mode.
   * @param strictMessage - Custom strict error message. Defaults to current message.
   * @returns A new cloned ObjectValidator instance.
   */
  clone(
    mode: "strip" | "strict" | "passthrough" = this.mode,
    strictMessage: string | undefined = this.strictMessage,
  ): ObjectValidator<TShape> {
    return new ObjectValidator(this._shape, mode, strictMessage);
  }

  /**
   * Enforces that no unrecognized keys exist on the input object.
   *
   * @param message - Optional custom failure message for unrecognized keys.
   * @returns A new immutable ObjectValidator in strict mode.
   */
  strict(message?: string): ObjectValidator<TShape> {
    return this.clone("strict", message);
  }

  /**
   * Configures the validator to preserve unrecognized keys in the output object.
   *
   * @returns A new immutable ObjectValidator in passthrough mode.
   */
  passthrough(): ObjectValidator<TShape> {
    return this.clone("passthrough", this.strictMessage);
  }

  /**
   * Configures the validator to strip unrecognized keys from the output object (default behavior).
   *
   * @returns A new immutable ObjectValidator in strip mode.
   */
  strip(): ObjectValidator<TShape> {
    return this.clone("strip", this.strictMessage);
  }

  /**
   * Extends this object schema with additional or overridden property schemas.
   *
   * @typeParam TExtra - Additional shape properties to merge into the schema.
   * @param extension - Record of additional property schemas.
   * @returns A new ObjectValidator containing the merged shape.
   */
  extend<TExtra extends Record<string, Validator<unknown>>>(extension: TExtra): ObjectValidator<TShape & TExtra> {
    return new ObjectValidator(
      {
        ...this._shape,
        ...extension,
      },
      this.mode,
      this.strictMessage,
    );
  }

  /**
   * Merges another object schema into this one, overwriting conflicting keys.
   *
   * @typeParam TExtra - Shape definition of the other object validator.
   * @param other - Another ObjectValidator whose shape will be merged in.
   * @returns A new ObjectValidator containing the merged shape.
   */
  merge<TExtra extends Record<string, Validator<unknown>>>(
    other: ObjectValidator<TExtra>,
  ): ObjectValidator<TShape & TExtra> {
    return new ObjectValidator(
      {
        ...this._shape,
        ...other.shape,
      },
      this.mode,
      this.strictMessage,
    );
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
    return new ObjectValidator(newShape, this.mode, this.strictMessage);
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
    const newShape = {} as Record<string, Validator<unknown>>;
    for (const [key, validator] of Object.entries(this._shape)) {
      if (!keySet.has(key as TKey)) {
        newShape[key] = validator;
      }
    }
    return new ObjectValidator(newShape as Omit<TShape, TKey>, this.mode, this.strictMessage);
  }

  /**
   * Returns a new object schema where all top-level properties are optional.
   *
   * @returns A new ObjectValidator with all fields marked optional.
   */
  partial(): ObjectValidator<{ [K in keyof TShape]: Validator<Infer<TShape[K]> | undefined, unknown> }> {
    const newShape = {} as Record<string, Validator<unknown>>;
    for (const [key, validator] of Object.entries(this._shape)) {
      newShape[key] = validator.optional();
    }
    return new ObjectValidator(
      newShape as { [K in keyof TShape]: Validator<Infer<TShape[K]> | undefined, unknown> },
      this.mode,
      this.strictMessage,
    );
  }

  /**
   * Returns a new object schema where all properties and nested object properties are recursively optional.
   *
   * @returns A new ObjectValidator with recursively optional fields.
   */
  deepPartial(): ObjectValidator<DeepPartial<TShape>> {
    const newShape = {} as Record<string, Validator<unknown>>;
    for (const [key, validator] of Object.entries(this._shape)) {
      let target: unknown = validator;
      while (
        target !== null &&
        typeof target === "object" &&
        "inner" in target &&
        (target as { inner?: unknown }).inner !== undefined
      ) {
        if (target instanceof ObjectValidator) {
          break;
        }
        target = (target as { inner: unknown }).inner;
      }

      if (target instanceof ObjectValidator) {
        newShape[key] = (target as ObjectValidator<Record<string, Validator<unknown>>>).deepPartial().optional();
      } else {
        newShape[key] = validator.optional();
      }
    }
    return new ObjectValidator(newShape as DeepPartial<TShape>, this.mode, this.strictMessage);
  }

  /**
   * Creates an EnumValidator from the keys of this object shape.
   *
   * @returns An EnumValidator accepting any valid key from this schema.
   */
  keyof(): EnumValidator<keyof TShape & (string | number)> {
    const keys = Object.keys(this._shape) as (keyof TShape & (string | number))[];
    return new EnumValidator(keys);
  }

  protected override isAsync(): boolean {
    return Object.values(this._shape).some((child) =>
      child instanceof BaseValidator ? (child as unknown as { isAsync(): boolean }).isAsync() : false,
    );
  }

  protected _validate(input: unknown, ctx: ValidationContext): ValidationResult<InferObject<TShape>> {
    if (!isPlainObject(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected object, got ${describeReceived(input)}`,
        expected: "plain object",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
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

  protected override async _validateAsync(
    input: unknown,
    ctx: ValidationContext,
  ): Promise<ValidationResult<InferObject<TShape>>> {
    if (!isPlainObject(input)) {
      return ctx.fail({
        code: "invalid_type",
        message: `Expected object, got ${describeReceived(input)}`,
        expected: "plain object",
        received: describeReceived(input),
        input: ctx.options.includeInput ? input : undefined,
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

    /* oxlint-disable no-await-in-loop */
    for (const [key, childValidator] of Object.entries(this._shape)) {
      const childPath = [...ctx.path, key];
      const hasProp = Object.prototype.hasOwnProperty.call(input, key);
      const propValue = hasProp ? input[key] : undefined;
      const res = await childValidator.validateAsync(propValue, {
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
    /* oxlint-enable no-await-in-loop */

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

/**
 * Creates an object schema validator for a defined shape of field validators, or an empty object schema.
 *
 * @typeParam TShape - Schema mapping property names to child validators.
 * @param shape - Optional record mapping field names to validator schemas.
 * @returns A new ObjectValidator instance.
 */
export function object<TShape extends Record<string, Validator<unknown>> = Record<string, never>>(
  shape?: TShape,
): ObjectValidator<TShape> {
  return new ObjectValidator((shape ?? {}) as TShape);
}
