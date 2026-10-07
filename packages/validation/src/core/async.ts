/*
 * The sync-until-async plumbing. A validator is synchronous exactly when everything it runs is, and
 * these two helpers are how composers keep that promise without a second code path: they stay
 * synchronous while nothing is a promise, and switch to promises the moment something is.
 *
 * They are named `chain` and `collect`, never `then`: a module exporting `then` is a thenable, and
 * importing it can hang in some loaders.
 *
 * It also tracks a validation: a call such as `schema(input)` and everything it reaches, the
 * continuations after its awaits included. Each `lazy` counts its calls per validation against its own
 * limit, whatever other `lazy` validators the validation reaches, and waiting resets nothing.
 */

/** A value that may still be pending. */
export type Maybe<T> = T | PromiseLike<T>;

/**
 * One validation: how many calls each `lazy` it reached has made, and the results each kept, keyed by that
 * `lazy`. Each map is made by the first `lazy` that needs it, since most validations reach none.
 */
interface Validation {
  calls: Map<object, number> | undefined;
  results: Map<object, unknown> | undefined;
}

/** The validation running now, or undefined between validations and in a consumer's callback. */
let current: Validation | undefined;

/**
 * Runs `work` with `validation` as the one running, and restores the one that was running when it
 * returns. Undefined runs it outside any, and a composer it reaches starts one of its own.
 */
function enter<A, R>(validation: Validation | undefined, work: (argument: A) => R, argument: A): R {
  const previous = current;
  current = validation;
  try {
    return work(argument);
  } finally {
    current = previous;
  }
}

/**
 * Runs `work` as part of the validation running now, starting one when none is, so everything it
 * reaches shares each `lazy`'s count. Only composers start one, so a leaf never carries this.
 */
export const within = <A, R>(work: (argument: A) => R, argument: A): R =>
  enter(current ?? { calls: undefined, results: undefined }, work, argument);

/**
 * Runs a callback the consumer wrote, such as a check's test or a transform's function, apart from
 * the validation running now, so a validator it calls is a validation of its own, with counts of its own.
 */
export const detached = <A, R>(callback: (argument: A) => R, argument: A): R => enter(undefined, callback, argument);

/**
 * The results the `lazy` named by `key` has kept in the validation running now, which it alone reads
 * and writes, made by `make` the first time, or undefined outside a validation.
 */
export function resultsOf<T>(key: object, make: () => T): T | undefined {
  if (current === undefined) {
    return undefined;
  }
  const results = (current.results ??= new Map<object, unknown>());
  let kept = results.get(key) as T | undefined;
  if (kept === undefined) {
    kept = make();
    results.set(key, kept);
  }
  return kept;
}

/**
 * Counts a call of the `lazy` named by `key` in the validation running now, and gives how many that
 * `lazy` has now made in it, for the `lazy` to hold against its own limit.
 */
export function spendCall(key: object): number {
  if (current === undefined) {
    // Every composer runs within a validation, so this only guards a call made outside one.
    return 0;
  }
  const calls = (current.calls ??= new Map<object, number>());
  const spent = (calls.get(key) ?? 0) + 1;
  calls.set(key, spent);
  return spent;
}

/** Takes back the call {@link spendCall} last counted for the `lazy` named by `key`, in the validation running now. */
export function refundCall(key: object): void {
  current?.calls?.set(key, (current.calls.get(key) ?? 1) - 1);
}

/** Tests whether a value is a promise, or anything else with a `then` method. */
export const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/**
 * Runs a test the consumer wrote, as {@link detached} does, and gives its answer. A promise is refused
 * with a `TypeError` naming `builder`, since a pending answer is truthy and would accept every value: a
 * rule that waits belongs in a check, whose promise is awaited.
 */
export function decided<A, R>(builder: string, test: (argument: A) => R, argument: A): R {
  const answer = detached(test, argument);
  if (isThenable(answer)) {
    // The promise is abandoned, so a later rejection is not reported as unhandled.
    // oxlint-disable-next-line promise/prefer-await-to-then
    answer.then(undefined, () => undefined);
    throw new TypeError(`${builder}() needs a synchronous test. Put a rule that waits in a check.`);
  }
  return answer;
}

/**
 * Applies `next` to a value that may still be pending, staying synchronous when it is not. A pending
 * value's continuation stays part of the validation that was running when it was chained.
 *
 * A validator's own result is a plain object, so a value with a `then` inside it is not mistaken
 * for a pending result. What `transform` and `check` get back from the consumer's callback is
 * another matter: a value with a `then` method is treated as a promise there, as `await` would.
 */
export function chain<T, R>(value: Maybe<T>, next: (resolved: T) => Maybe<R>): Maybe<R> {
  if (!isThenable(value)) {
    return next(value);
  }
  const validation = current;
  // Adopted as `await` adopts it, so a thenable whose `then` returns nothing, or calls back at once, still
  // gives a promise of what `next` returns; `Promise.resolve` returns a native promise as it is. A thenable
  // has to be unwrapped with `then`; the alternative to `await` is the point of this helper.
  // oxlint-disable-next-line promise/prefer-await-to-then, promise/no-callback-in-promise
  return Promise.resolve(value).then((resolved) => enter(validation, next, resolved));
}

/**
 * Runs `work` for each index below `length` and gives what each returned, as `Array.from` would. When one
 * throws, what the earlier ones returned may be pending, and nothing will wait for it now, so a rejection
 * of it is handled before the exception propagates: unhandled, it is reported apart from the exception
 * and, by default, ends a Node.js process.
 */
export function runEach<R>(length: number, work: (index: number) => R): R[] {
  const results: R[] = [];
  try {
    for (let index = 0; index < length; index += 1) {
      results.push(work(index));
    }
  } catch (error) {
    // Waiting on all of them handles a rejection of each, and a result that is not pending is ignored.
    // oxlint-disable-next-line promise/prefer-await-to-then, promise/catch-or-return
    Promise.all(results).catch(() => undefined);
    throw error;
  }
  return results;
}

/**
 * Gathers the results of several validators, synchronously when none is pending and as one promise
 * otherwise. Results keep the order of the input, never the order in which promises settled.
 */
export function collect<R>(items: readonly Maybe<R>[]): Maybe<R[]> {
  return items.some(isThenable) ? Promise.all(items) : (items as R[]);
}
