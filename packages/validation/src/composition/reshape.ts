/*
 * Validators made from the parts of an `object` validator: `pick`, `omit`, `required`, `extend`, and `partial` given
 * a validator. Each reads the shape and options the object describes itself with, changes the shape, and
 * makes a new `object` of it, so what it returns is an `object` like any other.
 */
import { describe } from "../core/describe";
import { assertShape, isPlainObject } from "../core/objects";
import { assertList } from "../core/result";
import type { AnyValidator, AsyncSchema, Composed, Schema, Validator } from "../core/types";
import { nullable } from "./nullable";
import {
  object,
  type ObjectOptions,
  type RestIn,
  type RestInputOf,
  type RestOf,
  type Shape,
  type WithRest,
} from "./object";

/** A validator of `T` that is synchronous when the validator it was made from is. */
export type Reshaped<TValidator extends AnyValidator, T, TInput = unknown> =
  TValidator extends Validator<unknown> ? Schema<T, TInput> : AsyncSchema<T, TInput>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The properties an object type lists, without the index signature of an object with a validator of unknown keys. */
export type Listed<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

/** What the index signature of an object type holds, or `never` when it has none. */
export type Unlisted<T> = string extends keyof T ? T[string] : never;

/** The names of the properties an object type lists, which `pick` and `omit` take. */
export type ListedKey<T> = keyof Listed<T>;

/** The object type with `TValue` added to what its unlisted keys hold, as a validator of unknown keys given to a reshaping function adds it. */
export type Reindexed<T, TValue> = [TValue] extends [never] ? T : WithRest<Listed<T>, Unlisted<T> | TValue>;

/** `T` with what the validator of unknown keys in `TUnknownKeys`, if it is one, produces added to what its unlisted keys hold. */
export type Remade<T, TUnknownKeys> = Reindexed<T, RestOf<RestIn<TUnknownKeys>>>;

/** `T` with what the validator of unknown keys in `TUnknownKeys`, if it is one, accepts added to what its unlisted keys hold. */
export type RemadeInput<T, TUnknownKeys> = Reindexed<T, RestInputOf<RestIn<TUnknownKeys>>>;

/**
 * A validator of `T` that is synchronous when the validator it was made from, and the validator of
 * unknown keys in `TUnknownKeys` if it is one, are.
 */
export type ReshapedWith<TValidator extends AnyValidator, TUnknownKeys, T, TInput> = [RestIn<TUnknownKeys>] extends [
  never,
]
  ? Reshaped<TValidator, T, TInput>
  : Composed<TValidator | RestIn<TUnknownKeys>, T, TInput>;

/** The object type with only the properties named, and the index signature it had. */
export type Picked<T, K extends keyof Listed<T>> = WithRest<Simplify<Pick<Listed<T>, K>>, Unlisted<T>>;

/** The object type without the properties named, and with the index signature it had. */
export type Omitted<T, K extends keyof T> = WithRest<Simplify<Omit<Listed<T>, K>>, Unlisted<T>>;

/**
 * The object type with every property present and none of them `undefined`, and the index signature it
 * had. A property typed `unknown` or `any` still admits `undefined`, as `required` keeps an `unknown()`
 * property unchanged.
 */
export type AllRequired<T> = WithRest<
  Simplify<{ [K in keyof Listed<T>]-?: Exclude<Listed<T>[K], undefined> }>,
  Unlisted<T>
>;

/**
 * The shape and the options of a validator `object` made, for the function named `name` to build on.
 * An object with checks is refused: a check reads the whole object, and may read a property the new
 * shape lacks or holds otherwise, so keeping it could fail every value and dropping it would accept
 * what the object was written to refuse.
 */
function partsOf(name: string, validator: unknown): [shape: Shape, options: ObjectOptions] {
  const record = typeof validator === "function" ? describe(validator as AnyValidator) : undefined;
  if (record?.kind !== "object") {
    throw new TypeError(`${name}() needs a validator made by object()`);
  }
  if ((record.checks ?? []).length > 0) {
    throw new TypeError(
      `${name}() cannot keep the checks of an object, which may read a property it changes. Make the object without them, and give ${name}() the checks its result needs`,
    );
  }
  return [record["shape"] as Shape, record.options as ObjectOptions];
}

/**
 * Makes the new object. What follows the function's own arguments is what follows a shape in `object`,
 * options and then checks. The new object keeps the options of the one it came from, and each option given
 * replaces the one of its name: given `{ message }`, a strict object stays strict. Options given as
 * `undefined` or `null` are no options, as for every factory, so they keep them all, and an option given
 * as `undefined` is no option, so it keeps the one of its name. A name the object was not made with is
 * passed on even then, so `object` refuses one it does not know, as it does when called itself. Anything
 * else that is not a plain object is passed on as it is, for `object` to refuse.
 */
const rebuild = (shape: Shape, options: ObjectOptions, rest: readonly unknown[]): AnyValidator => {
  const given = rest.length > 0 && (rest[0] === undefined || rest[0] === null) ? rest.slice(1) : rest;
  const [first, ...checks] = given;
  return (object as (shape: Shape, ...rest: unknown[]) => AnyValidator)(
    shape,
    ...(given.length === 0 || typeof first === "function"
      ? [options, ...given]
      : isPlainObject(first)
        ? [
            {
              ...options,
              ...Object.fromEntries(
                Object.entries(first).filter(([key, value]) => value !== undefined || !Object.hasOwn(options, key)),
              ),
            },
            ...checks,
          ]
        : given),
  );
};

/**
 * The entries of a shape whose key is, or is not, one of `keys`, each of which the shape must have. A
 * number names the property written with it, as in `{ 0: string() }`, whose key the types give as `0`.
 */
function select(name: string, shape: Shape, keys: readonly unknown[], isKept: boolean): Shape {
  assertList("keys", keys, "property names");
  const names = keys.map((key) => (typeof key === "number" ? String(key) : key));
  for (const key of names) {
    if (typeof key !== "string" || !Object.hasOwn(shape, key)) {
      throw new TypeError(`${name}() was given a key the object does not have: ${String(key)}`);
    }
  }
  return Object.fromEntries(Object.entries(shape).filter(([key]) => names.includes(key) === isKept));
}

/** Makes an object validator of the named properties of another. See `pick` in `pick.ts`. */
export const picking = (
  name: string,
  validator: unknown,
  keys: readonly unknown[],
  isKept: boolean,
  rest: readonly unknown[],
): AnyValidator => {
  const [shape, options] = partsOf(name, validator);
  return rebuild(select(name, shape, keys, isKept), options, rest);
};

/** Makes an object validator of the properties of another with those of `added` added or replaced. See `extend` in `extend.ts`. */
export const extending = (validator: unknown, added: unknown, rest: readonly unknown[]): AnyValidator => {
  const [shape, options] = partsOf("extend", validator);
  assertShape(added);
  // A key the object has keeps its place and takes the new validator, as spreading the shape does.
  return rebuild({ ...shape, ...(added as Shape) }, options, rest);
};

/** Makes an object validator whose every property is changed by `change`. */
export const mapping = (
  name: string,
  validator: unknown,
  change: (property: AnyValidator) => AnyValidator,
  rest: readonly unknown[],
): AnyValidator => {
  const [shape, options] = partsOf(name, validator);
  return rebuild(
    Object.fromEntries(Object.entries(shape).map(([key, property]) => [key, change(property)])),
    options,
    rest,
  );
};

/**
 * A property as `required` leaves it: what `optional` or `nullish` wrapped, and any other as it is.
 * Every such wrapper is taken off, and one inside a `nullable` too, since `partial` wraps a property
 * that was optional already and one left on would still accept a missing value.
 */
export function unwrapped(property: AnyValidator): AnyValidator {
  const record = describe(property);
  const inner = record?.["inner"] as AnyValidator;
  if (record?.kind === "optional") {
    return unwrapped(inner);
  }
  if (record?.kind === "nullish") {
    return nullable(unwrapped(inner));
  }
  if (record?.kind === "nullable") {
    const bare = unwrapped(inner);
    return bare === inner ? property : nullable(bare);
  }
  return property;
}
