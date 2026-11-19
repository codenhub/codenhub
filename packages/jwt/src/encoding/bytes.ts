const typedArrayTag = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  Symbol.toStringTag,
)?.get as ((this: unknown) => unknown) | undefined;

/**
 * Whether `value` is a real `Uint8Array`, from any realm. The tag getter reads an internal slot, so a
 * Proxy around a typed array, a look-alike and a subclass that overrides `Symbol.toStringTag` give no
 * false answer, and no trap or getter of `value` runs. A subclass of `Uint8Array` is one too.
 */
export function isUint8Array(value: unknown): value is Uint8Array {
  try {
    return typedArrayTag?.call(value) === "Uint8Array";
  } catch {
    return false;
  }
}
