import { cap, count, FAIL, MAX_ISSUES, under, weightSince, type Pending, type Tools } from "../core/run";
import type { Message, ValidationPathSegment } from "../core/types";

/** What `build` is: given the values and where the issues of the collection begin, it gives its output. */
type Build = (values: unknown[], from: number) => unknown;

/** What the end of a collection needs: its values, whether it was cut short, and what `settle` was given. */
type Ending = readonly [
  values: unknown[],
  isCut: boolean,
  message: Message | undefined,
  accept: (value: unknown) => unknown,
  build: Build | undefined,
];

/** Ends a collection whose children are all ready, and whose issues begin at `from`. */
function end([values, isCut, message, accept, build]: Ending, from: number): unknown {
  const built = build === undefined ? values : build(values, from);
  return count() > from ? cap(from, message, isCut) : accept(built);
}

/**
 * Waits for the pending children and ends the collection. It is apart from `settle` so that a collection
 * that waits for nothing makes no function: one made there would keep every variable of `settle` in a
 * place of its own, the index of its loop too.
 */
const wait = (
  tools: Tools,
  start: number,
  pendings: readonly Pending[],
  keys: readonly (ValidationPathSegment | undefined)[],
  marks: readonly number[],
  ending: Ending,
): unknown =>
  tools.join(start, pendings, keys, marks, (settled) => {
    const [values] = ending;
    let next = 0;
    values.forEach((value, at) => {
      if (value === pendings[next]) {
        values[at] = settled[next];
        next += 1;
      }
    });
    return end(ending, 0);
  });

/**
 * Validates each child of a collection with `work`, which gives what the child produced, and places the
 * issues of each under its index, or under its key when `keys` names them, and leaves where they are the
 * issues of a child `keys` has no key for, which placed its own. When every child passed,
 * `accept` is given the values, or what `build` made of them. Otherwise the issues are reported, up to the
 * limit of one collection, which also stops the children that had not run. `build` runs either way, on
 * values that hold `FAIL` for a child that failed. It is given where the issues of this collection begin,
 * and may report more, such as a value two children made equal.
 *
 * The children are run and their values read in one pass while none is pending, which is the usual case.
 * From the first pending child on, the rest are started and waited for together, and a pending child is
 * not counted against the limit, since what it reports is not known yet.
 */
export function settle(
  length: number,
  work: (index: number, source: never) => unknown,
  message: Message | undefined,
  tools: Tools | undefined,
  accept: (value: unknown) => unknown,
  keys?: readonly (ValidationPathSegment | undefined)[],
  build?: Build,
  source?: unknown,
): unknown {
  const start = count();
  const values: unknown[] = [];
  let mark = start;
  let weight = 0;
  let index = 0;
  let pendings: Pending[] | undefined;
  let pendingKeys: (ValidationPathSegment | undefined)[] | undefined;
  let marks: number[] | undefined;
  for (; index < length && weight < MAX_ISSUES; index += 1) {
    const value = work(index, source as never);
    const key = keys === undefined ? index : keys[index];
    if (value === FAIL) {
      weight += weightSince(mark);
      mark = under(mark, key);
    } else if (tools !== undefined && tools.is(value)) {
      (pendings ??= []).push(value);
      (pendingKeys ??= []).push(key);
      (marks ??= []).push(mark - start);
    }
    values[index] = value;
  }
  const ending: Ending = [values, index < length, message, accept, build];
  return pendings === undefined
    ? end(ending, start)
    : wait(
        tools as Tools,
        start,
        pendings,
        pendingKeys as (ValidationPathSegment | undefined)[],
        marks as number[],
        ending,
      );
}
