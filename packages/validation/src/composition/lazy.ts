import { chain, detached, resultsOf, spendCall, type Maybe } from "../core/async";
import { tail } from "../core/checks";
import { call, composed, type Place } from "../core/nesting";
import { assertFunction, assertOption, issue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  MessageOptions,
  Rest,
  ValidationPathSegment,
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
   * The most calls this `lazy` may make in one validation, those made for the options a `union` tries
   * and fails included; a result this `lazy` already found for an object at a path is not a call. Past
   * it, every further call fails with `too_big`, so a schema whose work grows faster than its input stops
   * instead of running for hours on a few hundred bytes. A validation is a call such as
   * `schema(input)` and everything it reaches before it settles, after any await included, so an `array` of recursive items shares
   * this `lazy`'s count, and validations made one after another, or from a callback such as a check's
   * test, or after an await inside a validator you write yourself, have counts of their own. Each `lazy`
   * counts its own calls against its own limit, so no other `lazy` overrides it. Recursive data with more
   * nodes than this in one validation needs it raised.
   *
   * @defaultValue 10000
   */
  maxCalls?: number;
}

const DEFAULT_MAX_DEPTH = 128;
const DEFAULT_MAX_CALLS = 10_000;

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

/** A result a `lazy` kept, and the place it was found at. */
interface Kept {
  readonly place: Place;
  readonly result: Maybe<ValidationResult<unknown>>;
}

/** Results kept for each object, by the last segment of the place it was found at, the root's undefined. */
type Results = Map<object, Map<ValidationPathSegment | undefined, Kept[]>>;

/** Tests whether two places are at the same path, comparing segments from the deepest up. */
function isSamePath(left: Place, right: Place): boolean {
  let one = left;
  let other = right;
  while (one !== undefined && other !== undefined) {
    if (one === other) {
      return true;
    }
    if (one.segment !== other.segment) {
      return false;
    }
    one = one.parent;
    other = other.parent;
  }
  return one === other;
}

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
 * bound an asynchronous recursive schema; `maxCalls` does, below, since each level is a `lazy` call
 * and the count of calls lasts across awaits, so even a cyclic object stops.
 *
 * Work can also grow faster than the input. A `union` tries every option, and an `object` checks every
 * property even after one fails, so in a recursive `union` of objects every option reaches the children.
 * A `lazy` keeps what it found for each object at each path in one validation, and gives it again when
 * the same object is reached at the same path, so those options share the children's result and the
 * work grows with the input. An asynchronous check under it runs once for each such object and path,
 * however many options reach it. Work that makes new objects at every level, such as a `transform` that
 * copies its value, cannot be shared and doubles with each level. `maxCalls` stops that:
 * past that many calls of one `lazy` in one validation, every further one fails with `too_big` and
 * `{ maximum, type: "calls" }`. A validation is a call such as `schema(input)` and everything it reaches
 * before it settles, whatever validator its root is, so the items of an `array` share each `lazy`'s
 * count. Unlike `maxDepth`, each `lazy` counts its own calls against its own limit, so a limit set on one
 * is never overridden by another that the validation reaches. Unlike `maxDepth` too, it lasts across awaits: what runs after an await counts toward the same
 * validation, so an asynchronous recursive schema is held to it as well. That holds for the awaits of
 * this package, such as an asynchronous check's: an await inside a validator you write yourself is not
 * seen, so what that validator calls after it starts a validation of its own, with fresh counts, and
 * `maxCalls` does not bound recursion through it. Put asynchronous work in a check, or bound such a
 * validator yourself. The issues of
 * the options that failed are kept, about 1 KB per call, so the default holds a validation stopped by the
 * limit to about 10 MB and a few tens of milliseconds for each `lazy`. Raise it for trusted recursive data with more nodes
 * than that in one validation. For recursive objects told apart by a property, `tagged` reads that
 * property first and validates only the matching variant.
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
  // Names this `lazy` to the count of calls, which keeps one per `lazy`.
  const self = {};
  const validate = (input: unknown, place: Place): Maybe<ValidationResult<unknown>> => {
    if (spendCall(self, maxCalls)) {
      return reject([issue("too_big", { maximum: maxCalls, type: "calls" })], place);
    }
    if (openDepth >= maxDepth) {
      return reject([issue("too_big", { maximum: maxDepth, type: "depth" })], place);
    }
    openDepth += 1;
    try {
      if (resolved === undefined) {
        const found: unknown = detached(getter, undefined);
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
  };
  // An object reached again at the same path in one validation, as each option of a `union` reaches the
  // children, is validated once. The path is part of the key, since the issues are written at it. A
  // primitive is not kept: it has no children, so validating it again cannot multiply the work.
  return composed((input, place) => {
    const results = resultsOf(self) as Results | undefined;
    if ((typeof input !== "object" && typeof input !== "function") || input === null || results === undefined) {
      return validate(input, place);
    }
    const bySegment = results.get(input) ?? new Map<ValidationPathSegment | undefined, Kept[]>();
    results.set(input, bySegment);
    const kept = bySegment.get(place?.segment) ?? [];
    bySegment.set(place?.segment, kept);
    const found = kept.find((each) => isSamePath(each.place, place));
    if (found !== undefined) {
      return found.result;
    }
    const result = validate(input, place);
    kept.push({ place, result });
    return result;
  });
}
