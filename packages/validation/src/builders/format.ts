import { assertFunction } from "../core/result";
import type { Factory, MessageOptions } from "../core/types";
import { formatFactory } from "../formats/text-format";

/**
 * Makes the factory of a validator for a string format, which behaves exactly as `email()` or
 * `uuid()` do.
 *
 * @remarks
 * A value that is not a string fails with `invalid_type`, and a string the test rejects with
 * `invalid_format` and `params.format` set to `name`. An accepted string is returned as written. The
 * validators it makes take a `message` option and checks.
 *
 * @example
 * ```ts
 * const slug = format("slug", (text) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text));
 * slug()("hello-world"); // { ok: true, value: "hello-world" }
 * slug({ message: "Use lowercase words and hyphens" })("Hello World"); // { ok: false, ... }
 * ```
 *
 * @param name - The name of the format, for the issue. Treat it as part of the format's contract.
 * @param test - Returns `true` for a string of the format.
 * @returns The factory of the validator.
 * @throws {TypeError} When `test` is not a function.
 */
export function format(name: string, test: (text: string) => boolean): Factory<string, MessageOptions> {
  assertFunction("test", test);
  return formatFactory(name, (text) => (test(text) ? text : undefined));
}
