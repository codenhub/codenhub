import { MAX_JWS_SIGNATURES, REGISTERED_HEADER_NAMES } from "../core/limits";
import { rejectUnknownOptions } from "../core/options";
import { isPlainArray, isPlainObject } from "../core/plain";
import type { JwsAlgorithm, SigningKey } from "../core/types";
import { encodeBase64Url } from "../encoding/base64url";
import { copyBytes, isUint8Array } from "../encoding/bytes";
import { decodeUtf8, encodeUtf8 } from "../encoding/text";
import { ALGORITHM_PARAMS } from "../keys/algorithms";
import { getKeyEntry } from "../keys/registry";
import { readSignHeader, signatureOf, snapshotJsonObject, writeJson, writeMembers } from "./sign";

/** Protected header parameters a caller may set when signing a JWS. `alg` always comes from the key. */
export interface JwsSignHeader {
  /**
   * The key's algorithm. It may be repeated here, but never changed.
   *
   * @defaultValue the signing key's `alg`
   */
  readonly alg?: JwsAlgorithm;
  /**
   * Key identifier the verifier selects its key by.
   *
   * @defaultValue the signing key's `kid`, unless the unprotected header has a `kid`
   */
  readonly kid?: string;
  /** Media type of the whole JWS. */
  readonly typ?: string;
  /** Media type of the payload. */
  readonly cty?: string;
  /**
   * Extension parameters of this header a verifier must understand (RFC 7515 §4.1.11): distinct names, each a
   * member of this header, none defined by RFC 7515 or RFC 7518. `b64` is added for `b64: false`.
   */
  readonly crit?: readonly string[];
  /** Refused: set the `b64` option, which also lists it in `crit`. */
  readonly b64?: never;
  /** Refused: a verifier that trusts it lets the JWS choose its own key. */
  readonly jwk?: never;
  /** Refused: a verifier that trusts it lets the JWS choose its own key. */
  readonly jku?: never;
  /** Refused: a verifier that trusts it lets the JWS choose its own key. */
  readonly x5u?: never;
  /** Refused: a verifier that trusts it lets the JWS choose its own key. */
  readonly x5c?: never;
  /** Any other JSON header parameter. */
  readonly [parameter: string]: unknown;
}

/** One signature of a JWS: its key and headers. */
export interface JwsSigner {
  /** A private or secret key this package created. It fixes the signature's `alg`. */
  readonly key: SigningKey;
  /** Extra protected header parameters. */
  readonly header?: JwsSignHeader;
  /**
   * Header parameters the signature does not cover, written as the JSON serialization's `header`. They must
   * not repeat a protected member, and may not be `alg`, `crit`, `b64`, `jwk`, `jku`, `x5u` or `x5c`.
   *
   * @defaultValue none
   */
  readonly unprotectedHeader?: Readonly<Record<string, unknown>>;
}

/** How the payload of a JWS is signed and carried. */
interface JwsPayloadInput {
  /** The payload: bytes, or text signed as its UTF-8 bytes. */
  readonly payload: Uint8Array | string;
  /**
   * `false` signs the payload as is, without base64url (RFC 7797), and writes `"b64": false` and `"crit":
   * ["b64"]` into each protected header. An attached unencoded payload must be printable ASCII other than `.`
   * in the compact serialization, and UTF-8 text in the JSON serialization.
   *
   * @defaultValue true
   */
  readonly b64?: boolean;
  /**
   * Leaves the payload out of the JWS (RFC 7515 Appendix F): the compact payload segment is empty and the JSON
   * serialization has no `payload`. The verifier is given the payload separately.
   *
   * @defaultValue false
   */
  readonly detached?: boolean;
}

/** What {@link signJws} turns into a JWS with one signature. */
export interface SignJwsInput extends JwsPayloadInput, JwsSigner {
  /**
   * `compact`, `<protected>.<payload>.<signature>`, or `flattened`, the flattened JWS JSON serialization
   * (RFC 7515 §7.2.2), which can also carry an unprotected header.
   *
   * @defaultValue "compact"
   */
  readonly serialization?: "compact" | "flattened";
}

/** What {@link signGeneralJws} turns into a JWS with several signatures. */
export interface SignGeneralJwsInput extends JwsPayloadInput {
  /** One to 8 signers, written in this order. */
  readonly signers: readonly JwsSigner[];
}

const SIGN_JWS_MEMBERS: Readonly<Record<keyof SignJwsInput, true>> = {
  payload: true,
  key: true,
  header: true,
  unprotectedHeader: true,
  b64: true,
  detached: true,
  serialization: true,
};

const GENERAL_MEMBERS: Readonly<Record<keyof SignGeneralJwsInput, true>> = {
  payload: true,
  signers: true,
  b64: true,
  detached: true,
};

const SIGNER_MEMBERS: Readonly<Record<keyof JwsSigner, true>> = { key: true, header: true, unprotectedHeader: true };

/** Protected members the caller may not set: `b64` comes from its option, the others let a JWS pick its key. */
const FORBIDDEN_PROTECTED = ["b64", "jwk", "jku", "x5u", "x5c"] as const;

/** Unprotected members refused: RFC 7515 and RFC 7797 require these protected, or they pick the key. */
const FORBIDDEN_UNPROTECTED = ["alg", "crit", "b64", "jwk", "jku", "x5u", "x5c"] as const;

const TEXT_MEMBERS = ["kid", "typ", "cty"] as const;

/** A period, and every character outside printable ASCII: what RFC 7797 §5.2 keeps out of a compact payload. */
const NOT_COMPACT_SAFE = /[^\x20-\x2d\x2f-\x7e]/;

/** The pieces of one signature, base64url and JSON as written. */
interface SignedEntry {
  readonly protected: string;
  readonly header: string | undefined;
  readonly signature: string;
}

/** The payload as read from the input, and what the signatures cover. */
interface PreparedPayload {
  readonly b64: boolean;
  readonly detached: boolean;
  /** The bytes after the protected header and `.` in the signing input. */
  readonly signed: Uint8Array<ArrayBuffer>;
  /** The payload as written into the JWS: base64url, or the unencoded text. */
  readonly carried: string;
}

/**
 * Signs bytes or text into a JWS (RFC 7515) with one key's own algorithm, in the compact or flattened JSON
 * serialization, with an unencoded (RFC 7797) or detached payload when asked.
 *
 * @remarks
 * Unlike {@link sign}, the payload is not a set of JWT claims: it is signed as given, and a verifier made with
 * {@link createJwsVerifier} returns its bytes. The protected header is written as `alg`, then `kid`, `typ` and
 * `cty` when present, then `b64` and `crit`, then the other parameters in the order given.
 *
 * @example
 * ```ts
 * const jws = await signJws({ payload: body, key: privateKey, b64: false, detached: true });
 * ```
 *
 * @param input - The payload, the key, the headers, and how the payload is carried.
 * @returns The JWS: the compact string, or the flattened serialization as JSON text.
 * @throws TypeError, as a rejected promise, when `input` is not an object or has a member other than those
 * {@link SignJwsInput} lists; `input.payload` is neither a string without lone surrogates nor a `Uint8Array`;
 * an attached unencoded payload holds characters its serialization cannot carry; `b64` or `detached` is not
 * a boolean; `serialization` is neither `"compact"` nor `"flattened"`; `input.key` is not a private or secret
 * key this package created; a header is not a plain object of JSON values, or breaks a rule
 * {@link JwsSignHeader} or {@link JwsSigner.unprotectedHeader} states; or `unprotectedHeader` is given for the
 * compact serialization.
 */
export async function signJws(input: SignJwsInput): Promise<string> {
  const caller = "signJws";
  if (typeof input !== "object" || input === null) {
    throw new TypeError(`${caller}: input must be an object.`);
  }
  rejectUnknownOptions(input, SIGN_JWS_MEMBERS, caller, "input");
  const serialization = input.serialization ?? "compact";
  if (serialization !== "compact" && serialization !== "flattened") {
    throw new TypeError(`${caller}: input.serialization must be "compact" or "flattened".`);
  }
  if (serialization === "compact" && input.unprotectedHeader !== undefined) {
    throw new TypeError(`${caller}: input.unprotectedHeader needs the flattened serialization.`);
  }
  const payload = preparePayload(input, serialization, caller);
  const entry = await signEntry(input, payload, caller, "input");
  if (serialization === "compact") {
    return `${entry.protected}.${payload.detached ? "" : payload.carried}.${entry.signature}`;
  }
  return jsonObject([...payloadMember(payload), ...entryMembers(entry)]);
}

/**
 * Signs bytes or text into a JWS in the general JSON serialization (RFC 7515 §7.2.1), with one signature per
 * signer, each by its key's own algorithm.
 *
 * @remarks
 * Every signature covers the same payload, carried once, so `b64` and `detached` apply to all of them; each
 * signer's protected header is written as {@link signJws} writes it. A verifier made with
 * {@link createJwsVerifier} accepts the JWS when one signature verifies with a key it trusts.
 *
 * @example
 * ```ts
 * const jws = await signGeneralJws({
 *   payload: document,
 *   signers: [{ key: rsaKey, unprotectedHeader: { kid: "2010-12-29" } }, { key: ecKey }],
 * });
 * ```
 *
 * @param input - The payload, how it is carried, and the signers.
 * @returns The general JWS JSON serialization, as JSON text.
 * @throws TypeError, as a rejected promise, for an invalid `input` as {@link signJws} lists it, and when
 * `input.signers` is not an array of 1 to 8 plain objects, or a signer has a member other than `key`, `header`
 * and `unprotectedHeader`.
 */
export async function signGeneralJws(input: SignGeneralJwsInput): Promise<string> {
  const caller = "signGeneralJws";
  if (typeof input !== "object" || input === null) {
    throw new TypeError(`${caller}: input must be an object.`);
  }
  rejectUnknownOptions(input, GENERAL_MEMBERS, caller, "input");
  const { signers } = input;
  if (!isPlainArray(signers) || signers.length < 1 || signers.length > MAX_JWS_SIGNATURES) {
    throw new TypeError(`${caller}: input.signers must list 1 to ${MAX_JWS_SIGNATURES} signers.`);
  }
  // Copied first, so a signer list changed while signing cannot change what is written.
  const list = Array.from({ length: signers.length }, (_, index): unknown => signers[index]);
  const payload = preparePayload(input, "general", caller);
  for (const [index, signer] of list.entries()) {
    if (!isPlainObject(signer)) {
      throw new TypeError(`${caller}: input.signers[${index}] must be an object.`);
    }
    rejectUnknownOptions(signer, SIGNER_MEMBERS, caller, `input.signers[${index}]`);
  }
  // Each call checks its signer's headers before its first await, so the first bad signer in order throws.
  const entries = await Promise.all(
    list.map((signer, index) => signEntry(signer as JwsSigner, payload, caller, `input.signers[${index}]`)),
  );
  const signatures = `[${entries.map((entry) => jsonObject(entryMembers(entry))).join(",")}]`;
  return jsonObject([...payloadMember(payload), ["signatures", signatures]]);
}

/** Writes a JSON object from member names and their values, already written as JSON text, in the order listed. */
const jsonObject = (members: readonly (readonly [string, string])[]): string =>
  `{${members.map(([name, json]) => `${JSON.stringify(name)}:${json}`).join(",")}}`;

/** The `payload` member of a JSON serialization, absent when detached. */
const payloadMember = (payload: PreparedPayload): [string, string][] =>
  payload.detached ? [] : [["payload", JSON.stringify(payload.carried)]];

/** The `protected`, `header` and `signature` members of one signature, in RFC 7515 order. */
const entryMembers = (entry: SignedEntry): [string, string][] => [
  ["protected", JSON.stringify(entry.protected)],
  ...(entry.header === undefined ? [] : ([["header", entry.header]] as [string, string][])),
  ["signature", JSON.stringify(entry.signature)],
];

/** Reads the payload and its options, and checks that the serialization can carry it. */
function preparePayload(
  input: JwsPayloadInput,
  serialization: "compact" | "flattened" | "general",
  caller: string,
): PreparedPayload {
  for (const name of ["b64", "detached"] as const) {
    if (input[name] !== undefined && typeof input[name] !== "boolean") {
      throw new TypeError(`${caller}: input.${name} must be a boolean.`);
    }
  }
  const b64 = input.b64 ?? true;
  const detached = input.detached ?? false;
  const bytes = payloadBytes(input.payload, caller);
  if (b64) {
    const carried = encodeBase64Url(bytes);
    return { b64, detached, signed: encodeUtf8(carried), carried };
  }
  let carried = "";
  if (!detached) {
    const text = decodeUtf8(bytes);
    if (serialization === "compact" && (text === undefined || NOT_COMPACT_SAFE.test(text))) {
      throw new TypeError(
        `${caller}: input.payload must hold only printable ASCII other than '.' for an unencoded compact JWS; detach it or use the JSON serialization.`,
      );
    }
    if (text === undefined) {
      throw new TypeError(`${caller}: input.payload must be UTF-8 text for an unencoded JSON JWS; detach it instead.`);
    }
    carried = text;
  }
  return { b64, detached, signed: bytes, carried };
}

/** A copy of the payload's bytes: a string's UTF-8, or a `Uint8Array`'s view, read once. */
function payloadBytes(payload: unknown, caller: string): Uint8Array<ArrayBuffer> {
  if (typeof payload === "string") {
    if (!payload.isWellFormed()) {
      throw new TypeError(`${caller}: input.payload must not hold lone surrogates.`);
    }
    return encodeUtf8(payload);
  }
  const bytes = isUint8Array(payload) ? copyBytes(payload) : undefined;
  if (bytes === undefined) {
    throw new TypeError(`${caller}: input.payload must be a string or a Uint8Array.`);
  }
  return bytes;
}

/** Validates one signer's headers and signs the payload under them. */
async function signEntry(
  signer: JwsSigner,
  payload: PreparedPayload,
  caller: string,
  label: string,
): Promise<SignedEntry> {
  const { key } = signer;
  const entry = getKeyEntry(key);
  if (key.kind !== "private" && key.kind !== "secret") {
    throw new TypeError(`${caller}: ${label}.key must be a private or secret key.`);
  }
  const unprotected = readUnprotectedHeader(signer.unprotectedHeader, caller, `${label}.unprotectedHeader`);
  const headerLabel = `${label}.header`;
  const { given, leading, rest } = readSignHeader(signer.header, key, {
    caller,
    label: headerLabel,
    forbidden: FORBIDDEN_PROTECTED,
    defaultKid: unprotected === undefined || !Object.hasOwn(unprotected, "kid"),
  });
  const crit = readCrit(given, caller, headerLabel);
  const critMembers: [string, unknown][] = [];
  if (!payload.b64) {
    critMembers.push(["b64", false]);
  }
  const critNames = payload.b64 ? crit : ["b64", ...(crit ?? [])];
  if (critNames !== undefined) {
    critMembers.push(["crit", critNames]);
  }
  const members = [...leading, ...critMembers, ...rest.filter(([name]) => name !== "crit")];
  if (unprotected !== undefined) {
    // The message names no member: a header built from data could carry one in its name.
    if (members.some(([name]) => Object.hasOwn(unprotected, name))) {
      throw new TypeError(`${caller}: ${label}.unprotectedHeader shares a member with ${label}.header.`);
    }
  }
  const protectedSegment = encodeBase64Url(encodeUtf8(writeMembers(members)));
  const prefix = encodeUtf8(`${protectedSegment}.`);
  const signed = new Uint8Array(prefix.length + payload.signed.length);
  signed.set(prefix);
  signed.set(payload.signed, prefix.length);
  const signature = await signatureOf(entry, ALGORITHM_PARAMS[key.alg].signParams, signed, caller);
  return {
    protected: protectedSegment,
    header: unprotected === undefined || Object.keys(unprotected).length === 0 ? undefined : writeJson(unprotected),
    signature: encodeBase64Url(new Uint8Array(signature)),
  };
}

/** Validates a caller's `crit`: distinct extension names, each a member of the protected header. */
function readCrit(given: Record<string, unknown>, caller: string, label: string): readonly string[] | undefined {
  if (!Object.hasOwn(given, "crit")) {
    return undefined;
  }
  const crit = given.crit;
  const valid =
    Array.isArray(crit) &&
    crit.length > 0 &&
    crit.every(
      (name, index) =>
        typeof name === "string" &&
        name.length > 0 &&
        name !== "b64" &&
        !REGISTERED_HEADER_NAMES.includes(name) &&
        crit.indexOf(name) === index &&
        Object.hasOwn(given, name),
    );
  if (!valid) {
    throw new TypeError(
      `${caller}: ${label}.crit must list distinct extension parameters of the header, none defined by RFC 7515 or RFC 7518 and not b64.`,
    );
  }
  return crit as string[];
}

/** Validates an unprotected header into a copy, or undefined when none is given. */
function readUnprotectedHeader(header: unknown, caller: string, label: string): Record<string, unknown> | undefined {
  if (header === undefined) {
    return undefined;
  }
  if (!isPlainObject(header)) {
    throw new TypeError(`${caller}: ${label} must be a plain object.`);
  }
  const copy = snapshotJsonObject(header, label, caller);
  const forbidden = FORBIDDEN_UNPROTECTED.find((name) => Object.hasOwn(copy, name));
  if (forbidden !== undefined) {
    throw new TypeError(`${caller}: ${label}.${forbidden} is not supported.`);
  }
  const notText = TEXT_MEMBERS.find((name) => Object.hasOwn(copy, name) && typeof copy[name] !== "string");
  if (notText !== undefined) {
    throw new TypeError(`${caller}: ${label}.${notText} must be a string.`);
  }
  return copy;
}
