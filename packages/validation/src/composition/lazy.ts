import { chain, spendCall } from "../core/async";
import { tail } from "../core/checks";
import { call, composed } from "../core/nesting";
import { assertFunction, assertOption, issue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  MessageOptions,
  Rest,
  ValidationResult,
} from "../core/types";

/** Options for {@link lazy}. */
export interface LazyOptions extends MessageOptions {
  /**
   * The most levels of `lazy` that may be open at once, counting every `lazy` validator, not only this
   * one. Input nested deeper fails with `too_big` instead of exhausting the stack. Since the levels of
   * every `lazy` count, a `maxDepth` of 1 inside another `lazy` fails at once: set it for the whole
   * nesting.
   *
   * @defaultValue 128
   */
  maxDepth?: number;
  /**
   * The most `lazy` calls one validation may make, counting every `lazy` validator, those of the options
   * a `union` tries and fails included. Past it, every further call fails with `too_big`, so a schema
   * whose work grows faster than its input, such as a recursive `union` of objects, which doubles with
   * each level, stops instead of running for hours on a few hundred bytes. A validation is a call such as
   * `schema(input)` and everything it reaches before it returns, so an `array` of recursive items shares
   * one count, and validations made one after another have one each. The limit of the first `lazy` a
   * validation reaches holds the whole of it, so set it on the outermost one. Recursive data with more
   * nodes than this in one validation needs it raised.
   *
   * @defaultValue 100000
   */
  maxCalls?: number;
}

const DEFAULT_MAX_DEPTH = 128;
const DEFAULT_MAX_CALLS = 100_000;

/** Rejects a limit that is not a positive integer, since it is a mistake in the schema and not in the input. */
function assertLimit(name: string, value: number): void {
  assertOption(name, value, "number");
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, received ${value}`);
  }
}

/**
 * How many `lazy` calls are running right now. It only counts calls that are still on the stack:
 * one that returned a promise is finished as far as the stack is concerned, and its continuation
 * starts from a shallow one. That is the depth that can overflow.
 */
let openDepth = 0;

/**
 * Creates a validator that looks up another validator the first time it runs, so a validator can
 * refer to itself for recursive data such as a tree or a comment thread.
 *
 * @remarks
 * TypeScript cannot infer a validator that refers to itself, so annotate the variable with the type
 * it produces. The getter runs once and its result is reused.
 *
 * Every level of nesting is a level of recursion, and input nested past the stack, or a cyclic
 * object, would throw. `maxDepth` stops that first: a value found more than that many levels down
 * fails with `too_big` and `{ maximum, type: "depth" }` at its own path, so untrusted input can be
 * checked without a size cap tuned to the stack. The count is of calls on the stack, so it bounds
 * recursion that happens in one synchronous run, which is where the stack can overflow; a rule that
 * awaits between levels starts the next from a fresh stack, and is not counted. So `maxDepth` does not
 * bound an asynchronous recursive schema: it follows input of any depth, and a cyclic object until
 * memory runs out. Give such a schema a bound of its own.
 *
 * Work can also grow faster than the input. A `union` tries every option, and an `object` checks every
 * property even after one fails, so a recursive `union` of objects recurses through every option at
 * every level, and its work doubles with each: a few hundred bytes can take hours. `maxCalls` stops that:
 * past that many `lazy` calls in one validation, every further one fails with `too_big` and
 * `{ maximum, type: "calls" }`. A validation is a call such as `schema(input)` and everything it reaches
 * before it returns, whatever validator its root is, so the items of an `array` share one count. Unlike
 * `maxDepth`, the limit is read from the first `lazy` the validation reaches, and holds the whole of it.
 * Like `maxDepth`, it counts one synchronous run: what runs after an await counts afresh. The issues of
 * the options that failed are kept, so at the default a validation stopped by the limit can hold about
 * 100 MB of them: lower `maxCalls` for untrusted input whose data is small. For recursive objects told
 * apart by a property, `tagged` reads that property first and does no such work.
 *
 * @example
 * ```ts
 * interface Category {
 *   name: string;
 *   children: Category[];
 * }
 *
 * const category: Validator<Category> = object({
 *   name: string(),
 *   children: array(lazy(() => category)),
 * });
 * ```
 *
 * @typeParam TValidator - The validator the getter returns.
 * @param getter - Returns the validator. Called once, on first use.
 * @param rest - The depth and call limits, then checks.
 * @returns A validator that behaves as the one the getter returns.
 * @throws {TypeError} When `getter` is not a function or `maxDepth` or `maxCalls` is not a number, and,
 * from the returned validator on its first use, when `getter` returns something that is not a function.
 * @throws {RangeError} When `maxDepth` or `maxCalls` is not a positive integer.
 */
export function lazy<TValidator extends AnyValidator>(
  getter: () => TValidator,
  ...rest: Rest<Infer<TValidator>, LazyOptions>
): Composed<TValidator, Infer<TValidator>>;
export function lazy<TValidator extends AnyValidator>(
  getter: () => TValidator,
  ...rest: AsyncRest<Infer<TValidator>, LazyOptions>
): AsyncValidator<Infer<TValidator>>;
export function lazy(getter: () => AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("getter", getter);
  const [options, reject, accept] = tail<LazyOptions, unknown>(rest);
  const { maxDepth = DEFAULT_MAX_DEPTH, maxCalls = DEFAULT_MAX_CALLS } = options;
  assertLimit("maxDepth", maxDepth);
  assertLimit("maxCalls", maxCalls);
  let resolved: AnyValidator | undefined;
  return composed((input, place) => {
    const exceeded = spendCall(maxCalls);
    if (exceeded !== undefined) {
      return reject([issue("too_big", { maximum: exceeded, type: "calls" })], place);
    }
    if (openDepth >= maxDepth) {
      return reject([issue("too_big", { maximum: maxDepth, type: "depth" })], place);
    }
    openDepth += 1;
    try {
      if (resolved === undefined) {
        const found: unknown = getter();
        if (typeof found !== "function") {
          throw new TypeError(`getter() must return a function, received ${found === null ? "null" : typeof found}`);
        }
        resolved = found as AnyValidator;
      }
      return chain(call(resolved, input, place), (result: ValidationResult<unknown>) =>
        result.ok ? accept(result.value, place) : result,
      );
    } finally {
      openDepth -= 1;
    }
  });
}
