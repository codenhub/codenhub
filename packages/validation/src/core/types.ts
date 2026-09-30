/** Object key or array index leading to a value inside validated data. */
export type ValidationPathSegment = string | number;

/**
 * Stable category of a validation failure that callers can branch on without parsing messages.
 *
 * The built-in codes are listed for autocompletion; any other string is a valid code, so custom
 * validators can report their own, such as `"username_taken"`.
 */
export type ValidationIssueCode =
  | "invalid_type"
  | "invalid_value"
  | "invalid_format"
  | "too_small"
  | "too_big"
  | "unrecognized_key"
  | "invalid_key"
  | "invalid_union"
  | "invalid_intersection"
  | "custom"
  | (string & {});

/** A single reason a value failed validation. */
export interface ValidationIssue {
  /** Stable failure category. */
  readonly code: ValidationIssueCode;
  /** Location of the invalid value, from the root of the validated data. Empty for the root itself. */
  readonly path: readonly ValidationPathSegment[];
  /**
   * Facts a message can be built from, such as `{ minimum: 3, type: "string" }` for `too_small` or
   * `{ expected: "string", received: "number" }` for `invalid_type`. Never contains an input value;
   * the only input it can name is a key, as `unrecognized_key` does.
   */
  readonly params?: Readonly<Record<string, unknown>>;
  /**
   * Ready-made message text. Built-in validators never set it; a custom validator can, and
   * `formatIssue` prefers it over every other source of text.
   */
  readonly message?: string;
}

/** Everything a failed validation found. */
export interface ValidationFailure {
  /**
   * Every issue found, in the order the validator encountered them. Never empty, and typed so, so
   * `issues[0]` is an issue even under `noUncheckedIndexedAccess`.
   */
  readonly issues: readonly [ValidationIssue, ...ValidationIssue[]];
}

/** Successful validation, carrying the validated value. */
export interface ValidationOk<T> {
  readonly ok: true;
  /** The validated value, after any transforms and defaults. */
  readonly value: T;
}

/** Failed validation, carrying every issue found. */
export interface ValidationErr {
  readonly ok: false;
  /** What went wrong. */
  readonly error: ValidationFailure;
}

/** What a validator returns instead of throwing on invalid input. */
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

/**
 * A synchronous validator: a function that takes any input and returns a {@link ValidationResult}.
 *
 * Every validator in this package has this shape, and so does anything you write yourself.
 *
 * @typeParam T - The type of the value on success.
 */
export type Validator<T> = (input: unknown) => ValidationResult<T>;

/**
 * A validator that may finish later, for rules that need I/O such as checking a name is not taken.
 *
 * Always `await` its result. It is a promise only when the validator actually had to wait: a
 * composer holding an asynchronous rule still answers at once for input it can reject without
 * running it, such as `undefined` for an optional value. `await` handles both.
 *
 * @typeParam T - The type of the value on success.
 */
export type AsyncValidator<T> = (input: unknown) => ValidationResult<T> | PromiseLike<ValidationResult<T>>;

/**
 * Any validator, synchronous or asynchronous.
 *
 * @typeParam T - The type of the value on success.
 */
export type AnyValidator<T = unknown> = Validator<T> | AsyncValidator<T>;

/**
 * The type a validator produces on success.
 *
 * @example
 * ```ts
 * const age = number({ int: true });
 * type Age = Infer<typeof age>; // number
 * ```
 *
 * @typeParam TValidator - The validator to read the type from.
 */
export type Infer<TValidator extends AnyValidator> =
  Awaited<ReturnType<TValidator>> extends ValidationResult<infer T> ? T : never;

/**
 * The validator type a composer returns: synchronous when every child validator is, asynchronous as
 * soon as one child is.
 *
 * @typeParam TChildren - The validators the composer runs.
 * @typeParam TOutput - The type the composed validator produces on success.
 */
export type Composed<TChildren extends AnyValidator, TOutput> = [TChildren] extends [Validator<unknown>]
  ? Validator<TOutput>
  : AsyncValidator<TOutput>;
