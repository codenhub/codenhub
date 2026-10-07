import { described } from "../core/describe";
import { assertFunction, assertList, type IssueInput } from "../core/result";
import type { AsyncCheck, Check, Message } from "../core/types";
import { check } from "./check";

/**
 * Makes a check of an object that needs only some of its properties, and so does not wait for the others:
 * given to `object` or `objectLike`, it runs as soon as every property it names has passed, whatever the
 * rest did.
 *
 * @remarks
 * A check made by `check` is given the whole object, so it runs once every property has passed, and a form
 * shows "Passwords must match" only after every other field is valid. This one is given an object of the
 * named properties alone, typed so, and reports with the issues of the properties that failed.
 *
 * It takes the issue to report as `check` does: a message, a function that words the issue, or an issue
 * with its own `code`, `path`, `params` and `message`. A property named here that the object does not
 * have is a `TypeError` when the object is created. Given to any other validator it is a check like any
 * other, run once the value has passed.
 *
 * @example
 * ```ts
 * const signup = object(
 *   { name: string({ min: 2 }), password: string({ min: 12 }), confirm: string() },
 *   checkFields(["password", "confirm"], (data) => data.password === data.confirm, {
 *     path: ["confirm"],
 *     message: "Passwords must match",
 *   }),
 * );
 * signup({ name: "", password: "correct horse battery", confirm: "nope" });
 * // fails with the issue of `name` and "Passwords must match" at `confirm`
 * ```
 *
 * @typeParam T - The type of the object.
 * @typeParam TKey - The properties the test reads.
 * @param keys - The properties the test needs, each of which the object has.
 * @param test - Returns whether an object of those properties is acceptable.
 * @param issue - The message, or the issue to report. Defaults to the code `custom` at the object itself.
 * @returns A check for an object with those properties.
 * @throws {TypeError} When `keys` is not a list of property names or is empty, `test` is not a function, or `issue`
 * is not a message or an issue object.
 */
export function checkFields<T extends object, const TKey extends keyof T & string>(
  keys: readonly TKey[],
  test: (value: Pick<T, TKey>) => boolean,
  issue?: IssueInput | Message,
): Check<T>;
export function checkFields<T extends object, const TKey extends keyof T & string>(
  keys: readonly TKey[],
  test: (value: Pick<T, TKey>) => boolean | PromiseLike<boolean>,
  issue?: IssueInput | Message,
): AsyncCheck<T>;
export function checkFields(
  keys: readonly string[],
  test: (value: never) => boolean | PromiseLike<boolean>,
  issue?: IssueInput | Message,
): AsyncCheck<object> {
  assertList("keys", keys, "property names");
  // Copied, so changing the list after the check is made changes nothing.
  const fields = Object.freeze([...keys]);
  if (fields.some((key) => typeof key !== "string")) {
    throw new TypeError("checkFields() needs a list of property names");
  }
  // A check that names no property would wait for none, and run whenever any property failed.
  if (fields.length === 0) {
    throw new TypeError("checkFields() needs at least one property name");
  }
  assertFunction("test", test);
  const whole = check<Record<string, unknown>>(
    // Made from entries, which defines each property, so a key such as `__proto__` is one of the object's.
    (value) =>
      test(
        Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]])) as never,
      ),
    issue,
  );
  // Described, which is how `object` knows the properties it waits for. It has no `params`, so to a reader of
  // the schema it is a rule that cannot be read, as a check made by `check` is.
  return described(whole as AsyncCheck<object>, { kind: "check", fields });
}
