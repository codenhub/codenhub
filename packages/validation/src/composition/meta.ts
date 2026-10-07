import { describe, described } from "../core/describe";
import { sameAs } from "../core/nesting";
import { isPlainObject } from "../core/objects";
import { assertFunction } from "../core/result";
import type { AnyValidator } from "../core/types";

/**
 * What a validator is for, written for a reader: a person reading an API's documentation, or a language
 * model choosing a tool and filling its arguments. Each key is the JSON Schema keyword of the same name.
 */
export interface Meta {
  /** A short name for the value. */
  readonly title?: string | undefined;
  /** What the value is, and what it is for. */
  readonly description?: string | undefined;
  /**
   * Values that show what is expected, each a JSON value: `null`, a boolean, a finite number, text, or a
   * list or plain object of them. They are written as given, and not validated.
   */
  readonly examples?: readonly unknown[] | undefined;
  /** Whether the value is on its way out, and should no longer be sent. */
  readonly deprecated?: boolean | undefined;
}

/** What stands for a value that is not JSON in {@link frozenJson}. */
const NOT_JSON = Symbol("not JSON");

/**
 * A frozen copy of a JSON value, or `NOT_JSON` for anything else: a `bigint`, a `Date` or `undefined`
 * would make `JSON.stringify` of a schema throw, or change the example without a word. Each value is read
 * once, and a list or an object that holds itself is not JSON.
 */
function frozenJson(value: unknown, holding: readonly unknown[] = []): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NOT_JSON;
  }
  const isList = Array.isArray(value);
  if ((!isList && !isPlainObject(value)) || holding.includes(value)) {
    return NOT_JSON;
  }
  // A hole in a list, or a key that is a symbol, is something `JSON.stringify` would change or drop.
  const keys = isList
    ? Array.from({ length: (value as unknown[]).length }, (_, index) =>
        index in (value as unknown[]) ? String(index) : undefined,
      )
    : Object.getOwnPropertySymbols(value).length > 0
      ? [undefined]
      : Object.keys(value as object);
  const copy: Record<string, unknown> = isList ? ([] as unknown as Record<string, unknown>) : {};
  for (const key of keys) {
    const each =
      key === undefined ? NOT_JSON : frozenJson((value as Record<string, unknown>)[key], [...holding, value]);
    if (each === NOT_JSON) {
      return NOT_JSON;
    }
    Object.defineProperty(copy, key as string, { value: each, enumerable: true, writable: true, configurable: true });
  }
  return Object.freeze(copy);
}

/** What each key of {@link Meta} must be, and the words of the error when it is not. */
const RULES: Readonly<Record<string, readonly [test: (value: unknown) => boolean, must: string]>> = {
  title: [(value) => typeof value === "string", "text"],
  description: [(value) => typeof value === "string", "text"],
  examples: [Array.isArray, "a list of JSON values"],
  deprecated: [(value) => typeof value === "boolean", "true or false"],
};

/**
 * Says what a validator is for, so that `toJsonSchema` writes it beside the types: a title, a description,
 * examples, and whether the value is deprecated.
 *
 * @remarks
 * Returns a new validator that validates exactly as the one given, and whose description is that one's
 * with `meta` added. The validator given is not changed, so the same one can be described differently in
 * two places. A `meta` given to a validator that has one replaces the keys it names and keeps the others;
 * a key given as `undefined` is not given. A validator written by hand, which has no description, is
 * described as `{ kind: "meta", inner, meta }`.
 *
 * `pick`, `omit`, `required`, `partial` and `extend` read through it to the object it describes, and what
 * they make has no `meta`: a title written for one object is rarely right for another.
 *
 * @example
 * ```ts
 * const city = meta(string({ min: 1 }), { description: "The city to get the weather for", examples: ["Lisbon"] });
 * toJsonSchema(object({ city }));
 * // { ..., properties: { city: { type: "string", minLength: 1, description: "The city to get the weather for", examples: ["Lisbon"] } }, ... }
 * ```
 *
 * @typeParam TValidator - The validator to describe.
 * @param validator - Any validator.
 * @param given - What to say about it.
 * @returns A validator that behaves as the one given.
 * @throws {TypeError} When `validator` is not a function, `given` is not a plain object, or a key of it is
 * unknown or not of its type.
 */
export function meta<TValidator extends AnyValidator>(validator: TValidator, given: Meta): TValidator {
  assertFunction("validator", validator);
  if (!isPlainObject(given)) {
    throw new TypeError("meta must be an object");
  }
  const own: Record<string, unknown> = {};
  // Every own key, a symbol too, so a key that would be ignored is refused instead.
  for (const key of Reflect.ownKeys(given)) {
    const rule = typeof key === "string" && Object.hasOwn(RULES, key) ? RULES[key] : undefined;
    if (rule === undefined) {
      throw new TypeError(`Unknown meta ${String(key)}`);
    }
    const value: unknown = given[key as keyof Meta];
    if (value !== undefined) {
      // A copy, so a list changed after the validator is made does not change what it says.
      const kept = Array.isArray(value) ? frozenJson(value) : value;
      if (!rule[0](value) || kept === NOT_JSON) {
        throw new TypeError(`meta ${String(key)} must be ${rule[1]}`);
      }
      own[key as string] = kept;
    }
  }
  const record = describe(validator);
  const merged = Object.freeze({ ...(record?.["meta"] as object | undefined), ...own });
  const wrapper = sameAs(validator) as AnyValidator & Record<string, unknown>;
  // What `standard` added is kept, so a Standard Schema stays one.
  const exposed = (validator as unknown as Record<string, unknown>)["~standard"];
  if (exposed !== undefined) {
    wrapper["~standard"] = exposed;
  }
  return described(
    wrapper,
    record === undefined ? { kind: "meta", inner: validator, meta: merged } : { ...record, meta: merged },
  ) as unknown as TValidator;
}
