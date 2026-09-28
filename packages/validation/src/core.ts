import { abandon, chain, collect, isPromiseLike, type MaybePromise } from "./async";
import {
  createCheckContext,
  fail,
  failWith,
  isPlainObject,
  pass,
  setOwn,
  type Outcome,
  type ParseContext,
} from "./internal";
import {
  ValidationError,
  type CheckContext,
  type IssueInput,
  type Message,
  type ValidationIssue,
  type ValidationOptions,
  type ValidationResult,
} from "./issue";
import { type StandardSchemaV1 } from "./standard-schema";

/** Any validator, whatever it produces. What composite validators accept for their children. */
export type AnyValidator = Validator<unknown>;

/**
 * Infers the type a validator produces.
 *
 * @example
 * ```ts
 * const schema = val.object({ name: val.string() });
 * type User = Infer<typeof schema>; // { name: string }
 * ```
 */
export type Infer<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

/**
 * A reusable check: inspects a value and reports failures with `ctx.addIssue`.
 *
 * @typeParam T - Type of the value being checked.
 */
export type CheckFn<T> = (value: T, ctx: CheckContext) => void | Promise<void>;

/** Options of {@link Validator.refine} beyond a bare message. */
export type RefineOptions = Omit<IssueInput, "input" | "message"> & { message?: Message };

/**
 * A step run on the output of a validator: a check, or a normalization that returns a replacement.
 * Declared as a method so validators of different output types stay assignable to each other.
 */
type Step<T> = { step(value: T, ctx: CheckContext): T | void | Promise<T | void> }["step"];

const SYNC_ERROR_MESSAGE =
  "Cannot validate synchronously: the schema has an async check or transform. Use validateAsync() or parseAsync().";

/**
 * Placeholder to return from a {@link Validator.transform} callback that reported an issue and has
 * no value to produce.
 */
export const NEVER: never = undefined as never;

const toResult = <T>(outcome: Outcome<T>): ValidationResult<T> =>
  outcome.ok ? { ok: true, value: outcome.value } : { ok: false, error: new ValidationError(outcome.issues) };

const toStandardResult = <T>(outcome: Outcome<T>): StandardSchemaV1.Result<T> =>
  outcome.ok ? { value: outcome.value } : { issues: outcome.issues.map(({ message, path }) => ({ message, path })) };

/**
 * Runs a validator as a child of another, on a value at the context path.
 *
 * Composite validators use this instead of `validate` so path, options and async behavior carry
 * through unchanged.
 */
export function execute<T>(validator: Validator<T>, input: unknown, ctx: ParseContext): MaybePromise<Outcome<T>> {
  return (validator as unknown as { run(input: unknown, ctx: ParseContext): MaybePromise<Outcome<T>> }).run(input, ctx);
}

/**
 * Base class of every validator.
 *
 * A validator is immutable: every method that adds a rule returns a new validator and leaves the
 * receiver untouched. Rules added with {@link Validator.refine}, {@link Validator.check} and the
 * per-type constraints (`min`, `email`, ...) return the same validator type, so they chain in any
 * order.
 *
 * @typeParam TOutput - Type produced when validation succeeds.
 */
export abstract class Validator<TOutput> {
  /** Rules run, in order, on the value once it has the right structure. */
  protected readonly steps: readonly Step<TOutput>[] = [];

  /**
   * Checks the structure of an input and produces the output value, before any rule runs.
   *
   * @param input - Value to validate.
   * @param ctx - Where in the validated data the value sits.
   * @returns The output value, or the issues that made it invalid. May be a promise.
   */
  protected abstract evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TOutput>>;

  /** Evaluates the structure, then runs the rules on the value it produced. */
  protected run(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TOutput>> {
    return chain(this.evaluate(input, ctx), (outcome) =>
      outcome.ok && this.steps.length > 0 ? this.applySteps(outcome.value, ctx) : outcome,
    );
  }

  private applySteps(value: TOutput, ctx: ParseContext): MaybePromise<Outcome<TOutput>> {
    let current = value;
    const issues: ValidationIssue[] = [];

    const runStep = (index: number): MaybePromise<boolean> => {
      const step = this.steps[index];
      if (step === undefined) {
        return false;
      }
      const checkCtx = createCheckContext(ctx);
      return chain(step(current, checkCtx), (replacement) => {
        if (replacement !== undefined) {
          current = replacement as TOutput;
        }
        issues.push(...checkCtx.issues);
        return checkCtx.issues.length > 0;
      });
    };

    return chain(
      collect(this.steps.length, runStep, (hasFailed) => hasFailed && ctx.options.abortEarly === true),
      () => (issues.length > 0 ? failWith(issues) : pass(current)),
    );
  }

  /**
   * Returns a copy of this validator that runs one more rule after the existing ones.
   *
   * @param step - Rule to add. It reports failures with `ctx.addIssue` and may return a replacement value.
   * @returns The extended copy.
   */
  protected addStep(step: Step<TOutput>): this {
    return this.derive({ steps: [...this.steps, step] });
  }

  /**
   * Returns a copy of this validator with some of its fields replaced, keeping its rules.
   *
   * @param changes - Fields to replace.
   * @returns The copy.
   */
  protected derive(changes: object): this {
    const copy = Object.create(Object.getPrototypeOf(this) as object) as this;
    return Object.assign(copy, this, changes);
  }

  /**
   * Standard Schema v1 interface, so the validator works with libraries that accept any schema.
   *
   * @returns Metadata and a `validate` function that returns a promise only when the schema is async.
   */
  get "~standard"(): StandardSchemaV1.Props<unknown, TOutput> {
    return {
      version: 1,
      vendor: "codenhub",
      validate: (value) => chain(this.run(value, { path: [], options: {} }), toStandardResult),
    };
  }

  /**
   * Validates a value without throwing.
   *
   * @param input - Value to validate.
   * @param options - Options of this call.
   * @returns `{ ok: true, value }` for valid input, or `{ ok: false, error }` carrying every issue.
   * @throws {Error} When the schema has an async check or transform. Use {@link Validator.validateAsync}.
   */
  validate(input: unknown, options: ValidationOptions = {}): ValidationResult<TOutput> {
    const outcome = this.run(input, { path: [], options });
    if (isPromiseLike(outcome)) {
      abandon(outcome);
      throw new Error(SYNC_ERROR_MESSAGE);
    }
    return toResult(outcome);
  }

  /**
   * Validates a value without throwing, waiting for async checks and transforms.
   *
   * @param input - Value to validate.
   * @param options - Options of this call.
   * @returns A promise of `{ ok: true, value }` for valid input, or `{ ok: false, error }` carrying every issue.
   */
  async validateAsync(input: unknown, options: ValidationOptions = {}): Promise<ValidationResult<TOutput>> {
    return toResult(await this.run(input, { path: [], options }));
  }

  /**
   * Validates a value and returns it, throwing when it is invalid.
   *
   * @param input - Value to validate.
   * @param options - Options of this call.
   * @returns The validated value, after any transforms and defaults.
   * @throws {ValidationError} When the input is invalid.
   * @throws {Error} When the schema has an async check or transform. Use {@link Validator.parseAsync}.
   */
  parse(input: unknown, options?: ValidationOptions): TOutput {
    const result = this.validate(input, options);
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Validates a value and returns it, waiting for async checks and transforms and throwing when it is invalid.
   *
   * @param input - Value to validate.
   * @param options - Options of this call.
   * @returns A promise of the validated value, after any transforms and defaults.
   * @throws {ValidationError} When the input is invalid.
   */
  async parseAsync(input: unknown, options?: ValidationOptions): Promise<TOutput> {
    const result = await this.validateAsync(input, options);
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Tests whether a value is valid, narrowing its type when it is.
   *
   * The narrowed type is the validator's output, so it is only accurate for validators that leave
   * the value unchanged.
   *
   * @param input - Value to test.
   * @returns `true` when the value is valid.
   * @throws {Error} When the schema has an async check or transform.
   */
  is(input: unknown): input is TOutput {
    return this.validate(input).ok;
  }

  /**
   * Accepts `undefined` in addition to what this validator accepts.
   *
   * @returns A validator whose output includes `undefined`.
   */
  optional(): OptionalValidator<TOutput> {
    return new OptionalValidator(this);
  }

  /**
   * Accepts `null` in addition to what this validator accepts.
   *
   * @returns A validator whose output includes `null`.
   */
  nullable(): NullableValidator<TOutput> {
    return new NullableValidator(this);
  }

  /**
   * Accepts `null` and `undefined` in addition to what this validator accepts.
   *
   * @returns A validator whose output includes `null` and `undefined`.
   */
  nullish(): Validator<TOutput | null | undefined> {
    return this.optional().nullable();
  }

  /**
   * Replaces `undefined` input with a fallback. The fallback is used as given, not validated.
   *
   * @param fallback - The value, or a function returning it, which runs once per validation. A function is always called, so a validator whose output is itself a function must wrap it.
   * @returns A validator that never outputs `undefined` unless the fallback is.
   */
  default(fallback: TOutput | (() => TOutput)): Validator<TOutput> {
    return new DefaultValidator(this, fallback);
  }

  /**
   * Replaces a failed validation with a fallback. Only validation failures are caught; an
   * exception thrown by a callback still propagates.
   *
   * @param fallback - The value, or a function that receives the discarded issues and returns it.
   * @returns A validator that succeeds on any input.
   */
  catch(fallback: TOutput | ((issues: readonly ValidationIssue[]) => TOutput)): Validator<TOutput> {
    return new CatchValidator(this, fallback);
  }

  /**
   * Adds a yes-or-no rule. Use {@link Validator.check} instead to report several issues, point at
   * a nested path, or read the validation context.
   *
   * The predicate may be async. An exception thrown by it propagates.
   *
   * @param predicate - Returns `true` when the value is acceptable.
   * @param messageOrOptions - Failure message, or options to set the message, `code`, `path` and `params` of the issue.
   * @returns The validator with the rule added.
   */
  refine(predicate: (value: TOutput) => boolean | Promise<boolean>, messageOrOptions?: Message | RefineOptions): this {
    const options: RefineOptions =
      typeof messageOrOptions === "object" ? messageOrOptions : { message: messageOrOptions };
    return this.addStep((value, ctx) =>
      chain(predicate(value), (isValid) => {
        if (!isValid) {
          ctx.addIssue({ ...options, message: options.message ?? "Invalid value", input: value });
        }
      }),
    );
  }

  /**
   * Adds a rule that reports issues itself, which allows several issues, nested paths and custom
   * codes. Use {@link Validator.refine} for a plain yes-or-no rule.
   *
   * The function may be async. An exception thrown by it propagates. It runs only when the value
   * already has the right structure.
   *
   * @param fn - Inspects the value and reports failures with `ctx.addIssue`.
   * @returns The validator with the check added.
   */
  check(fn: CheckFn<TOutput>): this {
    return this.addStep((value, ctx) => chain(fn(value, ctx), () => undefined));
  }

  /**
   * Maps the validated value to another value.
   *
   * The function may be async. An exception thrown by it propagates. To reject a value, report an
   * issue with `ctx.addIssue` and return {@link NEVER}.
   *
   * @typeParam TNext - Type the function returns.
   * @param fn - Receives the validated value and the validation context.
   * @returns A validator that outputs the mapped value.
   */
  transform<TNext>(fn: (value: TOutput, ctx: CheckContext) => TNext | Promise<TNext>): Validator<TNext> {
    return new TransformValidator(this, fn);
  }

  /**
   * Feeds the output of this validator into another one.
   *
   * @typeParam TNext - Type the next validator produces.
   * @param next - Validator that receives this validator's output.
   * @returns A validator that runs both in order.
   */
  pipe<TNext>(next: Validator<TNext>): Validator<TNext> {
    return new PipeValidator(this, next);
  }

  /**
   * Requires the input to satisfy this validator and another one, merging their outputs.
   *
   * @typeParam TOther - Type the other validator produces.
   * @param other - Validator the input must also satisfy.
   * @returns A validator producing the intersection of both outputs.
   */
  and<TOther>(other: Validator<TOther>): Validator<TOutput & TOther> {
    return new IntersectionValidator(this, other);
  }

  /**
   * Accepts input that satisfies this validator or another one, trying this one first.
   *
   * @typeParam TOther - Type the other validator produces.
   * @param other - Alternative validator.
   * @returns A validator producing either output.
   */
  or<TOther>(other: Validator<TOther>): Validator<TOutput | TOther> {
    return new UnionValidator([this, other]);
  }
}

/** Validator that also accepts `undefined`, created by {@link Validator.optional}. */
export class OptionalValidator<TOutput> extends Validator<TOutput | undefined> {
  /**
   * Wraps a validator.
   *
   * @param inner - Validator that receives every value except `undefined`.
   */
  constructor(readonly inner: Validator<TOutput>) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TOutput | undefined>> {
    return input === undefined ? pass(undefined) : execute(this.inner, input, ctx);
  }
}

/** Validator that also accepts `null`, created by {@link Validator.nullable}. */
export class NullableValidator<TOutput> extends Validator<TOutput | null> {
  /**
   * Wraps a validator.
   *
   * @param inner - Validator that receives every value except `null`.
   */
  constructor(readonly inner: Validator<TOutput>) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TOutput | null>> {
    return input === null ? pass(null) : execute(this.inner, input, ctx);
  }
}

class DefaultValidator<TOutput> extends Validator<TOutput> {
  constructor(
    private readonly inner: Validator<TOutput>,
    private readonly fallback: TOutput | (() => TOutput),
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TOutput>> {
    if (input !== undefined) {
      return execute(this.inner, input, ctx);
    }
    return pass(typeof this.fallback === "function" ? (this.fallback as () => TOutput)() : this.fallback);
  }
}

class CatchValidator<TOutput> extends Validator<TOutput> {
  constructor(
    private readonly inner: Validator<TOutput>,
    private readonly fallback: TOutput | ((issues: readonly ValidationIssue[]) => TOutput),
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TOutput>> {
    return chain(execute(this.inner, input, ctx), (outcome) => {
      if (outcome.ok) {
        return outcome;
      }
      const fallback = this.fallback;
      return pass(
        typeof fallback === "function"
          ? (fallback as (issues: readonly ValidationIssue[]) => TOutput)(outcome.issues)
          : fallback,
      );
    });
  }
}

class TransformValidator<TOutput, TNext> extends Validator<TNext> {
  constructor(
    private readonly inner: Validator<TOutput>,
    private readonly fn: (value: TOutput, ctx: CheckContext) => TNext | Promise<TNext>,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TNext>> {
    return chain(execute(this.inner, input, ctx), (outcome) => {
      if (!outcome.ok) {
        return outcome;
      }
      const checkCtx = createCheckContext(ctx);
      return chain(this.fn(outcome.value, checkCtx), (next) =>
        checkCtx.issues.length > 0 ? failWith(checkCtx.issues) : pass(next),
      );
    });
  }
}

class PipeValidator<TOutput, TNext> extends Validator<TNext> {
  constructor(
    private readonly first: Validator<TOutput>,
    private readonly second: Validator<TNext>,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TNext>> {
    return chain(execute(this.first, input, ctx), (outcome) =>
      outcome.ok ? execute(this.second, outcome.value, ctx) : outcome,
    );
  }
}

/** Output type of a validator list: the union of what each validator produces. */
type OutputOf<TValidators extends readonly StandardSchemaV1[]> = Infer<TValidators[number]>;

/**
 * Validator that accepts input matching any of several validators, created by {@link union} and
 * {@link Validator.or}.
 *
 * The first validator that accepts the input wins. When none does, one `invalid_union` issue is
 * reported whose `params.issues` lists the issues of each validator, in order.
 *
 * @typeParam TOptions - Validators to try.
 */
export class UnionValidator<TOptions extends readonly [AnyValidator, ...AnyValidator[]]> extends Validator<
  OutputOf<TOptions>
> {
  /**
   * Creates a union.
   *
   * @param options - Validators to try, in order.
   * @param message - Message of the failure when none matches.
   */
  constructor(
    readonly options: TOptions,
    private readonly message?: Message,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<OutputOf<TOptions>>> {
    return chain(
      collect(
        this.options.length,
        (index) => execute(this.options[index] as AnyValidator, input, ctx),
        (outcome) => outcome.ok,
      ),
      (outcomes) => {
        const last = outcomes[outcomes.length - 1];
        if (last?.ok) {
          return last as Outcome<OutputOf<TOptions>>;
        }
        return fail(ctx, {
          code: "invalid_union",
          message: this.message ?? "Input did not match any of the allowed types",
          params: { issues: outcomes.map((outcome) => (outcome.ok ? [] : outcome.issues)) },
          input,
        });
      },
    );
  }
}

const UNSAFE_MERGE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Merges two validated outputs: plain objects deeply, anything else takes the right-hand value. */
function merge(left: unknown, right: unknown): unknown {
  if (!isPlainObject(left) || !isPlainObject(right)) {
    return right;
  }
  const merged: Record<string, unknown> = {};
  for (const source of [left, right]) {
    for (const [key, value] of Object.entries(source)) {
      if (!UNSAFE_MERGE_KEYS.has(key)) {
        setOwn(merged, key, Object.hasOwn(merged, key) ? merge(merged[key], value) : value);
      }
    }
  }
  return merged;
}

/**
 * Validator that requires input to satisfy two validators, created by {@link intersection} and
 * {@link Validator.and}.
 *
 * Both run on the same input and all their issues are reported. Their outputs are merged: plain
 * objects deeply, anything else takes the right-hand output.
 *
 * @typeParam TLeft - Type the left validator produces.
 * @typeParam TRight - Type the right validator produces.
 */
export class IntersectionValidator<TLeft, TRight> extends Validator<TLeft & TRight> {
  /**
   * Creates an intersection.
   *
   * @param left - First validator.
   * @param right - Second validator.
   */
  constructor(
    readonly left: Validator<TLeft>,
    readonly right: Validator<TRight>,
  ) {
    super();
  }

  protected evaluate(input: unknown, ctx: ParseContext): MaybePromise<Outcome<TLeft & TRight>> {
    const sides = [this.left, this.right] as const;
    return chain(
      collect(
        sides.length,
        (index) => execute(sides[index] as AnyValidator, input, ctx),
        ctx.options.abortEarly === true ? (outcome) => !outcome.ok : undefined,
      ),
      (outcomes) => {
        const issues = outcomes.flatMap((outcome) => (outcome.ok ? [] : outcome.issues));
        const [left, right] = outcomes;
        if (issues.length > 0 || !left?.ok || !right?.ok) {
          return failWith(issues);
        }
        return pass(merge(left.value, right.value) as TLeft & TRight);
      },
    );
  }
}

/**
 * Creates a validator that accepts input matching any of the given validators.
 *
 * @example
 * ```ts
 * const id = val.union([val.string().uuid(), val.number().int()]);
 * ```
 *
 * @typeParam TOptions - Validators to try.
 * @param options - Validators to try, in order. The first that accepts the input wins.
 * @param message - Message of the `invalid_union` failure when none matches.
 * @returns A union validator.
 */
export function union<const TOptions extends readonly [AnyValidator, ...AnyValidator[]]>(
  options: TOptions,
  message?: Message,
): UnionValidator<TOptions> {
  return new UnionValidator(options, message);
}

/**
 * Creates a validator that requires input to satisfy both validators and merges their outputs.
 *
 * @example
 * ```ts
 * const admin = val.intersection(val.object({ name: val.string() }), val.object({ role: val.literal("admin") }));
 * ```
 *
 * @typeParam TLeft - Type the left validator produces.
 * @typeParam TRight - Type the right validator produces.
 * @param left - First validator.
 * @param right - Second validator.
 * @returns An intersection validator.
 */
export function intersection<TLeft, TRight>(
  left: Validator<TLeft>,
  right: Validator<TRight>,
): IntersectionValidator<TLeft, TRight> {
  return new IntersectionValidator(left, right);
}
