import { ownRun, runOf } from "../core/child";
import { decided } from "../core/decide";
import { describe, type Description } from "../core/describe";
import { runChecks } from "../core/finish";
import { assertFunction } from "../core/result";
import { after, call, count, cut, FAIL, RUN, type Run } from "../core/run";
import type { AnyValidator, AsyncCheck, Infer, InferInput, Message, ValidationResult, Validator } from "../core/types";
import { tools } from "../core/wait";
import { unknown } from "../primitives/unknown";
import { array } from "./array";
import { intersection } from "./intersection";
import { lazy } from "./lazy";
import { map } from "./map";
import { nullable } from "./nullable";
import { nullish } from "./nullish";
import { objectOf, type Shape, type UnknownKeys, type Way } from "./object";
import { objectLike } from "./object-like";
import { optional } from "./optional";
import { pipe } from "./pipe";
import { record as recordOf } from "./record";
import { set } from "./set";
import { tagged } from "./tagged";
import { transform } from "./transform";
import { tuple } from "./tuple";
import { union } from "./union";

/** The result of `encode`: ready for a synchronous validator, and to be awaited for an asynchronous one. */
export type Encoded<TValidator extends AnyValidator> = [TValidator] extends [Validator<unknown>]
  ? ValidationResult<InferInput<TValidator>>
  : ValidationResult<InferInput<TValidator>> | PromiseLike<ValidationResult<InferInput<TValidator>>>;

type Make = (...args: unknown[]) => AnyValidator;

/** Gives what `next` returns for what a run produced when it passed, now when it is ready and once it is otherwise. */
const then = (value: unknown, next: (value: unknown) => unknown): unknown =>
  after(tools, count(), value, (later) => (later === FAIL ? FAIL : next(later)));

/** The validator of a run that may wait, for an encoder a factory is given as a child. */
function fromRun(run: Run): AnyValidator {
  run.w = tools;
  return Object.assign((input: unknown) => call(run, input), { [RUN]: run }) as unknown as AnyValidator;
}

/** The kinds that produce a value they accept, so writing one back is validating it. */
const PRODUCE_WHAT_THEY_ACCEPT = new Set([
  "string",
  "number",
  "bigint",
  "boolean",
  "date",
  "file",
  "symbol",
  "unknown",
  "never",
  "function",
  "literal",
  "oneOf",
  "instance",
  "guard",
  "format",
  "coerce",
]);

/** Writes the object `searchParams` read back as a query string, each value as text. */
function toQuery(value: unknown): string {
  const query = new URLSearchParams();
  for (const [key, each] of Object.entries(value as Record<string, unknown>)) {
    for (const item of Array.isArray(each) ? each : [each]) {
      if (item !== undefined) {
        query.append(key, String(item));
      }
    }
  }
  return query.toString();
}

/**
 * The path to the first `bigint` in what `JSON.stringify` would write, or `undefined` when there is none.
 * It is looked for only once writing failed, so a value that is written is not walked a second time.
 */
function bigintIn(value: unknown, seen = new Set<object>()): (string | number)[] | undefined {
  if (typeof value === "bigint") {
    return [];
  }
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return undefined;
  }
  seen.add(value);
  for (const [key, each] of Object.entries(value)) {
    const found = bigintIn(each, seen);
    if (found !== undefined) {
      return [Array.isArray(value) ? Number(key) : key, ...found];
    }
  }
  return undefined;
}

/**
 * Writes a value back to what a validator accepts: a `Date` back to the text a `codec` read it from, an
 * object of them back to an object of text, and the object `json` parsed back to JSON.
 *
 * @remarks
 * The validator is read with `describe`, and each part written back as its kind says:
 *
 * - A `codec` writes the value back through its output, so a codec inside that writes its part first, or,
 *   when the output is a validator written by hand, checks the value with it and passes it on as it is,
 *   runs its `encode` on the result, and checks its input accepts what that returns. A `transform` in the
 *   output throws, as it does anywhere else.
 * - A part that produces what it accepts, such as `string`, a format or a coercion, validates the value and
 *   gives what it produced, so `email()` gives the address as the parser reads it.
 * - A composer, such as `object`, `array` or `union`, writes back each of its parts and keeps its options,
 *   and runs its checks on the value once its parts passed. A `pipe` writes its steps back from the last.
 * - `json` and `searchParams` write the text: JSON, and a query string of each value as text, which they then
 *   read back, so text they would refuse fails. JSON holds less than JavaScript does: `NaN` is written as
 *   `null`, and a property that is `undefined` is left out, as `JSON.stringify` writes them.
 * - `optional` with a default writes the default back as `undefined` when its inner part refuses it, since
 *   only `undefined` produced it. A `fallback` value its inner part refuses fails: every input its inner part refuses produces it, and which one was given is not known.
 *
 * So a value the validator could not have produced fails with the issues it has, at their paths. A part
 * that cannot be written back throws a `TypeError` naming its place: a `transform`, whose function goes one
 * way, and a validator written by hand; use a `codec` there. A coercion writes back the value it produced,
 * which it accepts, so inside `json` a `bigint` from `coerceBigint` cannot be written as JSON, and throws a
 * `TypeError` naming its place: use a codec that writes it as text.
 *
 * @example
 * ```ts
 * const timestamp = codec(datetime(), date(), {
 *   decode: (text) => new Date(text),
 *   encode: (value) => value.toISOString(),
 * });
 * const event = object({ name: string(), at: timestamp });
 * encode(event, { name: "Launch", at: new Date(0) }); // { ok: true, value: { name: "Launch", at: "1970-01-01T00:00:00.000Z" } }
 * ```
 *
 * @typeParam TValidator - The validator to write the value back for.
 * @param validator - A validator made by the factories of this package.
 * @param value - A value of the type the validator produces.
 * @returns The value as the validator accepts it, or every issue found.
 * @throws {TypeError} When `validator` is not a function, a part of it cannot be written back, or `json`
 * is given a `bigint` to write.
 */
export function encode<TValidator extends AnyValidator>(
  validator: TValidator,
  value: Infer<TValidator>,
): Encoded<TValidator> {
  assertFunction("validator", validator);
  // The encoder of each validator met, so a recursive schema is written back by one encoder at each level.
  const made = new Map<AnyValidator, AnyValidator>();

  const refuse = (what: string, path: string): never => {
    throw new TypeError(`encode cannot write back ${what} at ${path === "" ? "the root" : path}. Use a codec there`);
  };

  /** Writes what `json` at `path` read back as JSON, and names the place of a `bigint`, which it cannot hold. */
  const toJson = (written: unknown, path: string): string => {
    try {
      return JSON.stringify(written);
    } catch (error) {
      const found = bigintIn(written);
      if (found === undefined) {
        throw error;
      }
      return refuse(
        "a bigint as JSON",
        found.reduce<string>(
          (at, key) => (typeof key === "number" ? `${at}[${key}]` : at === "" ? key : `${at}.${key}`),
          path,
        ),
      );
    }
  };

  /**
   * Runs the checks of `record`, written for the value as it was given, once `encoded` passed, with the
   * `message` of its options, as validating does.
   */
  const checked = (encoded: AnyValidator, record: Description): AnyValidator => {
    const checks = (record.checks ?? []) as readonly AsyncCheck<never>[];
    if (checks.length === 0) {
      return encoded;
    }
    const message = record.options?.["message"] as Message | undefined;
    const runEncoded = runOf(encoded, "encoder");
    return fromRun((given) =>
      then(runEncoded(given), (written) => then(runChecks(given, checks, message), () => written)),
    );
  };

  const encoderOf = (target: AnyValidator, path: string): AnyValidator => {
    const known = made.get(target);
    if (known !== undefined) {
      return known;
    }
    const encoder = build(target, path);
    made.set(target, encoder);
    return encoder;
  };

  const build = (target: AnyValidator, path: string): AnyValidator => {
    const record = describe(target);
    if (record === undefined) {
      return refuse("a validator written by hand", path);
    }
    if (ownRun(target) === undefined) {
      // Its parts would run in the copy that made them, and report where this one does not look.
      return refuse("a validator another copy of the package made", path);
    }
    if (PRODUCE_WHAT_THEY_ACCEPT.has(record.kind)) {
      return target;
    }
    const options = record.options ?? {};
    const part = (name: string, at = path): AnyValidator => encoderOf(record[name] as AnyValidator, at);
    const parts = (name: string): AnyValidator[] =>
      (record[name] as AnyValidator[]).map((each) => encoderOf(each, path));
    const shape = (): Shape =>
      Object.fromEntries(
        Object.entries(record["shape"] as Shape).map(([key, each]) => [
          key,
          encoderOf(each, path === "" ? key : `${path}.${key}`),
        ]),
      );
    const over = (encoded: AnyValidator): AnyValidator => checked(encoded, record);
    // The text `json` or `searchParams` wrote, once the validator it came from reads it back, so text it
    // would refuse, such as JSON of `undefined` or a list written as a key it reads only once, fails.
    const readBack = (writer: AnyValidator): AnyValidator => {
      const runWriter = runOf(writer, "writer");
      const runTarget = runOf(target, "validator");
      return fromRun((given) => then(runWriter(given), (written) => then(runTarget(written), () => written)));
    };

    switch (record.kind) {
      case "codec": {
        const { input, output } = record as unknown as { input: AnyValidator; output: AnyValidator };
        const write = record["encode"] as (value: unknown) => unknown;
        // `decode` gave `output` what it accepts, so `encode` is given what `output` writes back, which for a
        // codec inside it is what that codec wrote. An output written by hand cannot be written back, and is
        // what a codec is for: it only checks the value, which `encode` is given as it is, since run forward
        // it may change it. Any other part that cannot be written back throws, naming its place.
        const isByHand = describe(output) === undefined;
        const writeOutput = isByHand ? output : encoderOf(output, path);
        const runOutput = runOf(writeOutput, "output");
        const runInput = runOf(input, "input");
        return fromRun((given) =>
          then(runOutput(given), (produced) => {
            const written = decided("codec", write, isByHand ? given : produced, "encode");
            return then(runInput(written), () => written);
          }),
        );
      }
      case "object": {
        // Written back by an object that treats the keys its shape does not list as this one does.
        const rest = record["unknownKeys"] as UnknownKeys;
        return over(
          objectOf(
            shape(),
            [options],
            typeof rest === "function" ? encoderOf(rest, `${path}{}`) : rest,
            record["way"] as Way | undefined,
          ),
        );
      }
      case "objectLike":
        return over((objectLike as unknown as Make)(shape(), options));
      case "array":
        return over((array as unknown as Make)(part("item", `${path}[]`), options));
      case "set":
        return over((set as unknown as Make)(part("item", `${path}[]`), options));
      case "map":
        return over((map as unknown as Make)(part("key", `${path}{}`), part("value", `${path}{}`), options));
      case "record":
        return over((recordOf as unknown as Make)(part("key", `${path}{}`), part("value", `${path}{}`), options));
      case "tuple": {
        const items = (record["items"] as AnyValidator[]).map((each, index) => encoderOf(each, `${path}[${index}]`));
        const rest = record["rest"] === undefined ? {} : { rest: part("rest", `${path}[]`) };
        return over((tuple as unknown as Make)(items, { ...options, ...rest }));
      }
      case "union":
        return over((union as unknown as Make)(parts("members"), options));
      case "intersection":
        return over((intersection as unknown as Make)(...parts("members"), options));
      case "tagged": {
        const variants = Object.fromEntries(
          Object.entries(record["variants"] as Shape).map(([tag, variant]) => [tag, encoderOf(variant, path)]),
        );
        return over((tagged as unknown as Make)(record["key"], variants, options));
      }
      case "optional": {
        const kept = (optional as unknown as Make)(part("inner"));
        const given = record["default"];
        // A default the inner part refuses was produced from `undefined` alone, so it is written back as that.
        // One a function makes cannot be compared, and is written back as the inner part writes it.
        if (given === undefined || typeof given === "function") {
          return kept;
        }
        const runKept = runOf(kept, "inner");
        return fromRun((value) =>
          after(tools, count(), runKept(value), (written, from) => {
            if (written !== FAIL || !Object.is(value, given)) {
              return written;
            }
            cut(from);
            return undefined;
          }),
        );
      }
      case "nullable":
        return (nullable as unknown as Make)(part("inner"));
      case "nullish":
        return (nullish as unknown as Make)(part("inner"));
      case "readonly":
      case "fallback":
      case "meta":
        return part("inner");
      case "pipe": {
        // Each step reads what the one before produced, so the steps are written back from the last.
        const steps = (record["steps"] as AnyValidator[]).map((step) => encoderOf(step, path)).toReversed();
        return (pipe as unknown as Make)(...steps);
      }
      case "lazy": {
        const getter = record["getter"] as () => AnyValidator;
        // The validator the getter returns is met again at every level, and has one encoder.
        return over((lazy as unknown as Make)(() => encoderOf(getter(), path), options));
      }
      case "json": {
        const inner = record["inner"] === undefined ? (unknown as unknown as Make)() : part("inner");
        return readBack((transform as unknown as Make)(over(inner), (written: unknown) => toJson(written, path)));
      }
      case "searchParams":
        return readBack((transform as unknown as Make)(over(part("inner")), toQuery));
      case "transform":
        return refuse("a transform", path);
      default:
        return refuse(`a validator of kind "${record.kind}"`, path);
    }
  };

  return encoderOf(validator, "")(value) as Encoded<TValidator>;
}
