/*
 * The Standard Schema every validator a factory makes carries as it is, so a library that takes one needs no
 * `standard` call. It words issues with `brief`, a short English; `standard` gives the full wording or another
 * language.
 */
import { isThenable } from "../core/async";
import type { ValidationResult } from "../core/types";
import { brief } from "../messages/brief";
import type { StandardSchemaV1 } from "./standard-schema";

const toStandard = (result: ValidationResult<unknown>): StandardSchemaV1.Result<unknown> =>
  result.ok
    ? { value: result.value }
    : { issues: result.error.issues.map((issue) => ({ message: brief(issue), path: issue.path })) };

/** The `~standard` of a validator, which validates with it and words each issue with {@link brief}. */
export const ownStandard = (validator: (input: unknown) => unknown): StandardSchemaV1.Props<unknown, unknown> => ({
  version: 1,
  vendor: "codenhub",
  validate: (input) => {
    const result = validator(input) as ValidationResult<unknown> | PromiseLike<ValidationResult<unknown>>;
    // An async function always returns a Promise, whatever kind of thenable it awaits, as `standard` does.
    return isThenable(result) ? (async () => toStandard(await result))() : toStandard(result);
  },
});
