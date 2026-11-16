import { runOf } from "../core/child";
import { accepter } from "../core/finish";
import { keepResolved } from "../core/lazy";
import { toValidator, wordsIn } from "../core/make";
import { assertFunction, assertOption } from "../core/result";
import {
  after,
  count,
  cut,
  detached,
  FAIL,
  levels,
  report,
  restore,
  scopeNow,
  setLevels,
  type Draft,
  type Run,
} from "../core/run";
import { split } from "../core/split";
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
} from "../core/types";
import { tools } from "../core/wait";
import { wordSize, type Word } from "../core/words";

/** Options for {@link lazy}. */
export interface LazyOptions extends MessageOptions {
  /**
   * The most levels of `lazy` that may be open at once, counting every `lazy` validator, not only this
   * one. Input nested deeper fails with `too_big` instead of exhausting the stack. Since the levels of
   * every `lazy` count, a `maxDepth` of 1 inside another `lazy` fails at once: set it for the whole
   * nesting. A level opened before an await stays open after it, so recursion that waits between levels
   * is held to it too, and asynchronous data nested deeper needs it raised. A worker has about half the
   * stack of a page in Chromium and Firefox, so a schema with many validators at each level that runs in
   * one needs it lowered.
   *
   * @defaultValue 128
   */
  maxDepth?: number | undefined;
  /**
   * The most calls this `lazy` may make in one validation, those made for the options a `union` tries
   * and fails included; a result this `lazy` already found for an object is not a call, and
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
 * What a `lazy` found for an object at one depth of one validation: what its run gave, which is a result
 * that waits until it settles, and the issues it reported. An issue is kept as it is, with the list its
 * path is written in and how long that list was then, since such a list only ever grows: a copy of every
 * issue at every level of a failure took time that grew with the square of the depth.
 */
interface Kept {
  readonly depth: number;
  value: unknown;
  issues?: Draft[];
  paths?: ValidationPathSegment[][];
  sizes?: number[];
  /** What was found for the same object at another depth. */
  readonly other: Kept | undefined;
}

/** Keeps for `kept` the issues reported since `from`, which stay where they are. */
function keepIssues(kept: Kept, from: number): void {
  const list = cut(from);
  if (list !== undefined) {
    kept.issues = list;
    kept.paths = list.map((each) => each.path);
    kept.sizes = list.map((each) => each.path.length);
    restore(list);
  }
}

/**
 * Gives again what was kept: the value, once a copy of each issue is reported as it first was, at the
 * object. A copy, since each place the object is reached at goes on to write its own path.
 */
function again(kept: Kept): unknown {
  const { value, issues } = kept;
  if (tools.is(value)) {
    // It has settled by the time this runs, so what it reported gives way to copies, as for any other.
    return tools.after(count(), value, (_, from) => {
      cut(from);
      return again(kept);
    });
  }
  if (issues !== undefined) {
    const { paths, sizes } = kept as Required<Kept>;
    restore(
      issues.map((each, index) => ({
        ...each,
        path: (paths[index] as ValidationPathSegment[]).slice(0, sizes[index]),
      })),
    );
  }
  return value;
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
 * checked without a size cap tuned to the stack. A level opened before an await is still open after it,
 * so a rule that awaits between levels does not reset the count: an asynchronous recursive schema is held
 * to `maxDepth` too, a cyclic object included, and its issues, each holding its full path, stay small.
 * Asynchronous data nested deeper than the limit needs it raised, which costs no stack, since what runs
 * after an await starts from a fresh one.
 *
 * Work can also grow faster than the input. A `union` tries every option, and an `object` checks every
 * property even after one fails, so in a recursive `union` of objects every option reaches the children.
 * A `lazy` keeps what it found for each object in one validation, and gives it again when the same
 * object is reached again as many `lazy` levels down, wherever that is, so those options share the
 * children's result and the work grows with the input. An asynchronous check under it runs once for each
 * such object, however many options reach it. When the input holds one object in two places, the
 * value produced holds one output object in both. Work that makes new objects at every level, such as a `transform` that
 * copies its value, cannot be shared and doubles with each level. `maxCalls` stops that:
 * past that many calls of one `lazy` in one validation, every further one fails with `too_big` and
 * `{ maximum, type: "calls" }`. A validation is a call such as `schema(input)` and everything it reaches
 * before it settles, whatever validator its root is, so the items of an `array` share each `lazy`'s
 * count. Unlike `maxDepth`, each `lazy` counts its own calls against its own limit, so a limit set on one
 * is never overridden by another that the validation reaches. Like `maxDepth`, it lasts across awaits: what runs after an await counts toward the same
 * validation, so an asynchronous recursive schema is held to it as well. That holds for the awaits of
 * this package, such as an asynchronous check's: an await inside a validator you write yourself is not
 * seen, so what that validator calls after it starts a validation of its own, with fresh counts, and
 * neither limit bounds recursion through it. Put asynchronous work in a check, or bound such a
 * validator yourself. The issues found on the way are kept, each with a path no deeper than `maxDepth`
 * allows, about 1 to 2 KB per call, so the default holds a validation stopped by the limit to about 20 MB
 * and a few tenths of a second for each `lazy`. Raise it for trusted recursive data with more nodes
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
 * from the returned validator on its first use, when `getter` returns something that is not a validator of this copy of the package.
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
  const [options, checks] = split<LazyOptions, unknown>(rest, "maxDepth maxCalls");
  const { maxDepth = DEFAULT_MAX_DEPTH, maxCalls = DEFAULT_MAX_CALLS, message } = options;
  assertLimit("maxDepth", maxDepth);
  assertLimit("maxCalls", maxCalls);
  const accept = accepter(checks, message);
  const finish = checks.length > 0 ? (value: unknown): unknown => (value === FAIL ? FAIL : accept(value)) : undefined;
  let resolved: AnyValidator | undefined;
  let runInner: Run | undefined;
  // Names this `lazy` to the results it keeps, which are its own, since another `lazy` may validate
  // the same object otherwise.
  const self = {};
  // Names this `lazy` to the count of calls: its own, or that of the `lazy` whose getter made it.
  const counted = building ?? self;
  const resolve = (): Run => {
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
    keepResolved(validator, resolved);
    return runOf(resolved, "getter()");
  };
  const validate = (input: unknown, isPrimitive: boolean): unknown => {
    const tooMany = (): unknown => report("too_big", { maximum: maxCalls, type: "calls" }, message);
    // One primitive past the limit is let through to see whether it ends the recursion, in which case it
    // was never a call to count: refused here, the last value of a tree with exactly `maxCalls` objects
    // failed it. Its call is given back only if it does end it, so a second one finds the count two past
    // the limit and is refused, after an await too, and nothing runs on past the limit.
    const calls = (scopeNow().calls ??= new Map<object, number>());
    const spent = (calls.get(counted) ?? 0) + 1;
    calls.set(counted, spent);
    const isOver = spent > maxCalls;
    if (spent > maxCalls + (isPrimitive ? 1 : 0)) {
      return tooMany();
    }
    const open = levels();
    if (open >= maxDepth) {
      return report("too_big", { maximum: maxDepth, type: "depth" }, message);
    }
    setLevels(open + 1);
    started += 1;
    const mark = started;
    const from = count();
    try {
      runInner ??= resolve();
      const value = runInner(input);
      const outcome = finish === undefined ? value : after(tools, from, value, finish);
      // A primitive that reached no further `lazy` call cannot multiply the work, so it is not held against
      // the limit: a long flat list of numbers under a recursive schema is no more work than its length. One
      // the recursion goes on through, as text a `json` or a `transform` reads the next level from, stays
      // counted, and so does one whose result is pending, since calls made meanwhile cannot be told apart.
      if (isPrimitive && started === mark && !tools.is(outcome)) {
        calls.set(counted, (calls.get(counted) as number) - 1);
        return outcome;
      }
      if (isOver) {
        // What it reported goes with it. A result that waits has reported nothing here, and a rejection
        // of it is handled where it was made, since nothing waits for it now.
        cut(from);
        return tooMany();
      }
      return outcome;
    } finally {
      setLevels(open);
    }
  };
  // An object reached again in one validation, as each option of a `union` reaches the children, is
  // validated once. What was found is relative to the object, so it holds wherever the object is reached.
  // A primitive is not kept: it has no children, so validating it again cannot multiply the work.
  const run: Run = (input) => {
    if ((typeof input !== "object" && typeof input !== "function") || input === null) {
      return validate(input, true);
    }
    const all = (scopeNow().results ??= new Map<object, unknown>());
    let mine = all.get(self) as Map<object, Kept> | undefined;
    if (mine === undefined) {
      mine = new Map();
      all.set(self, mine);
    }
    // Two options may reach the object through different numbers of levels, and a result found nearer
    // `maxDepth` may have failed for that alone, so each is kept for the depth it was found at.
    const depth = levels();
    for (let found = mine.get(input); found !== undefined; found = found.other) {
      if (found.depth === depth) {
        return again(found);
      }
    }
    const from = count();
    const value = validate(input, false);
    // Read now, and not before: an object that holds itself was kept, deeper, while it was validated.
    const kept: Kept = { depth, value, other: mine.get(input) };
    mine.set(input, kept);
    if (tools.is(value)) {
      kept.value = tools.after(from, value, (later, begin) => {
        kept.value = later;
        if (later === FAIL) {
          keepIssues(kept, begin);
        }
        return later;
      });
      return kept.value;
    }
    if (value === FAIL) {
      keepIssues(kept, from);
    }
    return value;
  };
  run.w = tools;
  // What the validator the getter returns reports is worded by that validator's words, which are not
  // known when this one is made. It may hold this one, so a word asked for while one is looked for is none.
  let isWording = false;
  const wordInner: Word = (found) => {
    if (isWording) {
      return undefined;
    }
    isWording = true;
    try {
      for (const word of wordsIn(resolved)) {
        const text = word(found);
        if (text !== undefined) {
          return text;
        }
      }
      return undefined;
    } finally {
      isWording = false;
    }
  };
  const validator: AnyValidator = toValidator(run, { kind: "lazy", options, checks, getter }, [wordSize, wordInner]);
  return validator;
}
