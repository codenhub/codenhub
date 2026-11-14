/*
 * Results that wait. A validator is synchronous exactly when everything it runs is: a run returns its
 * value while nothing is a promise, and one of these the moment something is. Only what may wait imports
 * this module, and hands it to the validator given it as its `w`, so a schema nothing in which can wait
 * carries none of it.
 *
 * Nothing here is named `then`: a module exporting `then` is a thenable, and importing it can hang in
 * some loaders.
 */
import { context, cut, FAIL, finished, restore, type Draft, type Pending, type Tools } from "./run";
import type { ValidationPathSegment, ValidationResult } from "./types";

type Settled = readonly [value: unknown, issues: Draft[] | undefined];

/**
 * A result that is not ready. It is told apart by a private field, since every value a validator
 * produced is asked whether it is one: `instanceof` reads the prototype, which throws for a revoked proxy
 * and lets any other proxy answer as it likes, where asking for a private field runs no code of the value.
 */
class Waiting implements Pending {
  static is(this: void, value: unknown): value is Pending {
    return typeof value === "object" && value !== null && #own in value;
  }

  readonly p: Promise<Settled>;

  // oxlint-disable-next-line no-unused-private-class-members -- read by `#own in value`, which the rule does not count
  readonly #own = true;

  constructor(promise: Promise<Settled>) {
    this.p = promise;
  }
}

const { is } = Waiting;

function merged(list: Draft[] | undefined, more: Draft[] | undefined): Draft[] | undefined {
  if (list === undefined || more === undefined) {
    return list ?? more;
  }
  // Pushed one by one: spreading a long list into `push` would overflow the stack.
  for (const each of more) {
    list.push(each);
  }
  return list;
}

function wait(mark: number, promise: PromiseLike<unknown>, proceed: (resolved: never) => unknown): Pending {
  const resume = context();
  const early = cut(mark);
  // Adopted as `await` adopts it, so a thenable whose `then` returns nothing, or calls back at once, still
  // gives a promise of what `proceed` returns; `Promise.resolve` returns a native promise as it is.
  // oxlint-disable-next-line promise/prefer-await-to-then
  const settled = Promise.resolve(promise).then((resolved): Settled | Promise<Settled> => {
    const [value, list] = resume(() => {
      restore(early);
      return proceed(resolved as never);
    });
    // oxlint-disable-next-line promise/prefer-await-to-then
    return is(value) ? value.p.then(([later, more]): Settled => [later, merged(list, more)]) : [value, list];
  });
  // Nothing may come to wait for it, as when a sibling throws meanwhile, and a rejection nothing handles
  // is reported apart from that exception and, by default, ends a Node.js process. Whoever does wait
  // still gets the rejection.
  // oxlint-disable-next-line promise/prefer-await-to-then
  settled.then(undefined, () => undefined);
  return new Waiting(settled);
}

const after = (mark: number, pending: Pending, next: (value: unknown, from: number) => unknown): Pending =>
  wait(mark, pending.p, ([value, list]: Settled) => {
    restore(list);
    return next(value, 0);
  });

function join(
  start: number,
  pendings: readonly Pending[],
  keys: readonly (ValidationPathSegment | undefined)[],
  marks: readonly number[],
  next: (values: unknown[]) => unknown,
): Pending {
  // What the children that were ready reported waits with the rest, so the composer gives every child's
  // issues in the order of the children, whichever was ready first.
  const early = cut(start);
  return wait(start, Promise.all(pendings.map((pending) => pending.p)), (settled: readonly Settled[]) => {
    let from = 0;
    const values = settled.map(([value, list], index) => {
      const mark = marks[index] as number;
      restore(early, undefined, from, mark);
      from = mark;
      restore(list, keys[index]);
      return value;
    });
    restore(early, undefined, from);
    return next(values);
  });
}

const settle = (pending: Pending): Promise<ValidationResult<unknown>> =>
  // oxlint-disable-next-line promise/prefer-await-to-then
  pending.p.then(([value, list]) => (value === FAIL ? finished(list as Draft[]) : { ok: true, value }));

/** The helpers for results that wait. */
export const tools: Tools = { is, wait, after, join, settle };
