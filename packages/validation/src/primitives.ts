import { Validator, type RefineOptions } from "./core";
import { fail, invalidType, pass, type Outcome, type ParseContext } from "./internal";
import { type Message } from "./issue";
import { LiteralValidator } from "./literal";

/** Constructor an {@link instanceOf} validator can check against, including abstract classes. */
export type Constructor<T = unknown> = abstract new (...args: never[]) => T;

/** Validator that accepts any value, created by {@link unknown}. */
export class UnknownValidator extends Validator<unknown> {
  protected evaluate(input: unknown): Outcome<unknown> {
    return pass(input);
  }
}

/** Validator that rejects every value, created by {@link never}. */
export class NeverValidator extends Validator<never> {
  /**
   * Creates a validator that always fails.
   *
   * @param message - Message of the failure.
   */
  constructor(private readonly message?: Message) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): Outcome<never> {
    return fail(ctx, { code: "invalid_type", message: this.message ?? "No value is allowed", input });
  }
}

/**
 * Validator that accepts instances of a class, created by {@link instanceOf}.
 *
 * @typeParam T - Instance type.
 */
export class InstanceOfValidator<T> extends Validator<T> {
  /**
   * Creates an instance validator.
   *
   * @param target - Class the value must be an instance of.
   * @param message - Message of the failure.
   */
  constructor(
    readonly target: Constructor<T>,
    private readonly message?: Message,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): Outcome<T> {
    return input instanceof this.target
      ? pass(input as T)
      : invalidType(ctx, `instance of ${this.target.name}`, input, this.message);
  }
}

/**
 * Creates a validator that accepts any value.
 *
 * @returns A validator whose output is `unknown`.
 */
export function unknown(): UnknownValidator {
  return new UnknownValidator();
}

/**
 * Creates a validator that accepts only `null`.
 *
 * @param message - Message of the failure.
 * @returns A validator whose output is `null`.
 */
export function nullValidator(message?: Message): LiteralValidator<null> {
  return new LiteralValidator(null, message);
}

/**
 * Creates a validator that accepts only `undefined`.
 *
 * @param message - Message of the failure.
 * @returns A validator whose output is `undefined`.
 */
export function undefinedValidator(message?: Message): LiteralValidator<undefined> {
  return new LiteralValidator(undefined, message);
}

/**
 * Creates a validator that rejects every value.
 *
 * Useful to forbid a property, or as the branch of a union that must never match.
 *
 * @param message - Message of the failure.
 * @returns A validator whose output is `never`.
 */
export function never(message?: Message): NeverValidator {
  return new NeverValidator(message);
}

/**
 * Creates a validator that accepts instances of a class.
 *
 * @example
 * ```ts
 * const file = val.instanceOf(File);
 * ```
 *
 * @typeParam T - Instance type.
 * @param target - Class the value must be an instance of.
 * @param message - Message of the failure.
 * @returns A validator whose output is the instance type.
 */
export function instanceOf<T>(target: Constructor<T>, message?: Message): InstanceOfValidator<T> {
  return new InstanceOfValidator(target, message);
}

/**
 * Creates a validator from a predicate, for a type none of the built-in validators describe.
 *
 * The type parameter is a claim: the predicate must only return `true` for values of type `T`.
 * Prefer a type guard so the compiler checks it.
 *
 * @example
 * ```ts
 * const slug = val.custom<Slug>((input): input is Slug => typeof input === "string" && /^[a-z-]+$/.test(input), "Not a slug");
 * ```
 *
 * @typeParam T - Type the predicate accepts.
 * @param predicate - Returns `true` when the input is a `T`. May be async, and an exception it throws propagates.
 * @param messageOrOptions - Failure message, or options to set the message, `code`, `path` and `params` of the issue.
 * @returns A validator whose output is `T`.
 */
export function custom<T>(
  predicate: (input: unknown) => boolean | Promise<boolean>,
  messageOrOptions?: Message | RefineOptions,
): Validator<T> {
  return new UnknownValidator().refine(predicate, messageOrOptions) as unknown as Validator<T>;
}
