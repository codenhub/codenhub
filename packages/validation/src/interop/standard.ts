import { isThenable } from "../core/async";
import { assertFunction } from "../core/result";
import type { AnyValidator, Infer, ValidationResult } from "../core/types";
import { formatIssue, type Messages } from "../messages/format-issue";
import type { StandardSchemaV1 } from "./standard-schema";

/**
 * Makes a validator usable wherever a [Standard Schema](https://standardschema.dev/) is accepted,
 * such as form libraries, API frameworks and routers, without an adapter on their side.
 *
 * @remarks
 * The result is a validator that behaves exactly as the one you gave, plus the `~standard` property
 * the specification asks for. The one you gave is not modified. The specification requires a message
 * on every issue, so this is where the text is built, with `formatIssue` and the `messages` you pass:
 * `englishMessages` for the built-in English, or a map of your own. `~standard.validate` returns its result directly for a synchronous validator and a
 * `Promise` for an asynchronous one, even one that returns another kind of thenable, since callers
 * tell the two apart with `instanceof Promise`, as the specification shows, and would otherwise read a
 * pending result as one without issues. Input and output types are `unknown` and what the validator produces.
 *
 * @example
 * ```ts
 * const signup = standard(object({ email: email(), age: number({ int: true }) }), englishMessages);
 *
 * signup["~standard"].validate({ email: "nope" });
 * // { issues: [{ message: "Invalid email address", path: ["email"] }, ...] }
 * ```
 *
 * @typeParam TValidator - The validator to expose.
 * @param validator - The validator to expose as a Standard Schema.
 * @param messages - Text for the issue codes, such as `englishMessages`. Required, because the specification
 * needs a message on every issue and there is no built-in default to fall back on.
 * @returns A validator that is also a Standard Schema.
 * @throws {TypeError} When `validator` is not a function.
 */
export function standard<TValidator extends AnyValidator>(
  validator: TValidator,
  messages: Messages,
): TValidator & StandardSchemaV1<unknown, Infer<TValidator>> {
  assertFunction("validator", validator);
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
  return Object.assign(wrapped, { "~standard": props }) as unknown as TValidator &
    StandardSchemaV1<unknown, Infer<TValidator>>;
}
