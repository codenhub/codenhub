import { runOf, toolsOf } from "../core/child";
import { fieldFailureOf } from "../core/field-hook";
import { accepter, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { assertShape, isArray, setOwn } from "../core/objects";
import { count, FAIL, refuse, report, under, type Pending, type Run } from "../core/run";
import { split } from "../core/split";
import type { AnyValidator, AsyncRest, AsyncSchema, Composed, MessageOptions, Rest } from "../core/types";
import { TYPE_WORDS } from "../core/words";
import { waitFor, type Ending } from "./fields";
import type { InferShape, InferShapeInput, Shape } from "./object";

/**
 * Creates a validator for any object that has the given properties, such as a class instance.
 *
 * @remarks
 * Where {@link object} accepts plain objects and reads their own properties, this accepts every object
 * that is not an array and reads each listed property as `input[key]`, so one that is inherited, not
 * enumerable or computed by a getter counts. Use it for a value another program hands over as an
 * instance, such as an `Error` or an object with methods, and `object` for data. To choose between
 * instances by a property, put these validators in a `union`: `tagged` accepts plain objects only.
 *
 * Every property is validated even when an earlier one failed. A property that throws while it is
 * read, as a getter or a `Proxy` trap may, is reported as an `invalid_value` issue with
 * `params.unreadable`, and never throws. The output is a new plain object holding the listed
 * properties only, without the ones whose value is `undefined`; the input is never modified. It is
 * synchronous when every property validator is, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const feedback = objectLike({ message: string({ min: 1 }), isRetryable: optional(boolean()) });
 * feedback(new Error("Try again")); // { ok: true, value: { message: "Try again" } }
 * feedback({ message: "" }); // { ok: false, error: { issues: [{ code: "too_small", path: ["message"], ... }] } }
 * ```
 *
 * @typeParam TShape - Property validators.
 * @param shape - Validator of each property.
 * @param rest - Options, then checks, which run once every property has passed and see the output.
 * @returns A validator that produces a plain object.
 * @throws {TypeError} When `shape` is not a plain object or a property validator is not a validator of this copy of the package.
 */
export function objectLike<TShape extends Shape>(
  shape: TShape,
  ...rest: Rest<InferShape<TShape>, MessageOptions>
): Composed<TShape[keyof TShape], InferShape<TShape>, InferShapeInput<TShape>>;
export function objectLike<TShape extends Shape>(
  shape: TShape,
  ...rest: AsyncRest<InferShape<TShape>, MessageOptions>
): AsyncSchema<InferShape<TShape>, InferShapeInput<TShape>>;
export function objectLike(shape: Shape, ...rest: unknown[]): AnyValidator {
  assertShape(shape);
  // The shape is read once, so changing it after the validator is made changes nothing.
  const keys = Object.keys(shape);
  // The validators as they were read, which is what the description gives: reading the shape again would
  // read a getter twice, and could describe another validator than the one that runs.
  const read: Shape = {};
  const runs = keys.map((key) => {
    const validator = shape[key] as AnyValidator;
    const run = runOf(validator, `shape.${key}`);
    setOwn(read, key, validator);
    return run;
  });
  const [options, checks] = split<MessageOptions, Record<string, unknown>>(rest);
  const { message } = options;
  const tools = toolsOf(runs, waitsOf(checks));
  const accept = accepter(checks, message);
  const failFields = fieldFailureOf(checks, keys);
  const end: Ending = (from, output, failed) =>
    count() === from ? accept(output) : failFields === undefined ? FAIL : failFields(failed, output, message, from);
  const size = keys.length;

  const run: Run = (input) => {
    if (typeof input !== "object" || input === null || isArray(input)) {
      return refuse("object", input, message);
    }
    const start = count();
    const output: Record<string, unknown> = {};
    let mark = start;
    let failed: string[] | undefined;
    let waited: Pending[] | undefined;
    let waitedKeys: string[] | undefined;
    let marks: number[] | undefined;
    for (let index = 0; index < size; index += 1) {
      const key = keys[index] as string;
      let value: unknown = FAIL;
      let isRead = true;
      try {
        value = (input as Record<string, unknown>)[key];
      } catch {
        // Reported in the property's turn, as a property that failed, so the issues keep the order of the shape.
        isRead = false;
        report("invalid_value", { unreadable: true }, message);
      }
      if (isRead) {
        value = (runs[index] as Run)(value);
      }
      if (value === FAIL) {
        mark = under(mark, key);
        (failed ??= []).push(key);
      } else if (tools !== undefined && tools.is(value)) {
        (waited ??= []).push(value);
        (waitedKeys ??= []).push(key);
        (marks ??= []).push(mark - start);
        // Holds the place of the key, so the output keeps the order of the shape.
        setOwn(output, key, undefined);
      } else if (value !== undefined) {
        setOwn(output, key, value);
      }
    }
    return waited === undefined
      ? end(start, output, failed)
      : waitFor(
          tools as NonNullable<typeof tools>,
          start,
          waited,
          waitedKeys as string[],
          marks as number[],
          undefined,
          output,
          failed,
          end,
        );
  };
  run.w = tools;
  return toValidator(
    run,
    { kind: "objectLike", options, checks, shape: Object.freeze(read) },
    TYPE_WORDS,
    Object.values(read),
  );
}
