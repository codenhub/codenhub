import { MAX_JSON_DEPTH } from "../core/limits";
import { rejectUnknownOptions } from "../core/options";
import { isPlainArray, isPlainObject } from "../core/plain";
import type {
  JsonCompatible,
  JwsAlgorithm,
  JwtPayload,
  JwtRegisteredClaims,
  PublicKey,
  SigningKey,
} from "../core/types";
import { encodeBase64Url } from "../encoding/base64url";
import { encodeUtf8 } from "../encoding/text";
import { ALGORITHM_PARAMS, type AlgorithmParams } from "../keys/algorithms";
import { exportPublicJwk } from "../keys/export";
import { getKeyEntry, isRegisteredKey, type KeyEntry } from "../keys/registry";

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
  /** Refused: this package implements no extension a verifier must understand. */
  readonly crit?: never;
  /** Refused: unencoded payloads (RFC 7797) are not supported. */
  readonly b64?: never;
  /** Refused: write it with `embedKey`, which proves it is the signing key's public half. */
  readonly jwk?: never;
  /** Refused: a verifier that trusts it lets the token choose its own key. */
  readonly jku?: never;
  /** Refused: a verifier that trusts it lets the token choose its own key. */
  readonly x5u?: never;
  /** Refused: a verifier that trusts it lets the token choose its own key. */
  readonly x5c?: never;
  /** Any other JSON header parameter. */
  readonly [parameter: string]: unknown;
}

/**
 * What {@link sign} turns into a token.
 *
 * @typeParam TPayload - The payload's own type, which may be an `interface`. Registered claims must have
 * their RFC 7519 types, and every member must be a JSON value.
 */
export interface SignInput<TPayload extends object = JwtPayload> {
  /**
   * The claims. A plain object of JSON values: strings, finite numbers, booleans, `null`, arrays and
   * plain objects, nested at most 32 deep. `exp`, `nbf` and `iat` are seconds since the Unix epoch, at
   * most 253402300799, so a time in milliseconds throws.
   */
  readonly payload: TPayload & JwtRegisteredClaims & JsonCompatible<TPayload>;
  /** A private or secret key this package created. It fixes the token's `alg`. */
  readonly key: SigningKey;
  /** Extra protected header parameters. */
  readonly header?: SignHeader;
  /**
   * A public key to embed in the header as `jwk`, so the token carries the key that verifies it, as a DPoP
   * proof does (RFC 9449 §4.2). It must be the public half of `key`, bound to the same algorithm; the
   * signature is checked with it before the token is returned. Only its material is written: no `alg`,
   * `use` or `kid`.
   *
   * @defaultValue no `jwk` header
   */
  readonly embedKey?: PublicKey;
  /**
   * Writes `iat`, the current time in whole seconds. The payload must not set `iat` too.
   *
   * @defaultValue false, no `iat` unless the payload has one
   */
  readonly issuedAt?: boolean;
  /**
   * Writes `nbf` this many whole seconds after the current time, at most 315360000 (ten years), so a time in
   * milliseconds throws. The payload must not set `nbf` too.
   *
   * @defaultValue no `nbf` unless the payload has one
   */
  readonly notBefore?: number;
  /**
   * Writes `exp` this many whole seconds after the current time, the same time `issuedAt` writes, at most
   * 315360000 (ten years), so a time in milliseconds throws. The payload must not set `exp` too.
   *
   * @defaultValue no `exp` unless the payload has one
   */
  readonly expiresIn?: number;
  /**
   * Writes `jti`, a random UUID from `crypto.randomUUID()`. The payload must not set `jti` too.
   *
   * @defaultValue false, no `jti` unless the payload has one
   */
  readonly jti?: boolean;
  /**
   * The clock `issuedAt`, `notBefore` and `expiresIn` read, in milliseconds since the Unix epoch, as a
   * verifier's `now` is. It is called once, and only when one of them is given.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
}

const INPUT_MEMBERS: Readonly<Record<keyof SignInput, true>> = {
  payload: true,
  key: true,
  header: true,
  embedKey: true,
  issuedAt: true,
  notBefore: true,
  expiresIn: true,
  jti: true,
  now: true,
};

/** The members of an embedded public key, in the order {@link exportPublicJwk} writes them. */
const EMBEDDED_MEMBERS = ["kty", "crv", "x", "y", "n", "e"] as const;

/** Header parameters that ask a verifier to trust something other than its own keys, or to change parsing. */
const FORBIDDEN_HEADER_MEMBERS = ["crit", "b64", "jwk", "jku", "x5u", "x5c"] as const;

/** Header members whose value must be text, written right after `alg` in this order. */
const TEXT_HEADER_MEMBERS = ["kid", "typ", "cty"] as const;

const NUMERIC_DATE_CLAIMS = ["exp", "nbf", "iat"] as const;
/**
 * The last second of 9999-12-31, the latest a numeric date may name (scope.md decision 45). Every timestamp in
 * milliseconds since 1978 is larger, so `Date.now()` given in place of seconds is caught rather than signing a
 * token that expires in some 55,000 years.
 */
const MAX_NUMERIC_DATE = 253_402_300_799;
const TEXT_CLAIMS = ["iss", "sub", "jti"] as const;
/**
 * The largest `expiresIn` or `notBefore`, ten years of 365 days. `Date.now()`, or a duration in milliseconds
 * of four days or more, is larger, so either given in place of seconds throws (scope.md decision 55). A
 * shorter duration in milliseconds passes as a longer one in seconds; the option names say seconds.
 */
const MAX_RELATIVE_SECONDS = 315_360_000;
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Signs a payload into a compact JWS (a JWT) with a key's own algorithm.
 *
 * @remarks
 * The header's `alg` always comes from the key, so a key can never sign under another algorithm. The
 * header is written as `alg`, then `kid`, `typ` and `cty` when present, then `jwk` for an `embedKey`,
 * then the other parameters in the order given. The payload is signed as given, plus only the claims
 * `issuedAt`, `notBefore`, `expiresIn` and `jti` ask for, written after the payload's own members.
 *
 * @example
 * ```ts
 * const { privateKey } = await generateKeyPair({ alg: "ES256", kid: "2026-10" });
 * const token = await sign({
 *   payload: { iss: "https://issuer.example", sub: "user-1" },
 *   key: privateKey,
 *   header: { typ: "JWT" },
 *   issuedAt: true,
 *   expiresIn: 300,
 * });
 * ```
 *
 * @param input - The payload, the signing key, optional header parameters, an optional public key to embed,
 * and the claims to add.
 * @returns The compact token, `<header>.<payload>.<signature>` in base64url.
 * @throws TypeError, as a rejected promise, when `input` is not an object; `input.key` is not a private
 * or secret key this package created; `input.header` is not a plain object, names an `alg` other than the
 * key's, holds `crit`, `b64`, `jwk`, `jku`, `x5u` or `x5c`, or a `kid`, `typ` or `cty` that is not a
 * string; `input.payload` is not a plain object; the header or payload holds a value JSON cannot carry
 * exactly (`undefined`, a function, a symbol, a bigint, a non-finite number or `-0`, a non-plain object, an
 * accessor) or nests deeper than 32 levels; or a registered claim has the wrong type (`exp`, `nbf`, `iat`
 * not finite numbers, or past 253402300799, the end of year 9999, as a time in milliseconds is; `iss`,
 * `sub`, `jti` not strings; `aud` neither a string nor an array of strings);
 * `input` has a member other than `payload`, `key`, `header`, `embedKey`, `issuedAt`, `notBefore`,
 * `expiresIn`, `jti` and `now`; `input.issuedAt` or `input.jti` is not a boolean, `input.notBefore` or
 * `input.expiresIn` is not a whole number of seconds from 0 to 315360000, `input.now` is not a function or
 * returns something other than milliseconds before the year 9990, or one of these options adds a claim the
 * payload already has; or `input.embedKey` is not a public key this package created, `input.key` is not a
 * private key, or the two are not one key pair bound to one algorithm.
 */
export async function sign<TPayload extends object = JwtPayload>(input: SignInput<TPayload>): Promise<string> {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("sign: input must be an object.");
  }
  rejectUnknownOptions(input, INPUT_MEMBERS, "sign", "input");
  const { key } = input;
  const entry = getKeyEntry(key);
  if (key.kind !== "private" && key.kind !== "secret") {
    throw new TypeError("sign: input.key must be a private or secret key.");
  }
  const embedded = input.embedKey === undefined ? undefined : await embeddedJwk(input.embedKey, key);
  const headerJson = serializeHeader(input.header, key, embedded?.jwk);
  const payloadJson = serializePayload(input.payload, addedClaims(input));
  const signingInput = `${encodeBase64Url(encodeUtf8(headerJson))}.${encodeBase64Url(encodeUtf8(payloadJson))}`;
  const signedBytes = encodeUtf8(signingInput);
  const { signParams } = ALGORITHM_PARAMS[key.alg];
  const signature = await signatureOf(entry, signParams, signedBytes);
  // Matching algorithms do not make a pair: a token embedding another key would never verify, so the
  // pairing is proven on the signature itself.
  if (embedded !== undefined && !(await crypto.subtle.verify(signParams, embedded.cryptoKey, signature, signedBytes))) {
    throw new TypeError("sign: input.embedKey must be the public key of input.key.");
  }
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

/**
 * Signs with Web Crypto, or with an external signer, whose signature is verified with the public key first,
 * since a signer holding another key, or a DER conversion gone wrong, would otherwise give tokens no one can
 * verify.
 */
export async function signatureOf(
  entry: KeyEntry,
  signParams: AlgorithmParams["signParams"],
  signedBytes: Uint8Array<ArrayBuffer>,
  caller = "sign",
): Promise<ArrayBuffer | Uint8Array<ArrayBuffer>> {
  if (entry.externalSign === undefined) {
    return crypto.subtle.sign(signParams, entry.cryptoKey, signedBytes);
  }
  // A copy: a signer that changes its input would otherwise sign, and pass the check on, bytes the token lacks.
  const signature = await entry.externalSign(signedBytes.slice());
  if (!(await crypto.subtle.verify(signParams, entry.cryptoKey, signature, signedBytes))) {
    throw new TypeError(`${caller}: the external signer's signature does not verify with its public key.`);
  }
  return signature;
}

/** Checks `embedKey` against the signing key and reads the public members it embeds. */
async function embeddedJwk(
  embedKey: unknown,
  key: SigningKey,
): Promise<{ readonly jwk: Record<string, string>; readonly cryptoKey: CryptoKey }> {
  if (!isRegisteredKey(embedKey) || embedKey.kind !== "public") {
    throw new TypeError("sign: input.embedKey must be a public key this package created.");
  }
  if (key.kind !== "private") {
    throw new TypeError("sign: input.embedKey needs a private input.key.");
  }
  if (embedKey.alg !== key.alg) {
    throw new TypeError("sign: input.embedKey must have the same alg as input.key.");
  }
  const exported = await exportPublicJwk(embedKey);
  const jwk: Record<string, string> = {};
  for (const name of EMBEDDED_MEMBERS) {
    const value = exported[name];
    if (value !== undefined) {
      jwk[name] = value;
    }
  }
  return { jwk, cryptoKey: getKeyEntry(embedKey).cryptoKey };
}

/** Where a signing header comes from, for the messages {@link readSignHeader} throws. */
export interface SignHeaderContext {
  /** The function name messages start with, such as `sign`. */
  readonly caller: string;
  /** The header's place in the input, such as `input.header`. */
  readonly label: string;
  /** Members the caller may not set. */
  readonly forbidden: readonly string[];
  /** Whether a key's `kid` is written when the header sets none. */
  readonly defaultKid: boolean;
}

/**
 * Validates the caller's protected header and lists its members in the order they are written: `alg` from
 * the key, `kid`, `typ` and `cty` first (`leading`), then every other member in the order given (`rest`).
 *
 * @throws TypeError when the header is not a plain object of JSON values, names another `alg` than the
 * key's, holds a forbidden member, or holds a `kid`, `typ` or `cty` that is not a string.
 */
export function readSignHeader(
  header: unknown,
  key: SigningKey,
  context: SignHeaderContext,
): {
  readonly given: Record<string, unknown>;
  readonly leading: [string, unknown][];
  readonly rest: [string, unknown][];
} {
  const { caller, label } = context;
  if (header !== undefined && !isPlainObject(header)) {
    throw new TypeError(`${caller}: ${label} must be a plain object.`);
  }
  const given = snapshotJsonObject(header ?? {}, label, caller);
  if (Object.hasOwn(given, "alg") && given.alg !== key.alg) {
    throw new TypeError(`${caller}: ${label}.alg must equal the key's alg.`);
  }
  const forbidden = context.forbidden.find((name) => Object.hasOwn(given, name));
  if (forbidden !== undefined) {
    throw new TypeError(`${caller}: ${label}.${forbidden} is not supported.`);
  }
  const notText = TEXT_HEADER_MEMBERS.find((name) => Object.hasOwn(given, name) && typeof given[name] !== "string");
  if (notText !== undefined) {
    throw new TypeError(`${caller}: ${label}.${notText} must be a string.`);
  }
  const kid = Object.hasOwn(given, "kid") ? given.kid : context.defaultKid ? key.kid : undefined;
  const leading: [string, unknown][] = [["alg", key.alg]];
  if (kid !== undefined) {
    leading.push(["kid", kid]);
  }
  for (const name of ["typ", "cty"] as const) {
    if (Object.hasOwn(given, name)) {
      leading.push([name, given[name]]);
    }
  }
  const leadingNames: readonly string[] = ["alg", ...TEXT_HEADER_MEMBERS];
  const rest = Object.keys(given)
    .filter((name) => !leadingNames.includes(name))
    .map((name): [string, unknown] => [name, given[name]]);
  return { given, leading, rest };
}

/** Writes members as a JSON object in the order listed: an object would list integer-like names before `alg`. */
export const writeMembers = (members: readonly (readonly [string, unknown])[]): string =>
  `{${members.map(([name, value]) => `${JSON.stringify(name)}:${writeJson(value)}`).join(",")}}`;

/** Validates the caller's header and writes it as JSON with `alg`, `kid`, `typ`, `cty` first. */
function serializeHeader(header: unknown, key: SigningKey, jwk: Record<string, string> | undefined): string {
  const { leading, rest } = readSignHeader(header, key, {
    caller: "sign",
    label: "input.header",
    forbidden: FORBIDDEN_HEADER_MEMBERS,
    defaultKid: true,
  });
  return writeMembers(jwk === undefined ? [...leading, ...rest] : [...leading, ["jwk", jwk], ...rest]);
}

/** Validates the payload and its registered claims, adds the claims `input` asks for, and writes it as JSON. */
function serializePayload(given: unknown, claims: AddedClaims): string {
  if (!isPlainObject(given)) {
    throw new TypeError("sign: input.payload must be a plain object.");
  }
  const payload = snapshotJsonObject(given, "input.payload");
  for (const name of NUMERIC_DATE_CLAIMS) {
    if (Object.hasOwn(payload, name) && typeof payload[name] !== "number") {
      throw new TypeError(`sign: input.payload.${name} must be a finite number of seconds.`);
    }
    if (Object.hasOwn(payload, name) && (payload[name] as number) > MAX_NUMERIC_DATE) {
      throw new TypeError(
        `sign: input.payload.${name} must be seconds since the Unix epoch, at most ${MAX_NUMERIC_DATE}; it looks like milliseconds.`,
      );
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
  for (const [claim, value] of Object.entries(claims)) {
    if (Object.hasOwn(payload, claim)) {
      throw new TypeError(
        `sign: input.${ADDED_CLAIM_OPTIONS[claim as keyof AddedClaims]} and input.payload.${claim} both set ${claim}; give one.`,
      );
    }
    payload[claim] = value;
  }
  return writeJson(payload);
}

// `Array.prototype.every` is called directly, so an array's own `every` cannot vouch for its entries.
const isAudience = (value: unknown): boolean =>
  typeof value === "string" ||
  (Array.isArray(value) && Array.prototype.every.call(value, (entry) => typeof entry === "string"));

/** Claims `sign` writes for its `issuedAt`, `notBefore`, `expiresIn` and `jti` options. */
interface AddedClaims {
  iat?: number;
  nbf?: number;
  exp?: number;
  jti?: string;
}

const ADDED_CLAIM_OPTIONS: Readonly<Record<keyof AddedClaims, string>> = {
  iat: "issuedAt",
  nbf: "notBefore",
  exp: "expiresIn",
  jti: "jti",
};

/** Validates the claim options of `input` and computes the claims they add, reading the clock at most once. */
function addedClaims(input: Pick<SignInput, "issuedAt" | "notBefore" | "expiresIn" | "jti" | "now">): AddedClaims {
  const { issuedAt, notBefore, expiresIn, jti, now } = input;
  for (const [option, value] of [
    ["issuedAt", issuedAt],
    ["jti", jti],
  ] as const) {
    if (value !== undefined && typeof value !== "boolean") {
      throw new TypeError(`sign: input.${option} must be a boolean.`);
    }
  }
  if (now !== undefined && typeof now !== "function") {
    throw new TypeError("sign: input.now must be a function.");
  }
  const relative = [
    ["nbf", "notBefore", notBefore],
    ["exp", "expiresIn", expiresIn],
  ] as const;
  for (const [, option, value] of relative) {
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new TypeError(`sign: input.${option} must be a whole, non-negative number of seconds.`);
    }
    if (value > MAX_RELATIVE_SECONDS) {
      throw new TypeError(
        `sign: input.${option} must be seconds, at most ${MAX_RELATIVE_SECONDS}, ten years; it looks like milliseconds.`,
      );
    }
  }
  const claims: AddedClaims = {};
  if (issuedAt === true || notBefore !== undefined || expiresIn !== undefined) {
    const seconds = currentSeconds(now ?? Date.now);
    if (issuedAt === true) {
      claims.iat = seconds;
    }
    for (const [claim, , value] of relative) {
      if (value !== undefined) {
        claims[claim] = seconds + value;
      }
    }
  }
  if (jti === true) {
    claims.jti = crypto.randomUUID();
  }
  return claims;
}

/**
 * Reads the clock, caller code when `input.now` is given, as whole seconds since the Unix epoch: RFC 7519
 * allows fractions, but many verifiers read numeric dates as integers.
 */
function currentSeconds(now: () => number): number {
  const time: unknown = now();
  if (typeof time !== "number" || !Number.isFinite(time)) {
    throw new TypeError("sign: input.now must return a finite number of milliseconds.");
  }
  const seconds = Math.floor(time / MILLISECONDS_PER_SECOND);
  // Leaves room for the largest offset, so no added claim passes the numeric date bound.
  if (seconds < 0 || seconds > MAX_NUMERIC_DATE - MAX_RELATIVE_SECONDS) {
    throw new TypeError("sign: input.now must return milliseconds since the Unix epoch, before the year 9990.");
  }
  return seconds;
}

/**
 * Copies a plain object of JSON values, nested at most {@link MAX_JSON_DEPTH} deep, into prototype-less objects
 * and plain arrays, throwing unless every value is one `JSON.stringify` writes exactly and the strict parser
 * reads back the same. A cycle exceeds the depth, so it is caught too. Each member is read once, through its
 * descriptor, and the token is written from the copy, so a `Proxy` or a value changed meanwhile cannot show the
 * checks one value and the token another.
 */
export function snapshotJsonObject(object: unknown, label: string, caller = "sign"): Record<string, unknown> {
  return snapshot(object, label, 1, caller) as Record<string, unknown>;
}

function snapshot(container: unknown, label: string, depth: number, caller: string): unknown {
  const isArray = Array.isArray(container);
  // An Array subclass or a swapped prototype can carry a `toJSON` of its own.
  if (isArray ? !isPlainArray(container) : !isPlainObject(container)) {
    throw new TypeError(`${caller}: ${label} must hold only plain objects and arrays.`);
  }
  // `JSON.stringify` runs a `toJSON` found anywhere on the chain, own or inherited from a polluted
  // `Object.prototype` or `Array.prototype`; a caller who has one expects the token to say what it returns.
  if ("toJSON" in (container as object)) {
    throw new TypeError(`${caller}: ${label} must not hold toJSON methods.`);
  }
  const copyOf = (descriptor: PropertyDescriptor): unknown => {
    if (!("value" in descriptor)) {
      throw new TypeError(`${caller}: ${label} must not hold accessor properties.`);
    }
    const child: unknown = descriptor.value;
    if (typeof child !== "object" || child === null) {
      assertJsonPrimitive(child, label, caller);
      return child;
    }
    if (depth + 1 > MAX_JSON_DEPTH) {
      throw new TypeError(`${caller}: ${label} must not nest deeper than ${MAX_JSON_DEPTH} levels.`);
    }
    return snapshot(child, label, depth + 1, caller);
  };
  if (isArray) {
    const { length } = container as readonly unknown[];
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(container, String(index));
      if (descriptor === undefined) {
        throw new TypeError(`${caller}: ${label} must not hold array holes.`);
      }
      copy.push(copyOf(descriptor));
    }
    return copy;
  }
  const copy = Object.create(null) as Record<string, unknown>;
  // `Reflect.ownKeys` lists names in the order `Object.keys` does, without reading each descriptor a second time.
  for (const name of Reflect.ownKeys(container as object)) {
    if (typeof name === "symbol") {
      throw new TypeError(`${caller}: ${label} must not have symbol keys.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(container, name);
    if (descriptor?.enumerable === true) {
      copy[name] = copyOf(descriptor);
    }
  }
  return copy;
}

/**
 * Writes a {@link snapshot} copy, or a value this module built, as `JSON.stringify` would, without looking up
 * `toJSON` anywhere: only primitives reach `JSON.stringify`.
 */
export function writeJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(writeJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .map((name) => `${JSON.stringify(name)}:${writeJson(object[name])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertJsonPrimitive(value: unknown, label: string, caller: string): void {
  if (typeof value === "string" || typeof value === "boolean" || value === null) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${caller}: ${label} must not hold a non-finite number.`);
    }
    if (Object.is(value, -0)) {
      // `JSON.stringify` writes -0 as 0, so the token would not carry the value that was given.
      throw new TypeError(`${caller}: ${label} must not hold negative zero.`);
    }
    return;
  }
  throw new TypeError(`${caller}: ${label} must hold only JSON values, not ${typeof value}.`);
}
