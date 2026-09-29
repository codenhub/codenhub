/*
 * Validation stays synchronous until a user callback actually returns a promise, so these helpers
 * chain with `.then` instead of `await`: `await` would make every validator asynchronous.
 */
/* oxlint-disable promise/prefer-await-to-then */

/** A value that is either available now or resolves later. */
export type MaybePromise<T> = T | Promise<T>;

/** Tests whether a value is a promise or another thenable. */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

/** Applies `step` to a value that may still be pending, staying synchronous when it is not. */
export function chain<T, U>(value: MaybePromise<T>, step: (settled: T) => MaybePromise<U>): MaybePromise<U> {
  return isPromiseLike(value) ? Promise.resolve(value as PromiseLike<T>).then(step) : step(value as T);
}

function sequence<T>(
  count: number,
  run: (index: number) => MaybePromise<T>,
  stopWhen: (result: T) => boolean,
): MaybePromise<T[]> {
  const results: T[] = [];

  const from = (start: number): MaybePromise<T[]> => {
    for (let index = start; index < count; index++) {
      const result = run(index);
      if (isPromiseLike(result)) {
        return Promise.resolve(result as PromiseLike<T>).then((settled) => {
          results.push(settled);
          return stopWhen(settled) ? results : from(index + 1);
        });
      }
      results.push(result as T);
      if (stopWhen(result as T)) {
        break;
      }
    }
    return results;
  };

  return from(0);
}

/**
 * Runs `run` for indexes `0..count-1` and gathers the results in index order.
 *
 * Without `stopWhen` every index starts immediately, so pending work overlaps. With it the indexes
 * run one after another and stop after the first result it accepts, so no work starts past a
 * failure. Either way the result is synchronous unless a call returns a promise.
 */
export function collect<T>(
  count: number,
  run: (index: number) => MaybePromise<T>,
  stopWhen?: (result: T) => boolean,
): MaybePromise<T[]> {
  if (stopWhen !== undefined) {
    return sequence(count, run, stopWhen);
  }

  const results: MaybePromise<T>[] = [];
  let isPending = false;
  for (let index = 0; index < count; index++) {
    const result = run(index);
    isPending ||= isPromiseLike(result);
    results.push(result);
  }
  return isPending ? Promise.all(results) : (results as T[]);
}

/** Keeps a promise that nobody will await from raising an unhandled rejection when it fails later. */
export function abandon(pending: PromiseLike<unknown>): void {
  Promise.resolve(pending).catch(() => undefined);
}
