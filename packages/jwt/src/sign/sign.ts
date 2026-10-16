import { MAX_JSON_DEPTH } from "../core/limits";
import type { JwsAlgorithm, JwtPayload, SigningKey } from "../core/types";
import { encodeBase64Url } from "../encoding/base64url";
import { encodeUtf8 } from "../encoding/text";
import { ALGORITHM_PARAMS } from "../keys/algorithms";
import { getKeyEntry } from "../keys/registry";

/** Header parameters a caller may set when signing. `alg` always comes from the key. */
export interface SignHeader {
  /**
   * The key's algorithm. It may be repeated here, but never changed.
   *
   * @defaultValue the signing key's `alg`
   */
  readonly alg?: JwsAlgorithm;
  /**
   * Key identifier the verifier selects its key by.
   *
   * @defaultValue the signing key's `kid`, or none
   */
  readonly kid?: string;
  /** Media type of the whole token, such as `JWT` or `at+jwt`. */
  readonly typ?: string;
  /** Media type of the payload. */
  readonly cty?: string;
  /**
   * Any other JSON header parameter. `crit`, `b64`, `jwk`, `jku`, `x5u` and `x5c` are refused: this
   * package neither honours nor emits them.
   */
  readonly [parameter: string]: unknown;
}

/** What {@link sign} turns into a token. */
export interface SignInput {
  /**
   * The claims. A plain object of JSON values: strings, finite numbers, booleans, `null`, arrays and
   * plain objects, nested at most 32 deep. `exp`, `nbf` and `iat` are seconds since the Unix epoch.
   */
  readonly payload: JwtPayload;
  /** A private or secret key this package created. It fixes the token's `alg`. */
  readonly key: SigningKey;
  /** Extra protected header parameters. */
  readonly header?: SignHeader;
}

/** Header parameters that ask a verifier to trust something other than its own keys, or to change parsing. */
const FORBIDDEN_HEADER_MEMBERS = ["crit", "b64", "jwk", "jku", "x5u", "x5c"] as const;

/** Header members whose value must be text, written right after `alg` in this order. */
const TEXT_HEADER_MEMBERS = ["kid", "typ", "cty"] as const;

const NUMERIC_DATE_CLAIMS = ["exp", "nbf", "iat"] as const;
const TEXT_CLAIMS = ["iss", "sub", "jti"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Signs a payload into a compact JWS (a JWT) with a key's own algorithm.
 *
 * @remarks
 * The header's `alg` always comes from the key, so a key can never sign under another algorithm. The
 * header is written as `alg`, then `kid`, `typ` and `cty` when present, then the other parameters in
 * the order given. The payload is signed exactly as given: no claim, such as `iat`, is added.
 *
 * @example
 * ```ts
 * const { privateKey } = await generateKeyPair({ alg: "ES256", kid: "2026-10" });
 * const token = await sign({
 *   payload: { iss: "https://issuer.example", sub: "user-1", exp: Math.floor(Date.now() / 1000) + 300 },
 *   key: privateKey,
 *   header: { typ: "JWT" },
 * });
 * ```
 *
 * @param input - The payload, the signing key, and optional header parameters.
 * @returns The compact token, `<header>.<payload>.<signature>` in base64url.
 * @throws TypeError, as a rejected promise, when `input` is not an object; `input.key` is not a private
 * or secret key this package created; `input.header` is not a plain object, names an `alg` other than the
 * key's, holds `crit`, `b64`, `jwk`, `jku`, `x5u` or `x5c`, or a `kid`, `typ` or `cty` that is not a
 * string; `input.payload` is not a plain object; the header or payload holds a value JSON cannot carry
 * exactly (`undefined`, a function, a symbol, a bigint, a non-finite number, a non-plain object, an
 * accessor) or nests deeper than 32 levels; or a registered claim has the wrong type (`exp`, `nbf`, `iat`
 * not finite numbers; `iss`, `sub`, `jti` not strings; `aud` neither a string nor an array of strings).
 */
export async function sign(input: SignInput): Promise<string> {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("sign: input must be an object.");
  }
  const { key } = input;
  const entry = getKeyEntry(key);
  if (key.kind !== "private" && key.kind !== "secret") {
    throw new TypeError("sign: input.key must be a private or secret key.");
  }
  const headerJson = serializeHeader(input.header, key);
  const payloadJson = serializePayload(input.payload);
  const signingInput = `${encodeBase64Url(encodeUtf8(headerJson))}.${encodeBase64Url(encodeUtf8(payloadJson))}`;
  const signature = await crypto.subtle.sign(
    ALGORITHM_PARAMS[key.alg].signParams,
    entry.cryptoKey,
    encodeUtf8(signingInput),
  );
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

/** Validates the caller's header and writes it as JSON with `alg`, `kid`, `typ`, `cty` first. */
function serializeHeader(header: unknown, key: SigningKey): string {
  if (header !== undefined && !isPlainObject(header)) {
    throw new TypeError("sign: input.header must be a plain object.");
  }
  const given = (header ?? {}) as Record<string, unknown>;
  assertJsonObject(given, "input.header");
  if (Object.hasOwn(given, "alg") && given.alg !== key.alg) {
    throw new TypeError("sign: input.header.alg must equal the key's alg.");
  }
  const forbidden = FORBIDDEN_HEADER_MEMBERS.find((name) => Object.hasOwn(given, name));
  if (forbidden !== undefined) {
    throw new TypeError(`sign: input.header.${forbidden} is not supported.`);
  }
  const notText = TEXT_HEADER_MEMBERS.find((name) => Object.hasOwn(given, name) && typeof given[name] !== "string");
  if (notText !== undefined) {
    throw new TypeError(`sign: input.header.${notText} must be a string.`);
  }
  const kid = Object.hasOwn(given, "kid") ? given.kid : key.kid;
  const members: [string, unknown][] = [["alg", key.alg]];
  if (kid !== undefined) {
    members.push(["kid", kid]);
  }
  for (const name of ["typ", "cty"] as const) {
    if (Object.hasOwn(given, name)) {
      members.push([name, given[name]]);
    }
  }
  const leading: readonly string[] = ["alg", ...TEXT_HEADER_MEMBERS];
  for (const [name, value] of Object.entries(given)) {
    if (!leading.includes(name)) {
      members.push([name, value]);
    }
  }
  // Written member by member: an object would list integer-like names before `alg`.
  return `{${members.map(([name, value]) => `${JSON.stringify(name)}:${JSON.stringify(value)}`).join(",")}}`;
}

/** Validates the payload and its registered claims, and writes it as JSON. */
function serializePayload(payload: unknown): string {
  if (!isPlainObject(payload)) {
    throw new TypeError("sign: input.payload must be a plain object.");
  }
  assertJsonObject(payload, "input.payload");
  for (const name of NUMERIC_DATE_CLAIMS) {
    if (Object.hasOwn(payload, name) && typeof payload[name] !== "number") {
      throw new TypeError(`sign: input.payload.${name} must be a finite number of seconds.`);
    }
  }
  for (const name of TEXT_CLAIMS) {
    if (Object.hasOwn(payload, name) && typeof payload[name] !== "string") {
      throw new TypeError(`sign: input.payload.${name} must be a string.`);
    }
  }
  if (Object.hasOwn(payload, "aud") && !isAudience(payload.aud)) {
    throw new TypeError("sign: input.payload.aud must be a string or an array of strings.");
  }
  return JSON.stringify(payload);
}

// `Array.prototype.every` is called directly, so an array's own `every` cannot vouch for its entries.
const isAudience = (value: unknown): boolean =>
  typeof value === "string" ||
  (Array.isArray(value) && Array.prototype.every.call(value, (entry) => typeof entry === "string"));

/**
 * Throws unless `object` holds only values `JSON.stringify` writes exactly and the strict parser reads
 * back the same, nested at most {@link MAX_JSON_DEPTH} deep. A cycle exceeds the depth, so it is caught too.
 */
function assertJsonObject(object: Record<string, unknown>, label: string): void {
  const pending: { readonly value: unknown; readonly depth: number }[] = [{ value: object, depth: 1 }];
  while (pending.length > 0) {
    const { value, depth } = pending.pop() as { readonly value: unknown; readonly depth: number };
    for (const child of childrenOf(value, label)) {
      if (typeof child === "object" && child !== null) {
        if (depth + 1 > MAX_JSON_DEPTH) {
          throw new TypeError(`sign: ${label} must not nest deeper than ${MAX_JSON_DEPTH} levels.`);
        }
        pending.push({ value: child, depth: depth + 1 });
      } else {
        assertJsonPrimitive(child, label);
      }
    }
  }
}

/** Lists the member values of a JSON container, throwing for anything else. */
function childrenOf(container: unknown, label: string): readonly unknown[] {
  // `JSON.stringify` runs an own `toJSON`, enumerable or not, so it would write a value never checked here.
  if (typeof container === "object" && container !== null && Object.hasOwn(container, "toJSON")) {
    throw new TypeError(`sign: ${label} must not hold toJSON methods.`);
  }
  if (Array.isArray(container)) {
    return Array.from({ length: container.length }, (_, index) => ownDataValue(container, String(index), label));
  }
  if (!isPlainObject(container)) {
    throw new TypeError(`sign: ${label} must hold only plain objects and arrays.`);
  }
  if (Object.getOwnPropertySymbols(container).length > 0) {
    throw new TypeError(`sign: ${label} must not have symbol keys.`);
  }
  return Object.keys(container).map((name) => ownDataValue(container, name, label));
}

function ownDataValue(container: object, name: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(container, name);
  if (descriptor === undefined) {
    throw new TypeError(`sign: ${label} must not hold array holes.`);
  }
  if (!("value" in descriptor)) {
    throw new TypeError(`sign: ${label} must not hold accessor properties.`);
  }
  return descriptor.value;
}

function assertJsonPrimitive(value: unknown, label: string): void {
  if (typeof value === "string" || typeof value === "boolean" || value === null) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`sign: ${label} must not hold a non-finite number.`);
    }
    return;
  }
  throw new TypeError(`sign: ${label} must hold only JSON values, not ${typeof value}.`);
}
