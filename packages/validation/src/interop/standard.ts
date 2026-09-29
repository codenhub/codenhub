import { chain } from "../core/async";
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
 * on every issue, so this is where the text is built, with `formatIssue`; pass a message map to reword
 * or localize it. `~standard.validate` returns its result directly for a synchronous validator and a
 * promise for an asynchronous one. Input and output types are `unknown` and what the validator produces.
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
 * @param messages - Text that replaces the built-in wording for the codes it names.
 * @returns A validator that is also a Standard Schema.
 */
export function standard<TValidator extends AnyValidator>(
  validator: TValidator,
  messages?: Messages,
): TValidator & StandardSchemaV1<unknown, Infer<TValidator>> {
  const wrapped = (input: unknown) => validator(input);
  const props: StandardSchemaV1.Props<unknown, Infer<TValidator>> = {
    version: 1,
    vendor: "codenhub",
    validate: (value) =>
      chain(
        validator(value) as ValidationResult<Infer<TValidator>> | PromiseLike<ValidationResult<Infer<TValidator>>>,
        (result): StandardSchemaV1.Result<Infer<TValidator>> =>
          result.ok
            ? { value: result.value }
            : {
                issues: result.error.issues.map((issue) => ({
                  message: formatIssue(issue, messages),
                  path: issue.path,
                })),
              },
      ) as StandardSchemaV1.Result<Infer<TValidator>> | Promise<StandardSchemaV1.Result<Infer<TValidator>>>,
  };
  return Object.assign(wrapped, { "~standard": props }) as unknown as TValidator &
    StandardSchemaV1<unknown, Infer<TValidator>>;
}
