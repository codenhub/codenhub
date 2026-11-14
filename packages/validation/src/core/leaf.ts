import type { Description } from "./describe";
import { finisherOf, waitsOf } from "./finish";
import { toValidator } from "./make";
import { count, FAIL, refuse, report, type Run } from "./run";
/*
 * The builders every leaf is made with.
 */
import { split } from "./split";
import type { AsyncCheck, Message, MessageOptions } from "./types";
import { NO_WORDS } from "./words";

/**
 * Builds the run of a validator for a type: the input must pass `accepts`, then `inspect` reports the
 * validator's own constraints and returns the value, cleaned if the validator cleans it, and then the
 * checks run on that value, once every constraint has passed, so a bound keeps a long value from a costly
 * check and an invalid one from a lookup. Every leaf and format is one of these.
 */
export function leaf<T>(
  expected: string,
  accepts: (input: unknown) => boolean,
  message: Message | undefined,
  checks: readonly AsyncCheck<T>[],
  inspect?: (value: T) => T,
): Run {
  const finish = finisherOf(checks);
  const run: Run =
    inspect === undefined && finish === undefined
      ? // A value no option reads is the value as it is.
        (input) => (accepts(input) ? input : refuse(expected, input, message))
      : (input) => {
          if (!accepts(input)) {
            return refuse(expected, input, message);
          }
          let value = input as T;
          if (inspect !== undefined) {
            const mark = count();
            value = inspect(value);
            if (count() !== mark) {
              return FAIL;
            }
          }
          return finish === undefined ? value : finish(value, checks as readonly AsyncCheck<never>[], message);
        };
  run.w = waitsOf(checks);
  return run;
}

/**
 * Builds a validator that accepts the values `find` names, producing the declared value `find` returns
 * rather than the input, and reports any other with one `invalid_value` issue whose params `params`
 * makes afresh for each failure, as `literal` and `oneOf` do, where `leaf` would report the type. The
 * declared value is produced because `===` also matches `-0` to `0`, and the type promises the one
 * declared.
 */
export function member<T, TValidator>(
  find: (input: unknown) => readonly [value: T] | undefined,
  params: () => Readonly<Record<string, unknown>>,
  args: readonly unknown[],
  description: Omit<Description, "options">,
): TValidator {
  const [options, checks] = split<MessageOptions, T>(args);
  const { message } = options;
  const finish = finisherOf(checks);
  const run: Run = (input) => {
    const found = find(input);
    if (found === undefined) {
      return report("invalid_value", params(), message);
    }
    return finish === undefined ? found[0] : finish(found[0], checks as readonly AsyncCheck<never>[], message);
  };
  run.w = waitsOf(checks);
  return toValidator(run, { ...description, options, checks }, NO_WORDS);
}
