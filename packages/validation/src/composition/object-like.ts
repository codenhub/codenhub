import { chain, collect, runEach, type Maybe } from "../core/async";
import { report, tail } from "../core/checks";
import { append, below, call, composed } from "../core/nesting";
import { assertShape, isArray, setOwn } from "../core/objects";
import { assertFunction, failWith, issue, typeIssue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  MessageOptions,
  Rest,
  ValidationIssue,
  ValidationResult,
} from "../core/types";
import type { InferShape, Shape } from "./object";

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
 * @throws {TypeError} When `shape` is not a plain object or a property validator is not a function.
 */
export function objectLike<TShape extends Shape>(
  shape: TShape,
  ...rest: Rest<InferShape<TShape>, MessageOptions>
): Composed<TShape[keyof TShape], InferShape<TShape>>;
export function objectLike<TShape extends Shape>(
  shape: TShape,
  ...rest: AsyncRest<InferShape<TShape>, MessageOptions>
): AsyncValidator<InferShape<TShape>>;
export function objectLike(shape: Shape, ...rest: unknown[]): AnyValidator {
  assertShape(shape);
  // The shape is read once, so changing it after the validator is made changes nothing.
  const keys = Object.keys(shape);
  const validators = keys.map((key) => {
    const validator: unknown = shape[key];
    assertFunction(`shape.${key}`, validator);
    return validator as AnyValidator;
  });
  const [options, reject, accept] = tail<MessageOptions, Record<string, unknown>>(rest);

  return composed((input, place): Maybe<ValidationResult<unknown>> => {
    if (typeof input !== "object" || input === null || isArray(input)) {
      return reject([typeIssue("object", input)], place);
    }

    const results = runEach(keys.length, (index) => {
      const key = keys[index] as string;
      let value: unknown;
      try {
        value = (input as Record<string, unknown>)[key];
      } catch {
        // Reported in the property's turn, as a property that failed, so the issues keep the order of the shape.
        return failWith(report([issue("invalid_value", { unreadable: true }, [key])], place, options.message));
      }
      return call(validators[index] as AnyValidator, value, below(place, key));
    });
    return chain(collect(results), (settled) => {
      const issues: ValidationIssue[] = [];
      const output: Record<string, unknown> = {};
      settled.forEach((result, index) => {
        if (!result.ok) {
          append(issues, result.error.issues);
        } else if (result.value !== undefined) {
          setOwn(output, keys[index] as string, result.value);
        }
      });
      return issues.length > 0 ? failWith(issues) : accept(output, place);
    });
  });
}
