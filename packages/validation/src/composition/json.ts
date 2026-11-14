import { runOf, toolsOf } from "../core/child";
import { endOf, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { refuse, report, type Run } from "../core/run";
import { split } from "../core/split";
import type {
  AnyValidator,
  AsyncRest,
  AsyncSchema,
  Composed,
  Infer,
  MessageOptions,
  Rest,
  Schema,
} from "../core/types";
import { FORMAT_WORDS } from "../core/words";

/**
 * Creates a validator for text that holds JSON: it parses the text, then optionally validates what
 * was parsed.
 *
 * @remarks
 * A non-string fails with `invalid_type`, and text that is not valid JSON fails with
 * `invalid_format` and `{ format: "json" }`. Issues from `validator` have paths relative to the
 * parsed value. Objects parsed from JSON are plain objects, so a `__proto__` key is data. Without
 * `validator` the result is `unknown`.
 *
 * @example
 * ```ts
 * const settings = json(object({ theme: oneOf(["light", "dark"]) }));
 * settings('{"theme":"dark"}'); // { ok: true, value: { theme: "dark" } }
 * settings("{oops"); // { ok: false, ... }, code "invalid_format"
 * ```
 *
 * @typeParam TValidator - The validator for the parsed value.
 * @param validator - Validates the parsed value.
 * @returns A validator that produces what `validator` produces, or `unknown` without one.
 * @throws {TypeError} When `validator` is given and is not a validator of this copy of the package, `undefined` included.
 */
export function json(): Schema<unknown, string>;
export function json(options: MessageOptions): Schema<unknown, string>;
export function json<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: Rest<Infer<TValidator>, MessageOptions>
): Composed<TValidator, Infer<TValidator>, string>;
export function json<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: AsyncRest<Infer<TValidator>, MessageOptions>
): AsyncSchema<Infer<TValidator>, string>;
export function json(...args: unknown[]): AnyValidator {
  // A function in first place is the validator of the parsed value, and an object or no argument at all
  // is the options. Anything else, such as an import that resolved to null or a key with no validator,
  // undefined, is a mistake in the schema, which would otherwise accept any JSON.
  const [first] = args;
  const isOptions = args.length === 0 || (typeof first === "object" && first !== null);
  const [validator, rest] = isOptions ? [undefined, args] : [first as AnyValidator, args.slice(1)];
  const runInner = isOptions ? undefined : runOf(validator as AnyValidator, "validator");
  const [options, checks] = split<MessageOptions, unknown>(rest);
  const { message } = options;
  const tools = toolsOf([runInner], waitsOf(checks));
  const end = endOf(checks, message, tools);
  const run: Run = (input) => {
    if (typeof input !== "string") {
      return refuse("string", input, message);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return report("invalid_format", { format: "json" }, message);
    }
    return end(runInner === undefined ? parsed : runInner(parsed));
  };
  run.w = tools;
  return toValidator(run, { kind: "json", options, checks, inner: validator }, FORMAT_WORDS, [validator]);
}
