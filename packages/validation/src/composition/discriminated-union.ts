import { chain, type Maybe } from "../core/async";
import { invalidObject, isPlainObject, setOwn } from "../core/objects";
import { failWith, pass, toIssue } from "../core/result";
import type { AnyValidator, Composed, Infer, ValidationResult } from "../core/types";

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The variants of a tagged union: a validator for each value the tag can have. */
export type Variants = Record<string, AnyValidator<object>>;

/**
 * The type a tagged union produces: one object type per variant, each with its tag property set to
 * the literal tag, so checking the tag narrows the type.
 *
 * @typeParam TKey - The name of the tag property.
 * @typeParam TVariants - The variants, keyed by tag.
 */
export type InferDiscriminated<TKey extends string, TVariants extends Variants> = {
  [TTag in keyof TVariants & string]: Simplify<Infer<TVariants[TTag]> & { [K in TKey]: TTag }>;
}[keyof TVariants & string];

/**
 * Creates a validator for objects that share a tag property and differ in the rest, such as events
 * with a `type`. The tag chooses the variant, so a failure reports that variant's own issues
 * instead of a list of everything that did not match.
 *
 * @remarks
 * The input's tag must be one of the keys of `variants`, and the variant validates the rest of the
 * input, without the tag. The variant must not list the tag property: one that does, such as
 * `object({ type: literal("click"), ... })`, never sees it and fails. That is also why a strict object
 * works as a variant. The tag is added back to the output, so the result is a proper tagged union.
 * A missing, unknown or non-string tag fails with `invalid_union`, at the
 * tag's path, with `params: { discriminator, options }` listing the accepted tags. It is synchronous
 * when every variant is, and asynchronous otherwise.
 *
 * @example
 * ```ts
 * const event = discriminatedUnion("type", {
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
 * @param variants - A validator for each tag value. Each must produce an object.
 * @returns A validator that produces one of the variants' objects, tagged.
 */
export function discriminatedUnion<const TKey extends string, const TVariants extends Variants>(
  key: TKey,
  variants: TVariants,
): Composed<TVariants[keyof TVariants], InferDiscriminated<TKey, TVariants>> {
  const tags = Object.keys(variants);

  const validate = (input: unknown): Maybe<ValidationResult<unknown>> => {
    if (!isPlainObject(input)) {
      return invalidObject(input);
    }
    const tag = Object.hasOwn(input, key) ? input[key] : undefined;
    if (typeof tag !== "string" || !Object.hasOwn(variants, tag)) {
      return failWith([
        toIssue({ code: "invalid_union", path: [key], params: { discriminator: key, options: [...tags] } }),
      ]);
    }
    const rest = {};
    for (const name of Object.keys(input)) {
      if (name !== key) {
        setOwn(rest, name, input[name]);
      }
    }
    return chain((variants[tag] as AnyValidator)(rest), (result) =>
      result.ok ? pass({ [key]: tag, ...(result.value as object) }) : result,
    );
  };
  return validate as unknown as Composed<TVariants[keyof TVariants], InferDiscriminated<TKey, TVariants>>;
}
