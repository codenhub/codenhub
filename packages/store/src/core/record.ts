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
