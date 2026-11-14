import { runOf } from "../core/child";
import { toValidator } from "../core/make";
import { count, type Run } from "../core/run";
import type { AnyValidator, Composed, Infer, InferInput } from "../core/types";
import { NO_WORDS } from "../core/words";

/**
 * What `readonly` makes of the type a validator produces: its properties or items read-only, and a `Map`
 * or a `Set` the read-only kind, with the mark of a `brand` kept. `unknown` stays as it is. `Readonly`
 * covers properties and not methods, so a `Date` or a typed array keeps the ones that change it.
 *
 * @typeParam T - The type the wrapped validator produces.
 */
export type ReadonlyOutput<T> = unknown extends T
  ? T
  : T extends ReadonlyMap<infer TKey, infer TValue>
    ? ReadonlyMap<TKey, TValue> & BrandOf<T>
    : T extends ReadonlySet<infer TItem>
      ? ReadonlySet<TItem> & BrandOf<T>
      : Readonly<T>;

/** The mark `brand` put on a type, which naming the read-only kind of a `Map` or a `Set` would drop. */
type BrandOf<T> = T extends { readonly "~brand": infer TBrand } ? { readonly "~brand": TBrand } : unknown;

/**
 * Wraps a validator so the value it produces cannot be changed: its type is read-only, and the object or
 * array is frozen.
 *
 * @remarks
 * It freezes the value itself and not what is inside it, as `Object.freeze` does and as the type says:
 * wrap an inner validator too where its value must not change. Three things are left as they are:
 *
 * - **The input.** A validator that produces the very value it was given, such as `instanceOf`,
 *   `guard` or `unknown`, has its type made read-only and nothing frozen, since freezing would change
 *   an object the caller owns. `object`, `objectLike`, `array`, `tuple` and `record` produce a new value, which is
 *   frozen.
 * - **What a `Map` and a `Set` hold.** A new one is frozen as any other value is, which does not stop
 *   `set` or `add`, so only the type keeps them from being changed.
 * - **A typed array or a `DataView`.** A typed array cannot be frozen, and freezing a `DataView` would
 *   not stop it writing to its buffer.
 *
 * A value is taken to be the caller's when it is the input itself. When a `transform` or a validator
 * written by hand returns a value from inside the input, such as `(value) => value.tags`, that value is
 * not the input and is frozen: copy it there, `[...value.tags]`, when the caller must keep it changeable.
 * So is an object it returns from your own data, such as `(key) => cache[key]`, which freezes the entry in
 * `cache`: return a copy there too.
 *
 * `pick`, `omit`, `required` and `partial` read an `object`, so reshape first and wrap after.
 *
 * @example
 * ```ts
 * const settings = readonly(object({ theme: string(), tags: readonly(array(string())) }));
 * type Settings = Infer<typeof settings>; // { readonly theme: string; readonly tags: readonly string[] }
 *
 * const result = settings(input);
 * if (result.ok) {
 *   result.value.theme = "dark"; // a compile error, and a TypeError in strict mode
 * }
 * ```
 *
 * @typeParam TValidator - The wrapped validator.
 * @param validator - The validator whose value is made read-only.
 * @returns A validator that produces the same value, frozen, typed read-only.
 * @throws {TypeError} When `validator` is not a function.
 */
export function readonly<TValidator extends AnyValidator>(
  validator: TValidator,
): Composed<TValidator, ReadonlyOutput<Infer<TValidator>>, InferInput<TValidator>> {
  const runInner = runOf(validator, "validator");
  const tools = runInner.w;
  // A value the validator gave back as it is belongs to the caller, and a view of a buffer cannot be
  // frozen. What a failure gives in place of a value is neither, and freezing it changes nothing.
  const frozen = (value: unknown, input: unknown): unknown => {
    if (value !== input && !ArrayBuffer.isView(value)) {
      Object.freeze(value);
    }
    return value;
  };
  const run: Run = (input) => {
    const value = runInner(input);
    return tools !== undefined && tools.is(value)
      ? tools.after(count(), value, (later) => frozen(later, input))
      : frozen(value, input);
  };
  run.w = tools;
  return toValidator<Composed<TValidator, ReadonlyOutput<Infer<TValidator>>, InferInput<TValidator>>>(
    run,
    { kind: "readonly", inner: validator },
    NO_WORDS,
    [validator],
  );
}
