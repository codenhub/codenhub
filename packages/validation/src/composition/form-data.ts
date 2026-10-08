import { chain, type Maybe } from "../core/async";
import { tail } from "../core/checks";
import { described } from "../core/describe";
import { call, composed } from "../core/nesting";
import { formEntriesOf } from "../core/objects";
import { assertFunction, assertOption, typeIssue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  MessageOptions,
  Rest,
  ValidationResult,
} from "../core/types";
import { readEntries } from "../formats/parts";
import type { GlobalFile } from "../primitives/file";

/**
 * The runtime's own `FormData`, read from `globalThis` as {@link GlobalFile} is, or the entries it holds for a
 * program compiled without the types of the DOM or of Node.js.
 */
export type GlobalFormData = typeof globalThis extends { FormData: { prototype: infer TFormData } }
  ? TFormData
  : Iterable<[string, string | GlobalFile]>;

/** Options for {@link formData}. */
export interface FormDataOptions extends MessageOptions {
  /**
   * Gives the validator every value of every key as an array, and accepts a key given more than once, as
   * a form with several files in one field or several checked boxes of one name sends it.
   *
   * @defaultValue false
   */
  repeated?: boolean | undefined;
}

/**
 * Creates a validator that reads a `FormData` into an object of its fields, each a string or a `File`, or
 * with `repeated` every value of every key as an array, and validates that object. The value is what the
 * validator produces.
 *
 * @remarks
 * A `FormData` from another realm, such as an iframe, is read too, and an object that only claims to be one
 * is not. A key given more than once fails, at its path with `invalid_key`, up to the 1,000 issues a
 * collection reports, unless `repeated` is set, as `searchParams` reads a query: a check that saw one of two
 * values while a server read the other would pass a value nobody checked. Anything that is not a `FormData`
 * fails with `invalid_type` and `{ expected: "form data", received }`.
 *
 * The form is read before it reaches the validator, by `request.formData()` or the like, which reads the
 * whole body: cap the size of the body where the request is read, and give each `file` a `maxSize`.
 *
 * @example
 * ```ts
 * const signup = formData(object({ name: string({ min: 2, max: 100 }), avatar: optional(file({ maxSize: 1_000_000 })) }));
 * signup(await request.formData()); // { ok: true, value: { name: "Ada", avatar: File } }
 *
 * const upload = formData(object({ photos: array(file({ maxSize: 5_000_000 }), { max: 10 }) }), { repeated: true });
 * ```
 *
 * @typeParam TValidator - The validator of the fields.
 * @param validator - Validates the object of fields.
 * @param rest - Options, then checks, which run on what the validator produced.
 * @returns A validator that produces what `validator` produces.
 * @throws {TypeError} When `validator` or a check is not a function, or `repeated` is not a boolean.
 */
export function formData<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: Rest<Infer<TValidator>, FormDataOptions>
): Composed<TValidator, Infer<TValidator>, GlobalFormData>;
export function formData<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: AsyncRest<Infer<TValidator>, FormDataOptions>
): AsyncValidator<Infer<TValidator>, GlobalFormData>;
export function formData(validator: AnyValidator, ...rest: unknown[]): AnyValidator {
  assertFunction("validator", validator);
  const [options, reject, accept, checks] = tail<FormDataOptions, unknown>(rest, "repeated");
  const { repeated = false } = options;
  assertOption("repeated", repeated, "boolean");
  return described(
    composed((input, place): Maybe<ValidationResult<unknown>> => {
      const entries = formEntriesOf(input);
      if (entries === undefined) {
        return reject([typeIssue("form data", input)], place);
      }
      const { value, issues } = readEntries(entries, repeated);
      if (issues.length > 0) {
        return reject(issues, place);
      }
      return chain(call(validator, value, place), (result: ValidationResult<unknown>) =>
        result.ok ? accept(result.value, place) : result,
      );
    }),
    { kind: "formData", options, checks, inner: validator },
  );
}
