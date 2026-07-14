import type { PropertyConstructor } from "../types.js";

/**
 * Casts a Boolean property value from HTML attribute semantics.
 * `null` (attribute removal via `removeAttribute`) and the string `"false"`
 * map to `false`; all other values map to `true`.
 */
function castBoolean(value: unknown): boolean {
  return !(value === null || value === false || value === "false");
}

/**
 * Casts a Number property value.
 * Empty or whitespace-only strings cast to `NaN` to prevent silent coercion
 * to `0` that `Number("")` would produce.
 */
function castNumber(value: unknown): number {
  if (typeof value === "string" && value.trim() === "") {
    return NaN;
  }
  return Number(value);
}

/** Casts a String property value via `String()`. */
function castString(value: unknown): string {
  return String(value);
}

/**
 * Casts an Array property value.
 * String values are parsed as JSON. Throws if the string is not valid JSON
 * or the parsed result is not an array.
 */
function castArray(value: unknown): unknown {
  let parsed = value;
  if (typeof value === "string") {
    if (value.trim() === "") {
      return undefined;
    }
    try {
      parsed = JSON.parse(value);
    } catch (err) {
      throw new Error(`Failed to parse JSON value for property of type Array: "${value}"`, {
        cause: err instanceof Error ? err : undefined,
      });
    }
  }
  if (parsed === null) {
    return null;
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Property of type Array received non-array value: ${String(parsed)}`);
  }
  return parsed;
}

/**
 * Casts an Object property value.
 * String values are parsed as JSON. Throws if the string is not valid JSON
 * or the parsed result is not a plain object.
 */
function castObject(value: unknown): unknown {
  let parsed = value;
  if (typeof value === "string") {
    if (value.trim() === "") {
      return undefined;
    }
    try {
      parsed = JSON.parse(value);
    } catch (err) {
      throw new Error(`Failed to parse JSON value for property of type Object: "${value}"`, {
        cause: err instanceof Error ? err : undefined,
      });
    }
  }
  if (parsed === null) {
    return null;
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Property of type Object received non-object value: ${String(parsed)}`);
  }
  return parsed;
}

const NATIVE_CONSTRUCTORS_REGEX =
  /^(?:Date|RegExp|Map|Set|URL|URLSearchParams|WeakMap|WeakSet|ArrayBuffer|SharedArrayBuffer|DataView|Float32Array|Float64Array|Int8Array|Int16Array|Int32Array|Uint8Array|Uint8ClampedArray|Uint16Array|Uint32Array|BigInt64Array|BigUint64Array)$/;

/**
 * Casts a value using a custom constructor or converter function.
 * If the value is already an instance of the type, it passes through unchanged.
 * Class constructors (detected via source inspection) are invoked with `new`;
 * plain factory functions are called directly.
 */
function castCustomConstructor(value: unknown, type: PropertyConstructor): unknown {
  if (value instanceof (type as new (...args: unknown[]) => unknown)) {
    return value;
  }
  const typeStr = Function.prototype.toString.call(type);
  const descriptor = Object.getOwnPropertyDescriptor(type, "prototype");
  const isClassOrNative =
    typeStr.startsWith("class") ||
    (descriptor !== undefined && !descriptor.writable) ||
    NATIVE_CONSTRUCTORS_REGEX.test(type.name);
  try {
    if (isClassOrNative) {
      return new (type as new (...args: unknown[]) => unknown)(value);
    }
    return (type as (...args: unknown[]) => unknown)(value);
  } catch (err) {
    throw new Error(`Failed to convert value using custom constructor/converter: "${value}"`, {
      cause: err instanceof Error ? err : undefined,
    });
  }
}

/**
 * Dispatch map for O(1) lookup of primitive type casters.
 * Boolean is intentionally excluded — it requires null-handling before dispatch
 * that differs from the other primitive types.
 */
const PRIMITIVE_CASTERS = new Map<PropertyConstructor, (value: unknown) => unknown>([
  [String, castString],
  [Number, castNumber],
  [Array, castArray],
  [Object, castObject],
]);

/**
 * Casts a raw attribute or property value to the type indicated by its
 * constructor. Called at every property set and `attributeChangedCallback`.
 *
 * - `undefined` passes through unchanged for all types. An `undefined` value
 *   means the property has never been set and should stay uninitialized.
 * - `null` passes through unchanged for non-Boolean types; for `Boolean`,
 *   `null` maps to `false` (attribute-removal semantics).
 * - `Object`/`Array` constructors attempt `JSON.parse` when value is a string.
 * - Custom constructors are invoked via `new` (classes) or direct call
 *   (factory functions).
 * - Unrecognized constructors pass the value through unchanged as a fallback.
 *
 * @internal
 */
export function castProperty(value: unknown, type: PropertyConstructor): unknown {
  if (value === undefined) {
    return value;
  }
  // Boolean needs special handling: null → false (attribute removal semantics).
  if (type === Boolean) {
    return castBoolean(value);
  }
  // For all other types, null passes through so callers can distinguish
  // "attribute removed" from a typed value.
  if (value === null) {
    return value;
  }
  const caster = PRIMITIVE_CASTERS.get(type);
  if (caster !== undefined) {
    return caster(value);
  }
  if (typeof type === "function") {
    return castCustomConstructor(value, type);
  }
  return value;
}
