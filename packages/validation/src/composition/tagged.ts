import { chain, type Maybe } from "../core/async";
import { tail } from "../core/checks";
import { described } from "../core/describe";
import { call, composed } from "../core/nesting";
import { assertShape, isPlainObject, objectIssue, setOwn } from "../core/objects";
import { assertFunction, assertText, describeType, issue } from "../core/result";
import type {
  AnyValidator,
  AsyncRest,
  AsyncValidator,
  Composed,
  Infer,
  InferInput,
  MessageOptions,
  Rest,
  ValidationResult,
} from "../core/types";

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The variants of a tagged union: a validator for each value the tag can have. */
export type Variants = Record<string, AnyValidator<object>>;

/**
 * The property names a type declares, without its index signatures: `{ [key: string]: unknown; type:
 * string }` declares `"type"`, and a `Record<string, number>` declares none.
 */
type DeclaredKeys<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : symbol extends K ? never : K]: T[K];
};

/**
 * The variants as `tagged` accepts them. A variant whose output type is an array or a
 * function, which cannot carry the tag, or declares the tag property, even as optional or beside an
 * index signature, which the variant is never given, is typed `never`, so passing it is a compile error
 * at that variant. So is one that accepts the tag property and produces none, such as a `transform` that
 * drops it, since it would wait for a property it is never given. An index signature alone, as a `record` has, declares no property, so it is accepted.
 */
type CheckedVariants<TKey extends string, TVariants extends Variants> = {
  [TTag in keyof TVariants]: Infer<TVariants[TTag]> extends readonly unknown[] | ((...args: never[]) => unknown)
    ? never
    : TKey extends DeclaredKeys<Infer<TVariants[TTag]>> | DeclaredKeys<InferInput<TVariants[TTag]>>
      ? never
      : TVariants[TTag];
};

/**
 * The type a tagged union produces: one object type per variant, each with its tag property set to
 * the literal tag, so checking the tag narrows the type.
 *
 * @typeParam TKey - The name of the tag property.
 * @typeParam TVariants - The variants, keyed by tag.
 */
export type InferTagged<TKey extends string, TVariants extends Variants> = {
  [TTag in keyof TVariants & string]: Simplify<Infer<TVariants[TTag]> & { [K in TKey]: TTag }>;
}[keyof TVariants & string];

/**
 * The union that can pass a set of variants: for each tag, what its variant accepts with the tag added.
 *
 * @typeParam TKey - The property that holds the tag.
 * @typeParam TVariants - Variant validators, keyed by tag.
 */
export type InferTaggedInput<TKey extends string, TVariants extends Variants> = {
  [TTag in keyof TVariants & string]: Simplify<InferInput<TVariants[TTag]> & { [K in TKey]: TTag }>;
}[keyof TVariants & string];

/**
 * Creates a validator for objects that share a tag property and differ in the rest, such as events
 * with a `type`. The tag chooses the variant, so a failure reports that variant's own issues
 * instead of a list of everything that did not match.
 *
 * @remarks
 * The input's tag must be one of the keys of `variants`, and the variant validates the rest of the
 * input, without the tag. The variant must not list the tag property: one that does, such as
 * `object({ type: literal("click"), ... })`, never sees it and fails, so its type is rejected. That is
 * also why a strict object works as a variant, and a `record` does too, checking every key but the
 * tag. The tag is added back to the output, so the result is a proper tagged union. Each variant must produce a plain object: an array, a `Date`, a class instance
 * or anything else would be taken apart by adding the tag, so a variant whose output type is an array
 * or a function is a compile error, and one that produces any non-plain value throws a `TypeError`
 * when it does, as a callback's bug does.
 * The input must be a plain object too, whatever the variants accept: an instance fails with
 * `invalid_type` before any variant sees it, so `objectLike` variants belong in a `union`.
 * A missing, unknown or non-string tag fails with `invalid_union`, at the
 * tag's path, with `params: { discriminator, options }` listing the accepted tags. It is synchronous
 * when every variant is, and asynchronous otherwise.
 * A getter or `Proxy` trap in the input that throws while it is read propagates, as a callback's
 * exception does; data parsed from JSON has none.
 *
 * @example
 * ```ts
 * const event = tagged("type", {
 *   click: object({ x: number(), y: number() }),
 *   key: object({ key: string({ min: 1 }) }),
 * });
 *
 * event({ type: "key", key: "a" }); // { ok: true, value: { type: "key", key: "a" } }
 * event({ type: "scroll" }); // { ok: false, ... }, code "invalid_union" at path ["type"]
 * event({ type: "click", x: 1 }); // { ok: false, ... }, code "invalid_type" at path ["y"]
 * ```
 *
 * @typeParam TKey - The name of the tag property.
 * @typeParam TVariants - The variants, keyed by tag.
 * @param key - The name of the tag property.
 * @param variants - A validator for each tag value. Each must produce a plain object.
 * @returns A validator that produces one of the variants' objects, tagged.
 * @throws {TypeError} When `key` is not text, `variants` is not a plain object, there is no variant or a
 * variant is not a function, and, from the returned validator, when a variant produces something other
 * than a plain object.
 */
export function tagged<const TKey extends string, const TVariants extends Variants>(
  key: TKey,
  variants: TVariants & CheckedVariants<TKey, TVariants>,
  ...rest: Rest<InferTagged<TKey, TVariants>, MessageOptions>
): Composed<TVariants[keyof TVariants], InferTagged<TKey, TVariants>, InferTaggedInput<TKey, TVariants>>;
export function tagged<const TKey extends string, const TVariants extends Variants>(
  key: TKey,
  variants: TVariants & CheckedVariants<TKey, TVariants>,
  ...rest: AsyncRest<InferTagged<TKey, TVariants>, MessageOptions>
): AsyncValidator<InferTagged<TKey, TVariants>, InferTaggedInput<TKey, TVariants>>;
export function tagged(key: string, variants: Variants, ...rest: unknown[]): AnyValidator {
  assertText("tagged(key)", key);
  assertShape(variants, "variants");
  // The variants are read once, so changing the record after the validator is made changes nothing.
  const table = new Map(Object.entries(variants));
  const tags = [...table.keys()];
  if (tags.length === 0) {
    // The types forbid it, but a union of no variants would reject every value without saying why.
    throw new TypeError("tagged() needs at least one variant");
  }
  table.forEach((variant, tag) => assertFunction(`variants.${tag}`, variant));
  const [options, reject, accept, checks] = tail<MessageOptions, object>(rest);

  return described(
    composed((input, place): Maybe<ValidationResult<unknown>> => {
      if (!isPlainObject(input)) {
        return reject([objectIssue(input)], place);
      }
      const tag = Object.hasOwn(input, key) ? input[key] : undefined;
      const variant = typeof tag === "string" ? table.get(tag) : undefined;
      if (variant === undefined) {
        return reject([issue("invalid_union", { discriminator: key, options: [...tags] }, [key])], place);
      }
      const others = {};
      for (const name of Object.keys(input)) {
        if (name !== key) {
          setOwn(others, name, input[name]);
        }
      }
      return chain(call(variant, others, place), (result) => {
        if (!result.ok) {
          return result;
        }
        if (!isPlainObject(result.value)) {
          // Spreading it into the tagged output would take it apart, silently, so it is a bug in the schema.
          throw new TypeError(`variants.${tag} must produce a plain object, received ${describeType(result.value)}`);
        }
        // The tag is defined first, for its place in the output, and again last, so the variant cannot replace it.
        return accept({ [key]: tag, ...result.value, [key]: tag }, place);
      });
    }),
    { kind: "tagged", options, checks, key, variants: Object.freeze(Object.fromEntries(table)) },
  );
}
