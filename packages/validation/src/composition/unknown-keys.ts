/*
 * What an `object` does with the keys its shape does not list, apart from dropping them, which needs
 * nothing: each way is a value of its own, so an object carries the one it was given and no other.
 */
import { refuseReserved, RESERVED_KEY } from "../core/keys";
import { setOwn } from "../core/objects";
import { after, cap, count, FAIL, MAX_ISSUES, report, under, type Run, type Tools } from "../core/run";
import type { Message } from "../core/types";
import { wordKey, wordSize, wordType, wordUnknownKey, type Word } from "../core/words";
import { settle } from "./items";

/** Every unlisted key places its own issues, since the one about the key itself is not below it. */
const PLACED: readonly undefined[] = [];

/** The unlisted keys an object keeps, each with the value read for it. */
export type Extra = readonly (readonly [key: string, value: unknown])[];

/**
 * A way to treat unlisted keys. `read` runs before any property is validated: it reports the keys it
 * refuses, and reads the ones it keeps, so nothing that runs later can change what the output takes.
 * `place` runs once the properties are in the output, and puts there what `read` kept; it returns what a
 * child returns, so it may fail and may wait. `words` are the default messages of the issues it reports.
 */
export type Unknowns = readonly [
  read: (input: Record<string, unknown>, known: ReadonlySet<string>, message: Message | undefined) => Extra | undefined,
  place: ((extra: Extra, output: Record<string, unknown>, message: Message | undefined) => unknown) | undefined,
  words: readonly Word[],
];

const unlisted = (input: Record<string, unknown>, known: ReadonlySet<string>): string[] =>
  Object.keys(input).filter((key) => !known.has(key));

const read = (input: Record<string, unknown>, known: ReadonlySet<string>): Extra =>
  unlisted(input, known).map((key) => [key, input[key]] as const);

/** Refuses every unlisted key. */
export const STRICT: Unknowns = [
  (input, known, message) => {
    const start = count();
    const keys = unlisted(input, known);
    // The sender adds as many keys as it likes, so they are listed up to the limit of a collection.
    for (let index = 0; index < keys.length && index < MAX_ISSUES; index += 1) {
      report("unrecognized_key", { key: keys[index] }, message, keys[index]);
    }
    if (keys.length > MAX_ISSUES) {
      cap(start, message, true);
    }
    return undefined;
  },
  undefined,
  [wordType, wordUnknownKey, wordSize],
];

/** Keeps every unlisted key as it is. */
export const PASSTHROUGH: Unknowns = [
  (input, known, message) => {
    const extra = read(input, known);
    // Kept or copied, `__proto__` would be the prototype of whatever the output is next assigned to.
    if (extra.some(([key]) => key === RESERVED_KEY)) {
      refuseReserved(message, RESERVED_KEY);
    }
    return extra;
  },
  (extra, output) => {
    for (const [key, value] of extra) {
      setOwn(output, key, value);
    }
    return undefined;
  },
  [wordType, wordKey],
];

/**
 * Keeps each unlisted key once its value passed `runRest`. What it finds follows the properties in a list
 * of its own, cut at the limit of a collection as a record cuts it, since the sender adds as many keys as
 * it likes: past the limit an unlisted key is not validated.
 */
export const validated = (runRest: Run, tools: Tools | undefined): Unknowns => [
  read,
  (extra, output, message) =>
    settle(
      extra.length,
      (index) => {
        const [key, value] = extra[index] as Extra[number];
        return after(tools, count(), runRest(value), (produced, from) => {
          under(from, key);
          // Its value is validated all the same, and what that found comes first.
          return key === RESERVED_KEY ? refuseReserved(message, key) : produced;
        });
      },
      message,
      tools,
      (values) => values,
      PLACED,
      (values) => {
        values.forEach((value, index) => {
          if (value !== FAIL) {
            setOwn(output, (extra[index] as Extra[number])[0], value);
          }
        });
        return values;
      },
    ),
  [wordType, wordKey, wordSize],
];
