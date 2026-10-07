import { isThenable } from "../core/async";
import { describe, described } from "../core/describe";
import { assertFunction } from "../core/result";
import type { AnyValidator, Infer, InferInput, ValidationResult } from "../core/types";
import { englishMessages } from "../messages/english-messages";
import { assertMessages, formatIssue, type Messages } from "../messages/format-issue";
import type { StandardSchemaV1 } from "./standard-schema";

/**
 * Makes a validator usable wherever a [Standard Schema](https://standardschema.dev/) is accepted,
 * such as form libraries, API frameworks and routers, without an adapter on their side.
 *
 * @remarks
 * The result is a validator that behaves exactly as the one you gave, plus the `~standard` property
 * the specification asks for. The one you gave is not modified. The specification requires a message
 * on every issue, so this is where the text is built, with `formatIssue` and the `messages` you pass,
 * the built-in English when you pass none. A program that calls `standard` bundles the English even when
 * it passes a map of its own. `~standard.validate` returns its result directly for a synchronous validator and a
 * `Promise` for an asynchronous one, even one that returns another kind of thenable, since callers
 * tell the two apart with `instanceof Promise`, as the specification shows, and would otherwise read a
 * pending result as one without issues. Input and output types are what the validator accepts, `InferInput`, and what it produces.
 *
 * @example
 * ```ts
 * const signup = standard(object({ email: email(), age: number({ int: true }) }));
 *
 * signup["~standard"].validate({ email: "nope" });
 * // { issues: [{ message: "Invalid email address", path: ["email"] }, ...] }
 * ```
 *
 * @typeParam TValidator - The validator to expose.
 * @param validator - The validator to expose as a Standard Schema.
 * @param messages - Text for the issue codes, such as `portugueseMessages` or a map of your own. Defaults to
 * `englishMessages`.
 * @returns A validator that is also a Standard Schema.
 * @throws {TypeError} When `validator` is not a function, or `messages` is not a message map. Validating
 * throws one too when the entry of `messages` that words an issue is neither text nor a function that
 * returns text.
 */
export function standard<TValidator extends AnyValidator>(
  validator: TValidator,
  messages: Messages = englishMessages,
): TValidator & StandardSchemaV1<InferInput<TValidator>, Infer<TValidator>> {
  assertFunction("validator", validator);
  assertMessages(messages);
  const wrapped = (input: unknown) => validator(input);
  type Output = Infer<TValidator>;
  const toStandard = (result: ValidationResult<Output>): StandardSchemaV1.Result<Output> =>
    result.ok
      ? { value: result.value }
      : { issues: result.error.issues.map((issue) => ({ message: formatIssue(issue, messages), path: issue.path })) };
  const props: StandardSchemaV1.Props<unknown, Output> = {
    version: 1,
    vendor: "codenhub",
    validate: (value) => {
      const result = validator(value) as ValidationResult<Output> | PromiseLike<ValidationResult<Output>>;
      // An async function always returns a Promise, whatever kind of thenable it awaits.
      return isThenable(result) ? (async () => toStandard(await result))() : toStandard(result);
    },
  };
  const record = describe(validator);
  // Described as the validator it wraps, which it behaves as.
  return Object.assign(record === undefined ? wrapped : described(wrapped, record), {
    "~standard": props,
  }) as unknown as TValidator & StandardSchemaV1<InferInput<TValidator>, Infer<TValidator>>;
}
