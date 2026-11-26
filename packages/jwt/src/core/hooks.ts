/**
 * Keeps what a caller's hook returned from becoming an unhandled rejection: when it is a thenable, a promise of
 * this realm or another (a `vm` context or an iframe, which `instanceof Promise` misses) or any object with a
 * `then` method, its rejection is swallowed. `then` is read once; a getter or a `then` that throws is
 * swallowed too, so this never throws.
 *
 * @returns A promise that resolves once `result` settles and never rejects, or `undefined` when `result` is not a
 * thenable.
 */
export function quietly(result: unknown): Promise<void> | undefined {
  if ((typeof result !== "object" && typeof result !== "function") || result === null) {
    return undefined;
  }
  let then: unknown;
  try {
    then = (result as { then?: unknown }).then;
  } catch {
    return undefined;
  }
  if (typeof then !== "function") {
    return undefined;
  }
  return new Promise<void>((resolve) => {
    const settle = (): void => resolve();
    try {
      (then as (onFulfilled: () => void, onRejected: () => void) => unknown).call(result, settle, settle);
    } catch {
      resolve();
    }
  });
}
