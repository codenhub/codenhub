import type { AnyValidator, AsyncCheck } from "./types";

/**
 * What a factory of this package made, as plain data: a validator's kind, the options it read, its
 * checks, and whatever a validator of that kind is made of, such as the `shape` of an `object` or the
 * `item` of an `array`. A built-in check has one too, of kind `"check"`, with the `code` and `params` of
 * the issue it reports.
 *
 * @remarks
 * The record and its options are frozen. A child is given as the validator itself, to be described in
 * turn, so a recursive schema is described one level at a time.
 */
export interface Description {
  /** What was made, such as `"string"`, `"object"`, `"format"` or `"check"`. */
  readonly kind: string;
  /** The options the factory read, `message` included, for a validator that takes options. */
  readonly options?: Readonly<Record<string, unknown>>;
  /** The checks given to the validator, each described in turn, for a validator that takes checks. */
  readonly checks?: readonly AsyncCheck<never>[];
  /** What a validator of this kind is made of. */
  readonly [part: string]: unknown;
}

/** The property a validator or check made by this package keeps its description under. */
const DESCRIPTION = "~description";

/**
 * Records on a validator or a check what a factory made. The record is kept on the function itself and
 * not in a registry, so one copy of this package reads what another made, and it is set when the function
 * is made, never when a module loads.
 */
export const described = <TTarget extends object>(
  target: TTarget,
  // Options are an interface of their own for each factory, which has no index signature to read as a record.
  record: Omit<Description, "options"> & { readonly options?: object },
): TTarget => {
  // The list of checks is the one the validator runs, so a reader that changed it would change the validator.
  if (Array.isArray(record.checks)) {
    Object.freeze(record.checks);
  }
  (target as Record<string, unknown>)[DESCRIPTION] = Object.freeze(record);
  return target;
};

/**
 * Reads what a validator or a check is made of, so a program can walk a schema: to write it in another
 * notation, build a form from it, or derive another validator.
 *
 * @remarks
 * Only what a factory of this package made is described. A validator or check written by hand, and a
 * check made by `check`, is a function like any other and gives `undefined`, as does anything that is
 * not a function: to a reader of the schema it is a rule that cannot be read.
 *
 * @example
 * ```ts
 * const user = object({ name: string({ min: 2 }) });
 * const record = describe(user);
 * record?.kind; // "object"
 * const shape = record?.["shape"] as { name: AnyValidator }; // { name: [validator] }
 * describe(shape.name)?.options; // { min: 2 }
 * ```
 *
 * @param target - A validator or a check.
 * @returns Its description, or `undefined` when it carries none.
 */
export function describe(target: AnyValidator | AsyncCheck<never>): Description | undefined {
  const record: unknown =
    typeof target === "function" ? (target as unknown as Record<string, unknown>)[DESCRIPTION] : undefined;
  return typeof record === "object" && record !== null ? (record as Description) : undefined;
}
