import { chain, collect, runEach, type Maybe } from "../core/async";
import { report, tail } from "../core/checks";
import { described } from "../core/describe";
import { fieldFailureOf } from "../core/field-hook";
import { cap, MAX_ISSUES } from "../core/limit";
import { append, childOf, composed, fastOf, MISS, type Child, type Fast } from "../core/nesting";
import { assertShape, isPlainObject, objectIssue, setOwn } from "../core/objects";
import { assertFunction, failWith, issue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncSchema,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
  ValidationIssue,
  ValidationResult,
} from "../core/types";

/** Maps property names to the validators of their values. */
export type Shape = Record<string, AnyValidator>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type OptionalKeys<TShape extends Shape> = {
  [K in keyof TShape]: undefined extends Infer<TShape[K]> ? K : never;
}[keyof TShape];

/**
 * The object type a shape produces. A property whose validator accepts `undefined` becomes optional.
 *
 * @typeParam TShape - Property validators.
 */
export type InferShape<TShape extends Shape> = Simplify<
  { [K in Exclude<keyof TShape, OptionalKeys<TShape>>]: Infer<TShape[K]> } & {
    [K in OptionalKeys<TShape>]?: Infer<TShape[K]>;
  }
>;

type OptionalInputKeys<TShape extends Shape> = {
  [K in keyof TShape]: undefined extends InferInput<TShape[K]> ? K : never;
}[keyof TShape];

/**
 * The object type that can pass a shape. A property whose validator accepts `undefined` is optional, so one
 * with a default is optional here and present in what the shape produces.
 *
 * @typeParam TShape - Property validators.
 */
export type InferShapeInput<TShape extends Shape> = Simplify<
  { [K in Exclude<keyof TShape, OptionalInputKeys<TShape>>]: InferInput<TShape[K]> } & {
    [K in OptionalInputKeys<TShape>]?: InferInput<TShape[K]>;
  }
>;

/** Options for {@link object}. */
export interface ObjectOptions extends MessageOptions {
  /**
   * What to do with input properties the shape does not list. `"strip"` drops them from the output,
   * `"strict"` rejects each with an `unrecognized_key` issue, up to the 1,000 issues a collection reports, and `"passthrough"` copies them to the
   * output unchecked.
   *
   * @defaultValue "strip"
   */
  unknownKeys?: "strip" | "strict" | "passthrough" | undefined;
}

/**
 * Creates a validator for plain objects with the given properties.
 *
 * @remarks
 * Only own properties are read, a listed one whether or not it is enumerable and an unlisted one only when it
 * is, and class instances and arrays are not objects here. Every
 * property is validated even when an earlier one failed, so the result lists every problem. Issue
 * paths lead from the object down to the property. The output is a new object; the input is never
 * modified. It is synchronous when every property validator is, and asynchronous otherwise.
 * A getter or `Proxy` trap in the input that throws while it is read propagates, as a callback's
 * exception does; data parsed from JSON has none.
 *
 * @example
 * ```ts
 * const user = object({ name: string({ min: 2 }), age: optional(number({ int: true })) });
 * user({ name: "Ada" }); // { ok: true, value: { name: "Ada" } }
 * user({ name: "A" }); // { ok: false, error: { issues: [{ code: "too_small", path: ["name"], ... }] } }
 *
 * const signup = object(
 *   { password: string({ min: 8 }), confirm: string() },
 *   check((data) => data.password === data.confirm, { path: ["confirm"], message: "Passwords must match" }),
 * );
 * ```
 *
 * @typeParam TShape - Property validators.
 * @param shape - Validator of each property.
 * @param rest - Options, including how to treat properties the shape does not list, then checks,
 * which run once every property has passed and see the whole object.
 * @returns A validator that produces an object.
 * @throws {TypeError} When `shape` is not a plain object, a property validator is not a function, or
 * `unknownKeys` is not `"strip"`, `"strict"` or `"passthrough"`.
 */
export function object<TShape extends Shape>(
  shape: TShape,
  ...rest: Rest<InferShape<TShape>, ObjectOptions>
): Composed<TShape[keyof TShape], InferShape<TShape>, InferShapeInput<TShape>>;
export function object<TShape extends Shape>(
  shape: TShape,
  ...rest: AsyncRest<InferShape<TShape>, ObjectOptions>
): AsyncSchema<InferShape<TShape>, InferShapeInput<TShape>>;
export function object(shape: Shape, ...rest: unknown[]): AnyValidator {
  assertShape(shape);
  // The shape is read once, so changing it after the validator is made changes nothing.
  const keys = Object.keys(shape);
  // The validators as they were read, which is what the description gives: reading the shape again would
  // read a getter twice, and could describe another validator than the one that runs.
  const read: Shape = {};
  const children = keys.map((key) => {
    const validator: unknown = shape[key];
    assertFunction(`shape.${key}`, validator);
    setOwn(read, key, validator);
    return childOf(validator as AnyValidator);
  });
  const known = new Set(keys);
  const [options, reject, accept, checks] = tail<ObjectOptions, Record<string, unknown>>(rest, "unknownKeys");
  const failFields = fieldFailureOf(checks, keys);
  const unknownKeys = options.unknownKeys ?? "strip";
  if (unknownKeys !== "strip" && unknownKeys !== "strict" && unknownKeys !== "passthrough") {
    throw new TypeError(`unknownKeys must be "strip", "strict" or "passthrough", received "${String(unknownKeys)}"`);
  }

  // Valid input is answered without a list or a result for each property, when every property has a fast
  // test and no check waits for the whole object; any miss runs the full work below, which says why.
  const fastChildren = keys.map((key) => fastOf(read[key]));
  const fast: Fast | undefined =
    checks.length > 0 || fastChildren.includes(undefined)
      ? undefined
      : (input) => {
          if (!isPlainObject(input)) {
            return MISS;
          }
          if (unknownKeys === "strict" && Object.keys(input).some((key) => !known.has(key))) {
            return MISS;
          }
          const output: Record<string, unknown> = {};
          for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index] as string;
            const isPresent = Object.hasOwn(input, key);
            const value = (fastChildren[index] as Fast)(isPresent ? input[key] : undefined);
            if (value === MISS) {
              return MISS;
            }
            if (value !== undefined || isPresent) {
              setOwn(output, key, value);
            }
          }
          if (unknownKeys === "passthrough") {
            for (const key of Object.keys(input)) {
              if (!known.has(key)) {
                setOwn(output, key, input[key]);
              }
            }
          }
          return output;
        };

  const validator = composed((input, place): Maybe<ValidationResult<unknown>> => {
    if (!isPlainObject(input)) {
      return reject([objectIssue(input)], place);
    }

    const issues: ValidationIssue[] = [];
    if (unknownKeys === "strict") {
      const unrecognized = Object.keys(input).filter((key) => !known.has(key));
      // The sender adds as many keys as it likes, so they are listed up to the limit of a collection.
      const listed = unrecognized.slice(0, MAX_ISSUES).map((key) => issue("unrecognized_key", { key }, [key]));
      append(
        issues,
        cap(report(listed, place, options.message), place, options.message, unrecognized.length > MAX_ISSUES),
      );
    }

    // Everything the output takes from the input is read before any child runs, so neither a child that
    // changes the input nor a change made while one waits can reach the output.
    const present: boolean[] = [];
    const values: unknown[] = [];
    for (const key of keys) {
      const isPresent = Object.hasOwn(input, key);
      present.push(isPresent);
      values.push(isPresent ? input[key] : undefined);
    }
    const extra =
      unknownKeys === "passthrough"
        ? Object.keys(input)
            .filter((key) => !known.has(key))
            .map((key) => [key, input[key]] as const)
        : undefined;
    const results = runEach(values.length, (index) =>
      (children[index] as Child)(values[index], place, keys[index] as string),
    );
    return chain(collect(results), (settled) => {
      const output: Record<string, unknown> = {};
      for (let index = 0; index < settled.length; index += 1) {
        const result = settled[index] as ValidationResult<unknown>;
        if (!result.ok) {
          append(issues, result.error.issues);
        } else if (result.value !== undefined || present[index]) {
          setOwn(output, keys[index] as string, result.value);
        }
      }
      if (issues.length > 0) {
        return failFields === undefined
          ? failWith(issues)
          : failFields(issues, settled, output, options.message, place);
      }
      for (const [key, value] of extra ?? []) {
        setOwn(output, key, value);
      }
      return accept(output, place);
    });
  }, fast);
  return described(validator, { kind: "object", options, checks, shape: Object.freeze(read) });
}
