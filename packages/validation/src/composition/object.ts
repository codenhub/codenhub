import { runOf, toolsOf } from "../core/child";
import { fieldFailureOf } from "../core/field-hook";
import { accepter, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { assertShape, isPlainObject, refuseObject, setOwn } from "../core/objects";
import { count, FAIL, under, type Pending, type Run, type Tools } from "../core/run";
import { split } from "../core/split";
import type {
  AnyValidator,
  AsyncRest,
  AsyncSchema,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
} from "../core/types";
import { TYPE_WORDS } from "../core/words";
import { waitFor, type Ending } from "./fields";
import type { Unknowns } from "./unknown-keys";

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

/** What a validator of unknown keys produces, or `never` when there is none. */
export type RestOf<TRest extends AnyValidator> = [TRest] extends [never] ? never : Infer<TRest>;

/** What a validator of unknown keys accepts, or `never` when there is none. */
export type RestInputOf<TRest extends AnyValidator> = [TRest] extends [never] ? never : InferInput<TRest>;

/**
 * The object type an object validator produces: that of the shape and, with a validator of unknown keys,
 * as `objectWithRest` takes, an index signature for the keys the shape does not list, which holds what
 * that validator produces or any listed property's type, so the type can be written as an object literal.
 *
 * @typeParam TShape - Property validators.
 * @typeParam TRest - The validator of unknown keys, or `never` when there is none.
 */
export type InferObject<TShape extends Shape, TRest extends AnyValidator = never> = WithRest<
  InferShape<TShape>,
  RestOf<TRest>
>;

/**
 * The object type that can pass an object validator: that of the shape and, with a validator of unknown
 * keys, as `objectWithRest` takes, an index signature for the keys the shape does not list, which holds
 * what that validator accepts or any listed property's input type, so the type can be written as an
 * object literal.
 *
 * @typeParam TShape - Property validators.
 * @typeParam TRest - The validator of unknown keys, or `never` when there is none.
 */
export type InferObjectInput<TShape extends Shape, TRest extends AnyValidator = never> = WithRest<
  InferShapeInput<TShape>,
  RestInputOf<TRest>
>;

/**
 * How an object treats the keys its shape does not list, as its description says it: `"strict"`,
 * `"passthrough"`, the validator of each, or undefined when it drops them.
 */
export type UnknownKeys = "strict" | "passthrough" | AnyValidator | undefined;

/** A way to treat unlisted keys, or what makes one of the validator of each and the helpers to wait for it. */
export type Way = Unknowns | ((runRest: Run, tools: Tools | undefined) => Unknowns);

/**
 * Makes an object validator: `object`, and each of the validators that treat unlisted keys another way,
 * which give theirs as `way` and say which it is as `unknownKeys`. So `object` carries no code for the
 * keys it drops. `pick` and the rest make the object they return with the way the one they were given
 * describes itself with.
 */
export function objectOf(shape: Shape, args: readonly unknown[], unknownKeys?: UnknownKeys, way?: Way): AnyValidator {
  assertShape(shape);
  // The shape is read once, so changing it after the validator is made changes nothing.
  const keys = Object.keys(shape);
  // The validators as they were read, which is what the description gives: reading the shape again would
  // read a getter twice, and could describe another validator than the one that runs.
  const read: Shape = {};
  const runs = keys.map((key) => {
    const validator = shape[key] as AnyValidator;
    const run = runOf(validator, `shape.${key}`);
    setOwn(read, key, validator);
    return run;
  });
  const [options, checks] = split<MessageOptions, Record<string, unknown>>(args);
  const { message } = options;
  // A validator of the unknown keys, which keeps them as passthrough does once each has passed it.
  const runRest = typeof unknownKeys === "function" ? runOf(unknownKeys, "rest") : undefined;
  const tools = toolsOf([...runs, runRest], waitsOf(checks));
  const unknowns = typeof way === "function" ? way(runRest as Run, tools) : way;
  const known = unknowns && new Set(keys);
  const accept = accepter(checks, message);
  const failFields = fieldFailureOf(checks, keys);
  const end: Ending = (from, output, failed) =>
    count() === from ? accept(output) : failFields === undefined ? FAIL : failFields(failed, output, message, from);
  const size = keys.length;

  const run: Run = (input) => {
    if (!isPlainObject(input)) {
      return refuseObject(input, message);
    }
    const start = count();
    // What is refused is reported, and what is kept is read, before any property is validated.
    const extra = unknowns?.[0](input, known as ReadonlySet<string>, message);
    const output: Record<string, unknown> = {};
    let mark = count();
    let failed: string[] | undefined;
    let waited: Pending[] | undefined;
    let waitedKeys: (string | undefined)[] | undefined;
    let marks: number[] | undefined;
    let present: boolean[] | undefined;
    // Each property is read as its validator runs, and every one of them before anything waits, so a
    // change made to the input while a validator waits reaches neither a validator nor the output.
    for (let index = 0; index < size; index += 1) {
      const key = keys[index] as string;
      const isPresent = Object.hasOwn(input, key);
      const value = (runs[index] as Run)(isPresent ? input[key] : undefined);
      if (value === FAIL) {
        mark = under(mark, key);
        (failed ??= []).push(key);
      } else if (tools !== undefined && tools.is(value)) {
        (waited ??= []).push(value);
        (waitedKeys ??= []).push(key);
        (marks ??= []).push(mark - start);
        (present ??= []).push(isPresent);
        // Holds the place of the key, so the output keeps the order of the shape.
        setOwn(output, key, undefined);
      } else if (value !== undefined || isPresent) {
        setOwn(output, key, value);
      }
    }
    if (extra !== undefined && unknowns?.[1] !== undefined) {
      const placed = unknowns[1](extra, output, message);
      if (tools !== undefined && tools.is(placed)) {
        (waited ??= []).push(placed);
        (waitedKeys ??= []).push(undefined);
        (marks ??= []).push(count() - start);
      }
    }
    return waited === undefined
      ? end(start, output, failed)
      : waitFor(
          tools as NonNullable<typeof tools>,
          start,
          waited,
          waitedKeys as (string | undefined)[],
          marks as number[],
          present,
          output,
          failed,
          end,
        );
  };
  run.w = tools;
  return toValidator(
    run,
    {
      kind: "object",
      options,
      checks,
      shape: Object.freeze(read),
      // How it treats unlisted keys, for a reader of the schema, and the code that does it, for `pick` and
      // the rest to make an object of the same kind. Absent for `object`, so a reader asking whether the key
      // is there reads its way right.
      ...(unknownKeys !== undefined && { unknownKeys }),
      ...(way !== undefined && { way }),
    },
    unknowns === undefined ? TYPE_WORDS : unknowns[2],
    [...Object.values(read), unknownKeys],
  );
}

/**
 * Creates a validator for plain objects with the given properties.
 *
 * @remarks
 * Only own properties are read, whether or not they are enumerable, and class instances and arrays are
 * not objects here. Every property is validated even when an earlier one failed, so the result lists
 * every problem. Issue paths lead from the object down to the property. The output is a new object; the
 * input is never modified. It is synchronous when every property validator is, and asynchronous
 * otherwise.
 *
 * A property the shape does not list is dropped from the output. `strictObject` refuses it,
 * `looseObject` keeps it as it is, and `objectWithRest` validates it.
 *
 * Each property is read as its validator runs, and every one of them before anything waits.
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
 * @param rest - Options, then checks, which run once every property has passed and see the whole object.
 * @returns A validator that produces an object.
 * @throws {TypeError} When `shape` is not a plain object, or a property validator is not a validator.
 */
export function object<TShape extends Shape>(
  shape: TShape,
  ...rest: Rest<InferObject<TShape>, MessageOptions>
): Composed<TShape[keyof TShape], InferObject<TShape>, InferObjectInput<TShape>>;
export function object<TShape extends Shape>(
  shape: TShape,
  ...rest: AsyncRest<InferObject<TShape>, MessageOptions>
): AsyncSchema<InferObject<TShape>, InferObjectInput<TShape>>;
export function object(shape: Shape, ...rest: unknown[]): AnyValidator {
  return objectOf(shape, rest);
}
