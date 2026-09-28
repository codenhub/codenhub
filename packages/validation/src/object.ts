import { chain, collect, type MaybePromise } from "./async";
import { execute, OptionalValidator, Validator, type AnyValidator, type Infer } from "./core";
import {
  childContext,
  createIssue,
  failWith,
  invalidType,
  isPlainObject,
  pass,
  setOwn,
  type Outcome,
  type ParseContext,
} from "./internal";
import { type Message, type ValidationIssue } from "./issue";
import { EnumValidator } from "./literal";

/** Maps property names to the validators of their values. */
export type Shape = Record<string, AnyValidator>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type OptionalKeys<TShape extends Shape> = {
  [K in keyof TShape]: undefined extends Infer<TShape[K]> ? K : never;
}[keyof TShape];

/**
 * Infers the object type a shape produces. A property whose validator accepts `undefined` becomes optional.
 *
 * @typeParam TShape - Property validators.
 */
export type InferObject<TShape extends Shape> = Simplify<
  { [K in Exclude<keyof TShape, OptionalKeys<TShape>>]: Infer<TShape[K]> } & {
    [K in OptionalKeys<TShape>]?: Infer<TShape[K]>;
  }
>;

type Partialized<TShape extends Shape> = { [K in keyof TShape]: OptionalValidator<Infer<TShape[K]>> };
type Requirement<TShape extends Shape, TKey extends keyof TShape> = {
  [K in keyof TShape]: K extends TKey ? Validator<Exclude<Infer<TShape[K]>, undefined>> : TShape[K];
};

/** How a validator treats input properties its shape does not list. */
type UnknownKeys = "strip" | "strict" | "passthrough";

/**
 * Validator for plain objects, created by {@link object}.
 *
 * Only own enumerable properties are read. Class instances and arrays are not objects here.
 * Unlisted properties are dropped from the output unless {@link ObjectValidator.passthrough} or
 * {@link ObjectValidator.strict} says otherwise.
 *
 * @typeParam TShape - Property validators.
 */
export class ObjectValidator<TShape extends Shape> extends Validator<InferObject<TShape>> {
  /**
   * Creates an object validator.
   *
   * @param shape - Validator of each property.
   * @param unknownKeys - What to do with input properties the shape does not list.
   * @param message - Message when the input is not a plain object.
   */
  constructor(
    readonly shape: TShape,
    private readonly unknownKeys: UnknownKeys = "strip",
    private readonly message?: Message,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<InferObject<TShape>>> {
    if (!isPlainObject(input)) {
      return invalidType(ctx, "object", input, this.message);
    }

    const keys = Object.keys(this.shape);
    const issues: ValidationIssue[] = [];
    if (this.unknownKeys === "strict") {
      for (const key of Object.keys(input)) {
        if (issues.length > 0 && ctx.options.abortEarly === true) {
          break;
        }
        if (!Object.hasOwn(this.shape, key)) {
          issues.push(
            createIssue(childContext(ctx, key), {
              code: "unrecognized_key",
              message: `Unrecognized key "${key}"`,
              params: { key },
            }),
          );
        }
      }
      if (issues.length > 0 && ctx.options.abortEarly === true) {
        return failWith(issues);
      }
    }

    return chain(
      collect(
        keys.length,
        (index) => {
          const key = keys[index] as string;
          return execute(
            this.shape[key] as AnyValidator,
            Object.hasOwn(input, key) ? input[key] : undefined,
            childContext(ctx, key),
          );
        },
        ctx.options.abortEarly === true ? (outcome) => !outcome.ok : undefined,
      ),
      (outcomes) => {
        const output: Record<string, unknown> = {};
        outcomes.forEach((outcome, index) => {
          const key = keys[index] as string;
          if (!outcome.ok) {
            issues.push(...outcome.issues);
          } else if (outcome.value !== undefined || Object.hasOwn(input, key)) {
            setOwn(output, key, outcome.value);
          }
        });
        if (issues.length > 0) {
          return failWith(issues);
        }
        if (this.unknownKeys === "passthrough") {
          for (const key of Object.keys(input)) {
            if (!Object.hasOwn(this.shape, key)) {
              setOwn(output, key, input[key]);
            }
          }
        }
        return pass(output as InferObject<TShape>);
      },
    );
  }

  /**
   * Rejects input properties the shape does not list, with an `unrecognized_key` issue each.
   *
   * @returns A copy in strict mode, keeping its rules.
   */
  strict(): this {
    return this.derive({ unknownKeys: "strict" });
  }

  /**
   * Copies input properties the shape does not list to the output unchanged and unvalidated.
   *
   * @returns A copy in passthrough mode, keeping its rules.
   */
  passthrough(): this {
    return this.derive({ unknownKeys: "passthrough" });
  }

  /**
   * Drops input properties the shape does not list from the output. This is the default.
   *
   * @returns A copy in strip mode, keeping its rules.
   */
  strip(): this {
    return this.derive({ unknownKeys: "strip" });
  }

  /**
   * Adds properties, replacing any with the same name. Rules added with `refine` or `check` are not kept.
   *
   * @typeParam TExtra - Shape of the added properties.
   * @param extra - Validators of the added properties.
   * @returns A validator for the combined shape.
   */
  extend<TExtra extends Shape>(extra: TExtra): ObjectValidator<Omit<TShape, keyof TExtra> & TExtra> {
    const shape = { ...this.shape, ...extra } as unknown as Omit<TShape, keyof TExtra> & TExtra;
    return new ObjectValidator(shape, this.unknownKeys, this.message);
  }

  /**
   * Keeps only the listed properties. Rules added with `refine` or `check` are not kept.
   *
   * @typeParam TKey - Names of the properties to keep.
   * @param keys - Names of the properties to keep.
   * @returns A validator for the smaller shape.
   */
  pick<TKey extends keyof TShape & string>(keys: readonly TKey[]): ObjectValidator<Pick<TShape, TKey>> {
    const picked = Object.fromEntries(keys.map((key) => [key, this.shape[key]]));
    return new ObjectValidator(picked as Pick<TShape, TKey>, this.unknownKeys, this.message);
  }

  /**
   * Removes the listed properties. Rules added with `refine` or `check` are not kept.
   *
   * @typeParam TKey - Names of the properties to remove.
   * @param keys - Names of the properties to remove.
   * @returns A validator for the smaller shape.
   */
  omit<TKey extends keyof TShape & string>(keys: readonly TKey[]): ObjectValidator<Omit<TShape, TKey>> {
    const omitted = new Set<string>(keys);
    const kept = Object.entries(this.shape).filter(([key]) => !omitted.has(key));
    return new ObjectValidator(Object.fromEntries(kept) as Omit<TShape, TKey>, this.unknownKeys, this.message);
  }

  /**
   * Makes every property optional. Rules added with `refine` or `check` are not kept.
   *
   * @returns A validator whose properties all accept `undefined`.
   */
  partial(): ObjectValidator<Partialized<TShape>> {
    const optional = Object.entries(this.shape).map(([key, validator]) => [key, validator.optional()]);
    return new ObjectValidator(Object.fromEntries(optional) as Partialized<TShape>, this.unknownKeys, this.message);
  }

  /**
   * Makes the listed properties required again by unwrapping their `.optional()`. A property that
   * is not wrapped by `.optional()` at its top level is left as it is. Rules added with `refine`
   * or `check` are not kept.
   *
   * @typeParam TKey - Names of the properties to require.
   * @param keys - Names of the properties to require. All of them when omitted.
   * @returns A validator whose listed properties no longer accept `undefined`.
   */
  required<TKey extends keyof TShape & string = keyof TShape & string>(
    keys?: readonly TKey[],
  ): ObjectValidator<Requirement<TShape, TKey>> {
    const listed = keys === undefined ? undefined : new Set<string>(keys);
    const required = Object.entries(this.shape).map(([key, validator]) => [
      key,
      (listed === undefined || listed.has(key)) && validator instanceof OptionalValidator
        ? (validator.inner as AnyValidator)
        : validator,
    ]);
    return new ObjectValidator(
      Object.fromEntries(required) as Requirement<TShape, TKey>,
      this.unknownKeys,
      this.message,
    );
  }

  /**
   * Builds an enum validator from the property names.
   *
   * @returns A validator that accepts any of this object's keys.
   */
  keyof(): EnumValidator<keyof TShape & string> {
    return new EnumValidator(Object.keys(this.shape) as (keyof TShape & string)[]);
  }
}

/**
 * Creates a validator for plain objects with the given properties.
 *
 * @example
 * ```ts
 * const user = val.object({ name: val.string(), age: val.number().optional() });
 * ```
 *
 * @typeParam TShape - Property validators.
 * @param shape - Validator of each property.
 * @param message - Message when the input is not a plain object.
 * @returns An object validator.
 */
export function object<TShape extends Shape>(shape: TShape, message?: Message): ObjectValidator<TShape> {
  return new ObjectValidator(shape, "strip", message);
}
