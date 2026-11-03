const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !Array.isArray(value) && Object.prototype.toString.call(value) === "[object Object]";

/**
 * Fills fields missing from a stored record with their initial values, so a record saved before a
 * field was added still has it. Non-plain values, such as arrays, are returned unchanged.
 *
 * @internal
 */
export function withDefaults<T extends object>(initialState: T, stored: object): object {
  return isPlainObject(initialState) && isPlainObject(stored) ? { ...initialState, ...stored } : stored;
}

/**
 * Applies a patch, skipping fields whose value is `undefined` so a required field is never dropped.
 *
 * @internal
 */
export function applyPatch<T extends object>(state: T, partialState: Partial<T>): T {
  const nextState = { ...state };
  for (const [key, value] of Object.entries(partialState)) {
    if (value !== undefined) {
      (nextState as Record<string, unknown>)[key] = value;
    }
  }
  return nextState;
}
