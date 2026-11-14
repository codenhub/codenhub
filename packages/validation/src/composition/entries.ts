/*
 * The entries of a `record` and of a `map`, which validate alike: the key, then the value, each entry's
 * issues at the place of the entry, and a key two entries end up sharing reported, not dropped.
 */
import { refuseRepeated } from "../core/keys";
import { nested } from "../core/result";
import { count, cut, FAIL, MAX_ISSUES, report, straighten, under, type Run, type Tools } from "../core/run";
import type { Message, ValidationPathSegment } from "../core/types";
import { settle } from "./items";

/** Every entry places its own issues, since the ones about its key are not below it. */
const PLACED: readonly undefined[] = [];

/**
 * Validates the entries of a collection: `names` and `items` hold the key and the value of each, read
 * before anything runs, and `segments` the place of each in a path.
 *
 * The key is validated first and then the value, whatever the key gave, so one run reports both. What
 * the key's validator found is held behind one `invalid_key` issue at the entry, so a bad key is not
 * mistaken for a bad value at the same path. `inspect` is then shown the key that was produced, and may
 * report it or throw. `put` adds an entry that passed to `output` and says whether it did: a key an
 * earlier entry already has is reported, after the issues of the entries, since which entries passed is
 * known only once every one of them has settled.
 */
export function settleEntries(
  names: readonly unknown[],
  items: readonly unknown[],
  segments: readonly ValidationPathSegment[],
  runKey: Run,
  runValue: Run,
  tools: Tools | undefined,
  message: Message | undefined,
  accept: (value: unknown) => unknown,
  put: (key: unknown, value: unknown) => boolean,
  output: unknown,
  inspect?: (key: unknown, message: Message | undefined, segment: ValidationPathSegment) => void,
): unknown {
  const produced: unknown[] = [];
  // `from` is where the issues of the entry begin, and `before` how many of them are about its key.
  const valued = (index: number, value: unknown, from: number, before: number): unknown => {
    const segment = segments[index] as ValidationPathSegment;
    under(from + before, segment);
    if (inspect !== undefined && produced[index] !== FAIL) {
      inspect(produced[index], message, segment);
    }
    return count() > from ? FAIL : value;
  };
  const keyed = (index: number, key: unknown, from: number): unknown => {
    produced[index] = key;
    if (key === FAIL) {
      report(
        "invalid_key",
        { issues: straighten(cut(from) ?? []).map(nested) },
        message,
        segments[index] as ValidationPathSegment,
      );
    }
    const before = count() - from;
    const value = runValue(items[index]);
    return tools !== undefined && tools.is(value)
      ? tools.after(from, value, (later, start) => valued(index, later, start, before))
      : valued(index, value, from, before);
  };
  return settle(
    names.length,
    (index) => {
      const mark = count();
      const key = runKey(names[index]);
      return tools !== undefined && tools.is(key)
        ? tools.after(mark, key, (later, from) => keyed(index, later, from))
        : keyed(index, key, mark);
    },
    message,
    tools,
    accept,
    PLACED,
    (values, from) => {
      values.forEach((value, index) => {
        // One past the limit, which is how the list is known to be cut.
        if (value !== FAIL && !put(produced[index], value) && count() - from <= MAX_ISSUES) {
          refuseRepeated(message, segments[index] as ValidationPathSegment);
        }
      });
      return output;
    },
  );
}
