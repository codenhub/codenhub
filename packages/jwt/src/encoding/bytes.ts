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

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const intrinsicGetter = (prototype: object, name: string): ((this: unknown) => unknown) =>
  Object.getOwnPropertyDescriptor(prototype, name)?.get as (this: unknown) => unknown;
const typedArrayBuffer = intrinsicGetter(typedArrayPrototype, "buffer");
const typedArrayByteOffset = intrinsicGetter(typedArrayPrototype, "byteOffset");
const typedArrayByteLength = intrinsicGetter(typedArrayPrototype, "byteLength");
const dataViewBuffer = intrinsicGetter(DataView.prototype, "buffer");
const dataViewByteOffset = intrinsicGetter(DataView.prototype, "byteOffset");
const dataViewByteLength = intrinsicGetter(DataView.prototype, "byteLength");
const arrayBufferByteLength = intrinsicGetter(ArrayBuffer.prototype, "byteLength");

/**
 * A fresh copy of the bytes `value` holds, or undefined when it holds none: a typed array or `DataView` of
 * any realm, its view only, or a whole `ArrayBuffer` of any realm. Internal slots are read through this
 * realm's own getters, so an overridden `buffer`, `length` or iterator of `value` never runs, and a later
 * change to the caller's buffer cannot reach the copy. A detached buffer gives undefined.
 */
export function copyBytes(value: unknown): Uint8Array<ArrayBuffer> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    let buffer: unknown;
    let offset: number;
    let length: number;
    if (typedArrayTag?.call(value) !== undefined) {
      buffer = typedArrayBuffer.call(value);
      offset = typedArrayByteOffset.call(value) as number;
      length = typedArrayByteLength.call(value) as number;
    } else if (ArrayBuffer.isView(value)) {
      buffer = dataViewBuffer.call(value);
      offset = dataViewByteOffset.call(value) as number;
      length = dataViewByteLength.call(value) as number;
    } else {
      length = arrayBufferByteLength.call(value) as number;
      buffer = value;
      offset = 0;
    }
    const copy = new Uint8Array(length);
    copy.set(new Uint8Array(buffer as ArrayBuffer, offset, length));
    return copy;
  } catch {
    // Not bytes, or a detached buffer.
    return undefined;
  }
}

/** Whether `value` is an `ArrayBuffer` of any realm, read from its internal slot. */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  try {
    arrayBufferByteLength.call(value);
    return true;
  } catch {
    return false;
  }
}
