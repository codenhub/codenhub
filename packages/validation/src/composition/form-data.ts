import { runOf, toolsOf } from "../core/child";
import { endOf, waitsOf } from "../core/finish";
import { toValidator } from "../core/make";
import { formEntriesOf } from "../core/objects";
import { assertOption } from "../core/result";
import { count, FAIL, refuse, type Run } from "../core/run";
import { split } from "../core/split";
import type { AnyValidator, AsyncRest, AsyncSchema, Composed, Infer, MessageOptions, Rest } from "../core/types";
import { wordKey, wordSize, wordType } from "../core/words";
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
 * `GlobalFormData`, the type it accepts, is the runtime's `FormData`: the DOM's or Node.js's where the
 * program is compiled with their types, and otherwise any iterable of `[name, value]` entries, each value
 * text or a `File` as `file` produces it. Either way, only a real `FormData` passes.
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
 * @throws {TypeError} When `validator` is not a validator of this copy of the package, a check was not made by `check`, `checkFields` or a built-in check, or `repeated` is not a boolean.
 */
export function formData<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: Rest<Infer<TValidator>, FormDataOptions>
): Composed<TValidator, Infer<TValidator>, GlobalFormData>;
export function formData<TValidator extends AnyValidator>(
  validator: TValidator,
  ...rest: AsyncRest<Infer<TValidator>, FormDataOptions>
): AsyncSchema<Infer<TValidator>, GlobalFormData>;
export function formData(validator: AnyValidator, ...rest: unknown[]): AnyValidator {
  const runInner = runOf(validator, "validator");
  const [options, checks] = split<FormDataOptions, unknown>(rest, "repeated");
  const { repeated = false, message } = options;
  assertOption("repeated", repeated, "boolean");
  const tools = toolsOf([runInner], waitsOf(checks));
  const end = endOf(checks, message, tools);
  const run: Run = (input) => {
    const entries = formEntriesOf(input);
    if (entries === undefined) {
      return refuse("form data", input, message);
    }
    const start = count();
    const value = readEntries(entries, repeated, message);
    return count() > start ? FAIL : end(runInner(value));
  };
  run.w = tools;
  return toValidator(
    run,
    { kind: "formData", options, checks, inner: validator },
    [wordType, wordKey, wordSize],
    [validator],
  );
}
