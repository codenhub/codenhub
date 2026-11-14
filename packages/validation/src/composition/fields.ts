import { setOwn } from "../core/objects";
/*
 * What `object` and `objectLike` share once a property waits: both run every property in one pass, and
 * come here only when one of them was not ready.
 */
import { FAIL, type Pending, type Tools } from "../core/run";

/**
 * The end of an object: its checks when nothing was reported since `from`, and otherwise the failure,
 * which still runs the checks of `checkFields` whose properties are not among `failed`.
 */
export type Ending = (from: number, output: Record<string, unknown>, failed: readonly string[] | undefined) => unknown;

/**
 * Waits for the properties that were not ready, then ends the object. `keys` names the property each of
 * `waited` is, or holds undefined for one that is not a property and placed its own issues, and `marks`
 * says how many issues the object had reported when each was found, so the issues keep the order of the
 * shape. A property that waits holds its place in `output` meanwhile, so the output keeps that order too;
 * `present` says, for each, whether the input had it, which is when a value of undefined is kept.
 */
export const waitFor = (
  tools: Tools,
  start: number,
  waited: readonly Pending[],
  keys: readonly (string | undefined)[],
  marks: readonly number[],
  present: readonly boolean[] | undefined,
  output: Record<string, unknown>,
  failed: string[] | undefined,
  end: Ending,
): Pending =>
  tools.join(start, waited, keys, marks, (settled) => {
    const lost = failed ?? [];
    settled.forEach((value, at) => {
      const key = keys[at];
      if (key === undefined) {
        return;
      }
      if (value === FAIL) {
        lost.push(key);
      } else if (value !== undefined || present?.[at] === true) {
        setOwn(output, key, value);
      } else {
        Reflect.deleteProperty(output, key);
      }
    });
    return end(0, output, lost);
  });
