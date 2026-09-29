import { chain, collect, type Maybe } from "../core/async";
import { invalidObject, isPlainObject, setOwn } from "../core/objects";
import { collectNested, failWith, pass, toIssue } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationIssue, ValidationResult } from "../core/types";

/** Maps property names to the validators of their values. */
export type Shape = Record<string, AnyValidator>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type OptionalKeys<TShape extends Shape> = {
  [K in keyof TShape]: undefined extends Infer<TShape[K]> ? K : never;
}[keyof TShape];

/**
 * The object type a shape produces. A property whose validator accepts `undefined` becomes optional.
 *
 * @typeParam TShape - Property validators.
 */
export type InferShape<TShape extends Shape> = Simplify<
  { [K in Exclude<keyof TShape, OptionalKeys<TShape>>]: Infer<TShape[K]> } & {
    [K in OptionalKeys<TShape>]?: Infer<TShape[K]>;
  }
>;

/** Options for {@link object}. */
export interface ObjectOptions {
  /**
   * What to do with input properties the shape does not list. `"strip"` drops them from the output,
   * `"strict"` rejects each with an `unrecognized_key` issue, and `"passthrough"` copies them to the
   * output unchecked.
   *
   * @defaultValue "strip"
   */
  unknownKeys?: "strip" | "strict" | "passthrough";
}

/**
 * Creates a validator for plain objects with the given properties.
 *
 * @remarks
 * Only own enumerable properties are read, and class instances and arrays are not objects here. Every
 * property is validated even when an earlier one failed, so the result lists every problem. Issue
 * paths lead from the object down to the property. The output is a new object; the input is never
 * modified. It is synchronous when every property validator is, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const user = object({ name: string({ min: 2 }), age: optional(number({ int: true })) });
 * user({ name: "Ada" }); // { ok: true, value: { name: "Ada" } }
 * user({ name: "A" }); // { ok: false, error: { issues: [{ code: "too_small", path: ["name"], ... }] } }
 * ```
 *
 * @typeParam TShape - Property validators.
 * @param shape - Validator of each property.
 * @param options - How to treat properties the shape does not list.
 * @returns A validator that produces an object.
 */
export function object<TShape extends Shape>(
  shape: TShape,
  options: ObjectOptions = {},
): Composed<TShape[keyof TShape], InferShape<TShape>> {
  const keys = Object.keys(shape);
  const unknownKeys = options.unknownKeys ?? "strip";

  const validate = (input: unknown): Maybe<ValidationResult<unknown>> => {
    if (!isPlainObject(input)) {
      return invalidObject(input);
    }

    const issues: ValidationIssue[] = [];
    if (unknownKeys === "strict") {
      for (const key of Object.keys(input)) {
        if (!Object.hasOwn(shape, key)) {
          issues.push(toIssue({ code: "unrecognized_key", path: [key], params: { key } }));
        }
      }
    }

    const results = keys.map((key) => (shape[key] as AnyValidator)(Object.hasOwn(input, key) ? input[key] : undefined));
    return chain(collect(results), (settled) => {
      const output: Record<string, unknown> = {};
      settled.forEach((result, index) => {
        const key = keys[index] as string;
        if (!result.ok) {
          collectNested(issues, result.error.issues, key);
        } else if (result.value !== undefined || Object.hasOwn(input, key)) {
          setOwn(output, key, result.value);
        }
      });
      if (issues.length > 0) {
        return failWith(issues);
      }
      if (unknownKeys === "passthrough") {
        for (const key of Object.keys(input)) {
          if (!Object.hasOwn(shape, key)) {
            setOwn(output, key, input[key]);
          }
        }
      }
      return pass(output);
    });
  };

  return validate as unknown as Composed<TShape[keyof TShape], InferShape<TShape>>;
}
