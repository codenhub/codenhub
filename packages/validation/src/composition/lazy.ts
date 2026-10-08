import { chain, detached, isThenable, refundCall, resultsOf, spendCall, type Maybe } from "../core/async";
import { tail } from "../core/checks";
import { described } from "../core/describe";
import { call, composed, type Place } from "../core/nesting";
import { assertFunction, assertOption, issue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncSchema,
  Composed,
  Infer,
  InferInput,
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
   * nesting. A worker has about half the stack of a page in Chromium and Firefox, so a schema with many
   * validators at each level that runs in one needs it lowered.
   *
   * @defaultValue 128
   */
  maxDepth?: number | undefined;
  /**
   * The most calls this `lazy` may make in one validation, those made for the options a `union` tries
   * and fails included; a result this `lazy` already found for an object at a path is not a call, and
   * neither is a primitive, such as a number in a list, that reaches no further `lazy` call and whose
   * result is not pending. Past
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
  maxCalls?: number | undefined;
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

/**
 * The count of the `lazy` whose getter is running, which a `lazy` made by that getter shares. A schema
 * built anew at every level, by a getter that calls the function that builds it, would otherwise make
 * a `lazy` with a fresh count at every level, and its work would have no bound.
 */
let building: object | undefined;

/**
 * How many `lazy` calls have started, of every `lazy`. A call during which it did not move reached no
 * other, which is how a primitive that ends the recursion is told from one the recursion goes on through.
 */
let started = 0;

/**
 * A path met in one validation: the paths one segment below it, and what a `lazy` kept for each object
 * it found there. Every place at one path leads to the same one, so what was kept for an object at a
 * path is found by the object alone. Kept by the last segment of the place instead, and compared with
 * each place the object was already found at, 80,000 rows that shared ten objects took 7.8 seconds.
 */
interface Spot {
  below?: Map<ValidationPathSegment, Spot>;
  results?: Map<object, Maybe<ValidationResult<unknown>>>;
}

/** The paths a `lazy` has met in one validation: the root's, and the one each place it has seen leads to. */
interface Paths {
  readonly root: Spot;
  readonly spots: Map<object, Spot>;
}

const newPaths = (): Paths => ({ root: {}, spots: new Map() });

/**
 * The path a place is at. It walks up to the nearest place already seen, the parent's in a recursion, and
 * remembers each place it passed, so every place is walked once and a deep one costs no more than a shallow.
 */
function spotOf(place: Place, { root, spots }: Paths): Spot {
  const unseen: NonNullable<Place>[] = [];
  let spot: Spot | undefined;
  for (let node = place; node !== undefined && spot === undefined; node = node.parent) {
    spot = spots.get(node);
    if (spot === undefined) {
      unseen.push(node);
    }
  }
  spot ??= root;
  for (let index = unseen.length - 1; index >= 0; index -= 1) {
    const each = unseen[index] as NonNullable<Place>;
    spot.below ??= new Map();
    let next = spot.below.get(each.segment);
    if (next === undefined) {
      next = {};
      spot.below.set(each.segment, next);
    }
    spots.set(each, next);
    spot = next;
  }
  return spot;
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
 * limit to about 10 MB and a few tenths of a second for each `lazy`. Raise it for trusted recursive data with more nodes
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
): Composed<TValidator, Infer<TValidator>, InferInput<TValidator>>;
export function lazy<TValidator extends AnyValidator>(
  getter: () => TValidator,
  ...rest: AsyncRest<Infer<TValidator>, LazyOptions>
): AsyncSchema<Infer<TValidator>, InferInput<TValidator>>;
export function lazy(getter: () => AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("getter", getter);
  const [options, reject, accept, checks] = tail<LazyOptions, unknown>(rest, "maxDepth maxCalls");
  const { maxDepth = DEFAULT_MAX_DEPTH, maxCalls = DEFAULT_MAX_CALLS } = options;
  assertLimit("maxDepth", maxDepth);
  assertLimit("maxCalls", maxCalls);
  let resolved: AnyValidator | undefined;
  // Names this `lazy` to the results it keeps, which are its own, since another `lazy` may validate
  // the same object at the same path otherwise.
  const self = {};
  // Names this `lazy` to the count of calls: its own, or that of the `lazy` whose getter made it.
  const counted = building ?? self;
  const validate = (input: unknown, place: Place, isPrimitive: boolean): Maybe<ValidationResult<unknown>> => {
    const tooMany = (): ValidationResult<unknown> =>
      reject([issue("too_big", { maximum: maxCalls, type: "calls" })], place);
    // One primitive past the limit is let through to see whether it ends the recursion, in which case it
    // was never a call to count: refused here, the last value of a tree with exactly `maxCalls` objects
    // failed it. Its call is given back only if it does end it, so a second one finds the count two past
    // the limit and is refused, after an await too, and nothing runs on past the limit.
    const spent = spendCall(counted);
    const isOver = spent > maxCalls;
    if (spent > maxCalls + (isPrimitive ? 1 : 0)) {
      return tooMany();
    }
    if (openDepth >= maxDepth) {
      return reject([issue("too_big", { maximum: maxDepth, type: "depth" })], place);
    }
    openDepth += 1;
    started += 1;
    const mark = started;
    try {
      if (resolved === undefined) {
        const previous = building;
        building = counted;
        let found: unknown;
        try {
          found = detached(getter, undefined);
        } finally {
          building = previous;
        }
        if (typeof found !== "function") {
          throw new TypeError(`getter() must return a function, received ${found === null ? "null" : typeof found}`);
        }
        resolved = found as AnyValidator;
      }
      const outcome = chain(call(resolved, input, place), (result: ValidationResult<unknown>) =>
        result.ok ? accept(result.value, place) : result,
      );
      // A primitive that reached no further `lazy` call cannot multiply the work, so it is not held against
      // the limit: a long flat list of numbers under a recursive schema is no more work than its length. One
      // the recursion goes on through, as text a `json` or a `transform` reads the next level from, stays
      // counted, and so does one whose result is pending, since calls made meanwhile cannot be told apart.
      if (isPrimitive && started === mark && !isThenable(outcome)) {
        refundCall(counted);
        return outcome;
      }
      if (isOver) {
        // Nothing waits for a result that is pending now, so a rejection of it is handled here.
        // oxlint-disable-next-line promise/prefer-await-to-then, promise/catch-or-return
        Promise.resolve(outcome).catch(() => undefined);
        return tooMany();
      }
      return outcome;
    } finally {
      openDepth -= 1;
    }
  };
  // An object reached again at the same path in one validation, as each option of a `union` reaches the
  // children, is validated once. The path is part of the key, since the issues are written at it. A
  // primitive is not kept: it has no children, so validating it again cannot multiply the work.
  return described(
    composed((input, place) => {
      const paths = resultsOf(self, newPaths);
      const isPrimitive = (typeof input !== "object" && typeof input !== "function") || input === null;
      if (isPrimitive || paths === undefined) {
        return validate(input, place, isPrimitive);
      }
      const spot = spotOf(place, paths);
      const kept = (spot.results ??= new Map());
      const found = kept.get(input as object);
      if (found !== undefined) {
        return found;
      }
      const result = validate(input, place, false);
      kept.set(input as object, result);
      return result;
    }),
    { kind: "lazy", options, checks, getter },
  );
}
