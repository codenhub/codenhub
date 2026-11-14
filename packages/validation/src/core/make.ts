/*
 * Makes the validator of a run: the function a consumer calls, described, and a Standard Schema.
 */
import type { StandardSchemaV1 } from "../interop/standard-schema";
import type { Description } from "./describe";
import { call, RUN, type Run } from "./run";
import type { ValidationIssue, ValidationResult } from "./types";
import type { Word } from "./words";

/** The wordings a validator or a check carries, or none for a function this package did not make. */
export const wordsIn = (part: unknown): readonly Word[] =>
  typeof part === "function" ? ((part as { "~words"?: readonly Word[] })["~words"] ?? []) : [];

/** The wordings of a validator: its `own`, and those of each of its `parts`, each once. */
export function wordsOf(own: readonly Word[], parts: readonly unknown[]): readonly Word[] {
  const all = new Set(own);
  for (const part of parts) {
    for (const word of wordsIn(part)) {
      all.add(word);
    }
  }
  return [...all];
}

/** The brief English message of an issue: its own, or the first wording that knows it. */
function messageOf(issue: ValidationIssue, words: readonly Word[]): string {
  let { message } = issue;
  for (let index = 0; message === undefined && index < words.length; index += 1) {
    message = (words[index] as Word)(issue);
  }
  return message ?? "Invalid value";
}

const toStandard = (result: ValidationResult<unknown>, words: readonly Word[]): StandardSchemaV1.Result<unknown> =>
  result.ok
    ? { value: result.value }
    : { issues: result.error.issues.map((issue) => ({ message: messageOf(issue, words), path: issue.path })) };

/** The Standard Schema of a run, whose issues are worded by `words`. */
export const standardOf = (run: Run, words: readonly Word[]): StandardSchemaV1.Props<unknown, unknown> => ({
  version: 1,
  vendor: "codenhub",
  validate: (input) => {
    const result = call(run, input);
    return result instanceof Promise
      ? // oxlint-disable-next-line promise/prefer-await-to-then
        result.then((settled) => toStandard(settled, words))
      : toStandard(result, words);
  },
});

/**
 * A new function that validates as `validator` does and carries what it carries, for a wrapper that
 * changes what a validator says of itself and not what it does.
 */
export function sameAs(
  validator: (input: unknown) => unknown,
): ((input: unknown) => unknown) & Record<PropertyKey, unknown> {
  const copy = ((input: unknown) => validator(input)) as ((input: unknown) => unknown) & Record<PropertyKey, unknown>;
  for (const key of [RUN, "~description", "~words", "~standard"]) {
    if (Object.hasOwn(validator, key)) {
      copy[key] = (validator as unknown as Record<PropertyKey, unknown>)[key];
    }
  }
  return copy;
}

/**
 * Makes the validator of `run`, described by `record`. `own` are the wordings of the issues the validator
 * reports itself, to which those of its checks and of its `children` are added.
 */
export function toValidator<TValidator>(
  run: Run,
  // Options are an interface of their own for each factory, which has no index signature to read as a record.
  record: Omit<Description, "options"> & { readonly options?: object },
  own: readonly Word[],
  children: readonly unknown[] = [],
): TValidator {
  const validator = ((input: unknown) => call(run, input)) as ((input: unknown) => unknown) &
    Record<PropertyKey, unknown>;
  const checks = record.checks as readonly unknown[] | undefined;
  // The list of checks is the one the validator runs, so a reader that changed it would change the validator.
  if (checks !== undefined) {
    Object.freeze(checks);
  }
  const words = wordsOf(own, checks === undefined ? children : [...children, ...checks]);
  validator[RUN] = run;
  validator["~description"] = Object.freeze(record);
  validator["~words"] = words;
  validator["~standard"] = standardOf(run, words);
  return validator as TValidator;
}
