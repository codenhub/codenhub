import { chain, collect, runEach, type Maybe } from "../core/async";
import { report, tail } from "../core/checks";
import { described } from "../core/describe";
import { fieldFailureOf } from "../core/field-hook";
import { cap, countIssues, MAX_ISSUES, runItems } from "../core/limit";
import { mixedRunOf } from "../core/mixed";
import { append, childOf, composed, fastOf, MISS, type Child, type Fast } from "../core/nesting";
import { assertShape, isPlainObject, objectIssue, setOwn } from "../core/objects";
import { assertFunction, failWith, issue, RESERVED_KEY, reservedKey } from "../core/result";
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
  {
    [K in Exclude<keyof TShape, OptionalInputKeys<TShape>>]: InferInput<TShape[K]>;
  } & {
    [K in OptionalInputKeys<TShape>]?: InferInput<TShape[K]>;
  }
>;

/**
 * An object type with an index signature for the keys it does not list, when `TValue` is not `never`. The
 * signature holds `TValue` and the type of every listed property too, so a value of the type can be
 * written as an object literal: a signature of `TValue` alone would also cover the listed keys, and refuse
 * `{ name: "Ada" }` beside unlisted numbers.
 *
 * @typeParam T - The listed properties.
 * @typeParam TValue - What each unlisted key holds.
 */
export type WithRest<T, TValue> = [TValue] extends [never] ? T : Simplify<T & { [key: string]: TValue | T[keyof T] }>;

/** What `unknownKeys` may be given. */
export type UnknownKeys = "strip" | "strict" | "passthrough" | AnyValidator;

/** The validator `unknownKeys` was given, or `never` when it was given a mode. */
export type RestIn<TUnknownKeys> = Extract<TUnknownKeys, AnyValidator>;

/** What a validator of unknown keys produces, or `never` when there is none. */
export type RestOf<TRest extends AnyValidator> = [TRest] extends [never] ? never : Infer<TRest>;

/** What a validator of unknown keys accepts, or `never` when there is none. */
export type RestInputOf<TRest extends AnyValidator> = [TRest] extends [never] ? never : InferInput<TRest>;

/**
 * The object type {@link object} produces: that of the shape and, with a validator of unknown keys, an
 * index signature for the keys the shape does not list, as {@link WithRest} writes it.
 *
 * @typeParam TShape - Property validators.
 * @typeParam TRest - The validator of unknown keys, or `never` when there is none.
 */
export type InferObject<TShape extends Shape, TRest extends AnyValidator = never> = WithRest<
  InferShape<TShape>,
  RestOf<TRest>
>;

/**
 * The object type that can pass {@link object}: that of the shape and, with a validator of unknown keys,
 * an index signature for the keys the shape does not list, as {@link WithRest} writes it.
 *
 * @typeParam TShape - Property validators.
 * @typeParam TRest - The validator of unknown keys, or `never` when there is none.
 */
export type InferObjectInput<TShape extends Shape, TRest extends AnyValidator = never> = WithRest<
  InferShapeInput<TShape>,
  RestInputOf<TRest>
>;

/**
 * Options for {@link object}.
 *
 * @typeParam TUnknownKeys - What `unknownKeys` is given, a mode or a validator.
 */
export interface ObjectOptions<TUnknownKeys extends UnknownKeys = UnknownKeys> extends MessageOptions {
  /**
   * What to do with input properties the shape does not list. `"strip"` drops them from the output,
   * `"strict"` rejects each with an `unrecognized_key` issue, up to the 1,000 issues a collection
   * reports, and `"passthrough"` copies them to the output unchecked, except `__proto__`, which it rejects with an `invalid_key` issue: copied, it would
   * become the prototype of any copy of the output made by assignment. A shape that lists `__proto__`
   * keeps it, as data.
   *
   * A validator validates each of them, and the output keeps what it produces, after the listed properties
   * and in the order of the input. Its issues are at the key's path, after those of the listed properties,
   * and stop at the 1,000 issues a collection reports. An unlisted `__proto__` is rejected with an
   * `invalid_key` issue, as a `record` rejects it, and its value is still validated. The object is
   * asynchronous when this validator is. Its type gains an index signature that holds what the
   * validator produces and what the listed properties hold, so that an object literal can be written
   * with both.
   *
   * @defaultValue "strip"
   */
  unknownKeys?: TUnknownKeys | undefined;
}

/**
 * Creates a validator for plain objects with the given properties.
 *
 * @remarks
 * Only own properties are read, a listed one whether or not it is enumerable and an unlisted one only when it
 * is, and class instances and arrays are not objects here. Every
 * property is validated even when an earlier one failed, so the result lists every problem. Issue
 * paths lead from the object down to the property. The output is a new object; the input is never
 * modified. It is synchronous when every property validator, and a validator given as `unknownKeys`,
 * is, and asynchronous otherwise.
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
 *
 * const flags = object({ name: string() }, { unknownKeys: boolean() });
 * flags({ name: "Ada", beta: true }); // { ok: true, value: { name: "Ada", beta: true } }
 * ```
 *
 * @typeParam TShape - Property validators.
 * @typeParam TUnknownKeys - What `unknownKeys` is given, a mode or a validator.
 * @param shape - Validator of each property.
 * @param rest - Options, including how to treat properties the shape does not list, then checks,
 * which run once every property has passed and see the whole object.
 * @returns A validator that produces an object.
 * @throws {TypeError} When `shape` is not a plain object, a property validator is not a function, or
 * `unknownKeys` is not `"strip"`, `"strict"`, `"passthrough"` or a validator.
 */
export function object<TShape extends Shape, TUnknownKeys extends UnknownKeys = "strip">(
  shape: TShape,
  ...rest: Rest<InferObject<TShape, RestIn<TUnknownKeys>>, ObjectOptions<TUnknownKeys>>
): Composed<
  TShape[keyof TShape] | RestIn<TUnknownKeys>,
  InferObject<TShape, RestIn<TUnknownKeys>>,
  InferObjectInput<TShape, RestIn<TUnknownKeys>>
>;
export function object<TShape extends Shape, TUnknownKeys extends UnknownKeys = "strip">(
  shape: TShape,
  ...rest: AsyncRest<InferObject<TShape, RestIn<TUnknownKeys>>, ObjectOptions<TUnknownKeys>>
): AsyncSchema<InferObject<TShape, RestIn<TUnknownKeys>>, InferObjectInput<TShape, RestIn<TUnknownKeys>>>;
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
  // A validator of the unknown keys, which keeps them as passthrough does once each has passed it.
  const restChild = typeof unknownKeys === "function" ? childOf(unknownKeys) : undefined;
  if (restChild === undefined && unknownKeys !== "strip" && unknownKeys !== "strict" && unknownKeys !== "passthrough") {
    throw new TypeError(
      `unknownKeys must be "strip", "strict", "passthrough" or a validator, received "${String(unknownKeys)}"`,
    );
  }
  const isKept = restChild !== undefined || unknownKeys === "passthrough";

  // Valid input is answered without a list or a result for each property, when every property, and the
  // validator of the unknown keys, has a fast test; any miss runs the full work below, which says why.
  const fastChildren = keys.map((key) => fastOf(read[key]));
  const fastRest = fastOf(unknownKeys);
  const childrenFast: Fast | undefined =
    fastChildren.includes(undefined) || (restChild !== undefined && fastRest === undefined)
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
          if (isKept) {
            for (const key of Object.keys(input)) {
              if (!known.has(key)) {
                const value = key === RESERVED_KEY ? MISS : fastRest === undefined ? input[key] : fastRest(input[key]);
                if (value === MISS) {
                  return MISS;
                }
                setOwn(output, key, value);
              }
            }
          }
          return output;
        };
  // An object with checks has no fast test of its own, since a parent that missed would run them again.
  // Its work still asks its properties' fast tests first, and runs the checks once on what they produced.
  const fast = checks.length > 0 ? undefined : childrenFast;
  const fastChecked = checks.length > 0 ? childrenFast : undefined;
  // A shape some of whose properties have no fast test, such as one with a `transform` property, asks the
  // others' first and runs each of these once, when a validator that leaves one without has turned it on. It
  // copies the unknown keys it is given, so an object with a validator of them does its full work.
  const mixedRun = childrenFast === undefined && restChild === undefined ? mixedRunOf() : undefined;

  const validator = composed((input, place): Maybe<ValidationResult<unknown>> => {
    if (fastChecked !== undefined) {
      const value = fastChecked(input);
      if (value !== MISS) {
        return accept(value as Record<string, unknown>, place);
      }
    }
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
    const extra = isKept
      ? Object.keys(input)
          .filter((key) => !known.has(key))
          .map((key) => [key, input[key]] as const)
      : [];
    if (restChild === undefined && extra.some(([key]) => key === RESERVED_KEY)) {
      // Copied, it would be the prototype of whatever the output is next assigned to.
      append(issues, report([reservedKey(RESERVED_KEY)], place, options.message));
    }
    const shaped =
      mixedRun === undefined || issues.length > 0
        ? runEach(values.length, (index) => (children[index] as Child)(values[index], place, keys[index] as string))
        : mixedRun(keys, children, fastChildren, values, present, extra, place);
    if (!Array.isArray(shaped)) {
      return accept(shaped, place);
    }
    // The unknown keys follow the properties in one list, and stop at the limit of a collection, since the
    // sender adds as many as it likes.
    const results =
      restChild === undefined
        ? shaped
        : runItems(
            extra.length,
            (index) => restChild(extra[index]?.[1], place, extra[index]?.[0] as string),
            countIssues,
            0,
            0,
            shaped,
          );
    return chain(collect(results), (settled) => {
      const output: Record<string, unknown> = {};
      for (let index = 0; index < keys.length; index += 1) {
        const result = settled[index] as ValidationResult<unknown>;
        if (!result.ok) {
          append(issues, result.error.issues);
        } else if (result.value !== undefined || present[index]) {
          setOwn(output, keys[index] as string, result.value);
        }
      }
      // What the validator of the unknown keys found, listed and cut as a record lists and cuts it.
      const found: ValidationIssue[] = [];
      for (let index = keys.length; index < settled.length; index += 1) {
        const result = settled[index] as ValidationResult<unknown>;
        const key = extra[index - keys.length]?.[0] as string;
        if (!result.ok) {
          append(found, result.error.issues);
        }
        if (key === RESERVED_KEY) {
          // Kept, it would be the prototype of whatever the output is next assigned to, as in a record.
          append(found, report([reservedKey(key)], place, options.message));
        } else if (result.ok) {
          setOwn(output, key, result.value);
        }
      }
      append(
        issues,
        cap(found, place, options.message, restChild !== undefined && settled.length < keys.length + extra.length),
      );
      if (issues.length > 0) {
        return failFields === undefined
          ? failWith(issues)
          : failFields(issues, settled, output, options.message, place);
      }
      if (restChild === undefined) {
        for (const [key, value] of extra) {
          setOwn(output, key, value);
        }
      }
      return accept(output, place);
    });
  }, fast);
  return described(validator, {
    kind: "object",
    options,
    checks,
    shape: Object.freeze(read),
  });
}
