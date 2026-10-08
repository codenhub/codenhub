import type { StandardSchemaV1 } from "../interop/standard-schema";

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
   * Ready-made message text. A built-in validator sets it only when given a `message` option, and a
   * check only when given a message; a custom validator can set it too. `formatIssue` prefers it over
   * every other source of text.
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
 * It is called with any input, whatever `TInput` is: `TInput` is the type of input that can pass, which a
 * form or a caller's types are written from, and never a limit on what may be given.
 *
 * @typeParam T - The type of the value on success.
 * @typeParam TInput - The type of input that can pass. `unknown` for a validator that does not say.
 */
export interface Validator<T, TInput = unknown> {
  (input: unknown): ValidationResult<T>;
  /**
   * Never set: it only carries `TInput`, the type of input that can pass, for {@link InferInput}. Being
   * optional, it lets any function of the right shape be a validator. The type is held in an object, since
   * read straight from an optional property, an input type that includes `undefined` would lose it.
   */
  readonly "~types"?: { readonly input: TInput };
}

/**
 * A validator that may finish later, for rules that need I/O such as checking a name is not taken.
 *
 * Always `await` its result. It is a promise only when the validator actually had to wait: a
 * composer holding an asynchronous rule still answers at once for input it can reject without
 * running it, such as `undefined` for an optional value. `await` handles both.
 *
 * @typeParam T - The type of the value on success.
 * @typeParam TInput - The type of input that can pass. `unknown` for a validator that does not say.
 */
export interface AsyncValidator<T, TInput = unknown> {
  (input: unknown): ValidationResult<T> | PromiseLike<ValidationResult<T>>;
  /** Never set: it only carries `TInput`, as on {@link Validator}. */
  readonly "~types"?: { readonly input: TInput };
}

/**
 * A {@link Validator} a factory of this package made, which is also a Standard Schema as it is: a library
 * that takes one, such as a form library or a router, takes it without a `standard` call, and words its
 * issues in short English. `standard(validator, messages)` gives the full wording or another language.
 *
 * Accepted wherever a {@link Validator} is. A validator written by hand is a {@link Validator} and not a
 * Schema, since it has no `~standard` of its own.
 *
 * @typeParam T - The type of the value on success.
 * @typeParam TInput - The type of input that can pass.
 */
export interface Schema<T, TInput = unknown> extends Validator<T, TInput>, StandardSchemaV1<TInput, T> {}

/**
 * An {@link AsyncValidator} a factory of this package made, which is also a Standard Schema as it is, as a
 * {@link Schema} is. Its `~standard` validates asynchronously when the validator waits.
 *
 * @typeParam T - The type of the value on success.
 * @typeParam TInput - The type of input that can pass.
 */
export interface AsyncSchema<T, TInput = unknown> extends AsyncValidator<T, TInput>, StandardSchemaV1<TInput, T> {}

/**
 * Any validator, synchronous or asynchronous.
 *
 * @typeParam T - The type of the value on success.
 * @typeParam TInput - The type of input that can pass.
 */
export type AnyValidator<T = unknown, TInput = unknown> = Validator<T, TInput> | AsyncValidator<T, TInput>;

/**
 * A rule about a value that already has its type, given to a validator after its options:
 * `string({ min: 3 }, startsWith("ab"))`. It returns nothing when the value passes, or the issues it
 * found, with paths relative to the value.
 *
 * Make one with `check`, or write the function yourself.
 *
 * @typeParam T - The type of the value it checks.
 */
export type Check<T> = (value: T) => readonly ValidationIssue[] | undefined;

/**
 * A check that may finish later, such as one that asks a server whether a name is taken. A validator
 * given one is an {@link AsyncValidator}.
 *
 * @typeParam T - The type of the value it checks.
 */
export type AsyncCheck<T> = (
  value: T,
) => readonly ValidationIssue[] | undefined | PromiseLike<readonly ValidationIssue[] | undefined>;

/**
 * Wording for the issues one validator reports itself: the text, or a function that words an issue.
 * A function is called when the issue is reported, with the issue as that validator reports it, so its
 * `path` is relative to the validator's own value, `[]` for the value itself, even where the result
 * places the issue deeper, such as at `["user", "email"]` inside an `object`.
 */
export type Message = string | ((issue: ValidationIssue) => string);

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
 * The type of input that can pass a validator, which differs from what it produces wherever it changes
 * the value: a default, a coercion, a `transform`. It is what a form holds before validation.
 *
 * @remarks
 * A validator is called with any input; this is the type of the input it accepts, not a limit on its
 * argument. A validator written by hand, typed `Validator<T>`, gives `unknown` unless it says otherwise,
 * as `Validator<number, string>` does. Clean-up is not part of it: `string({ trim: true })` takes and
 * produces `string`.
 *
 * @example
 * ```ts
 * const settings = object({ page: coerceNumber(), theme: optional(oneOf(["light", "dark"]), "light") });
 * type Settings = Infer<typeof settings>; // { page: number; theme: "light" | "dark" }
 * type SettingsInput = InferInput<typeof settings>; // { page: string | number; theme?: "light" | "dark" | undefined }
 * ```
 *
 * @typeParam TValidator - The validator to read the type from.
 */
export type InferInput<TValidator extends AnyValidator> = TValidator extends {
  readonly "~types"?: { readonly input: infer TInput };
}
  ? TInput
  : unknown;

/**
 * The validator type a composer returns: synchronous when every child validator is, asynchronous as
 * soon as one child is.
 *
 * @typeParam TChildren - The validators the composer runs.
 * @typeParam TOutput - The type the composed validator produces on success.
 * @typeParam TInput - The type of input that can pass the composed validator.
 */
export type Composed<TChildren extends AnyValidator, TOutput, TInput = unknown> = [TChildren] extends [
  Validator<unknown>,
]
  ? Schema<TOutput, TInput>
  : AsyncSchema<TOutput, TInput>;

/**
 * The factory of a validator of `T` with options `TOptions`: options first and optional, then any
 * checks. It makes a {@link Schema} while every check is a {@link Check}, and an
 * {@link AsyncSchema} as soon as one is an {@link AsyncCheck}.
 *
 * @typeParam T - The type the validators it makes produce.
 * @typeParam TOptions - Its options.
 * @typeParam TInput - The type of input that can pass, which is `T` unless the validator converts its input.
 */
export interface Factory<T, TOptions, TInput = T> {
  (...checks: Check<T>[]): Schema<T, TInput>;
  (options: TOptions, ...checks: Check<T>[]): Schema<T, TInput>;
  (...checks: AsyncCheck<T>[]): AsyncSchema<T, TInput>;
  (options: TOptions, ...checks: AsyncCheck<T>[]): AsyncSchema<T, TInput>;
}

/**
 * What follows a validator's own arguments, such as the value of `literal`: options, then checks, or
 * checks alone. Every check is a {@link Check}.
 */
export type Rest<T, TOptions> = [options?: TOptions, ...checks: Check<T>[]] | Check<T>[];

/** {@link Rest} where a check may be an {@link AsyncCheck}. */
export type AsyncRest<T, TOptions> = [options?: TOptions, ...checks: AsyncCheck<T>[]] | AsyncCheck<T>[];

/** The options every validator takes. */
export interface MessageOptions {
  /**
   * Wording for every issue this validator reports itself, and every issue one of its checks reports
   * without a message of its own. Issues a child validator reports keep their own wording.
   */
  message?: Message | undefined;
}
