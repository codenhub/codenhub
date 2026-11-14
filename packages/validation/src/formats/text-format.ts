import type { Description } from "../core/describe";
import { leaf } from "../core/leaf";
import { toValidator } from "../core/make";
import { report, type Run } from "../core/run";
import { split } from "../core/split";
import type { AnyValidator, AsyncCheck, Factory, Message, MessageOptions } from "../core/types";
import { FORMAT_WORDS } from "../core/words";

const isString = (input: unknown): boolean => typeof input === "string";

/**
 * Builds the run of a format: an input that is not `expected` fails with `invalid_type`, and
 * `read` returns the value for an input of the format, its canonical spelling or the input itself, and
 * undefined for any other, which fails with `invalid_format` naming the format. The checks run only on a
 * value of the format, so a check can rely on it being one, as it can for `url` and `email`.
 */
export const formatLeaf = <T>(
  expected: string,
  accepts: (input: unknown) => boolean,
  format: string,
  read: (input: T) => T | undefined,
  message: Message | undefined,
  checks: readonly AsyncCheck<T>[],
): Run =>
  leaf<T>(expected, accepts, message, checks, (input) => {
    const value = read(input);
    if (value === undefined) {
      report("invalid_format", { format }, message);
      return input;
    }
    return value;
  });

/** Builds the run of a string format, as {@link formatLeaf} does for a string. */
export const stringFormat = (
  format: string,
  read: (text: string) => string | undefined,
  message: Message | undefined,
  checks: readonly AsyncCheck<string>[],
): Run => formatLeaf<string>("string", isString, format, read, message, checks);

/** Makes the validator of a format from its run: it words a wrong type and a text that is not of the format. */
export const formatted = <TValidator = AnyValidator>(
  run: Run,
  record: Omit<Description, "options"> & { readonly options?: object },
): TValidator => toValidator(run, record, FORMAT_WORDS);

/**
 * Makes the factory of a format whose only option is `message`. A module may export what it returns as
 * `/* @__PURE__ *\/ formatFactory(...)`, since bundlers drop a call marked pure when nothing uses it.
 */
export const formatFactory = (
  format: string,
  read: (text: string) => string | undefined,
): Factory<string, MessageOptions> =>
  ((...args: unknown[]) => {
    const [options, checks] = split<MessageOptions, string>(args);
    return formatted(stringFormat(format, read, options.message, checks), {
      kind: "format",
      format,
      options,
      checks,
    });
  }) as Factory<string, MessageOptions>;
