import { DEFAULT_MAX_TOKEN_LENGTH, MAX_TOKEN_LENGTH_LIMIT, REGISTERED_HEADER_NAMES } from "../core/limits";
import { rejectUnknownOptions } from "../core/options";
import { isPlainArray } from "../core/plain";
import { fail, frozenOk } from "../core/result";
import type {
  JwsHeader,
  JwsVerifier,
  JwsVerifierOptions,
  JwsVerifyOptions,
  JwtIssue,
  JwtResult,
  KeySet,
  VerificationKey,
  VerifiedJws,
} from "../core/types";
import { decodeBase64Url, encodeBase64Url } from "../encoding/base64url";
import { copyBytes, isUint8Array } from "../encoding/bytes";
import { encodeUtf8 } from "../encoding/text";
import { algIssue, ownMember } from "../jws/compact";
import { parseJws, type JwsSignature, type ParsedJws } from "../jws/parse-jws";
import { ALGORITHM_PARAMS } from "../keys/algorithms";
import { getKeyEntry } from "../keys/registry";
import { reporterOf, selectKey, type Reporter } from "./create-verifier";

const KNOWN_OPTIONS: Readonly<Record<keyof JwsVerifierOptions, true>> = {
  keys: true,
  crit: true,
  maxLength: true,
  onKeySetError: true,
};

const KNOWN_VERIFY_OPTIONS: Readonly<Record<keyof JwsVerifyOptions, true>> = { payload: true };

const CALLER = "createJwsVerifier";
const VERIFIER = "JWS verifier";

const PAYLOAD_MALFORMED = fail({ code: "malformed", path: ["payload"] });
const PAYLOAD_MISSING = fail({ code: "missing_payload", path: ["payload"] });

/**
 * Creates a verifier for a JWS (RFC 7515) of any payload, in the compact, flattened JSON or general JSON
 * serialization, including unencoded payloads (RFC 7797) and detached ones (RFC 7515 Appendix F).
 *
 * @remarks
 * Each JWS goes through, in order: the length cap, before any decoding; strict parsing of its structure and
 * of every signature's headers, where any issue fails the whole JWS; then each signature in turn, until one
 * verifies: its `alg`, its `crit` names, key selection from `options.keys` with both its headers, the
 * selected key's algorithm, which must equal `alg`, and the signature. The payload is decoded only once a
 * signature verifies, and nothing in it is checked: a JWS has no claims, so a key set's issuer binding does
 * not apply. Verify a JWT with {@link createVerifier} instead.
 *
 * Protected and unprotected headers must share no member, and `alg`, `crit` and `b64` must be protected.
 * A `b64` header must be listed in `crit`, and every signature of a general JWS must agree on it.
 *
 * @example
 * ```ts
 * const verify = createJwsVerifier({ keys: createKeySet([publicKey]) });
 * const result = await verify(jws, { payload: detachedBytes });
 * if (result.ok) {
 *   use(result.value.payload);
 * }
 * ```
 *
 * @param options - Where keys come from and which extensions are understood; see {@link JwsVerifierOptions}.
 * @returns A {@link JwsVerifier}. It resolves to the frozen {@link VerifiedJws}, or to a failure, and never
 * throws for any JWS. A key set that fails is handled as {@link createVerifier}'s is.
 * @throws TypeError when `options` is not an object; holds a member that is not an option; `keys` is not an
 * object with a `select` function; `crit` is not an array of distinct non-empty names, none of them `b64` or
 * defined by RFC 7515 or RFC 7518; `maxLength` is not an integer from 1 through 65536; or `onKeySetError` is
 * not a function.
 */
export function createJwsVerifier(options: JwsVerifierOptions): JwsVerifier {
  if (typeof options !== "object" || options === null) {
    throwInvalid("options must be an object.");
  }
  rejectUnknownOptions(options, KNOWN_OPTIONS, CALLER);
  const { keys, crit, maxLength, onKeySetError } = options;
  if (typeof keys !== "object" || keys === null || typeof keys.select !== "function") {
    throwInvalid("options.keys must be a key set (an object with a select function).");
  }
  const understood = readCritOption(crit);
  if (
    maxLength !== undefined &&
    !(Number.isInteger(maxLength) && maxLength >= 1 && maxLength <= MAX_TOKEN_LENGTH_LIMIT)
  ) {
    throwInvalid(`options.maxLength must be an integer from 1 through ${MAX_TOKEN_LENGTH_LIMIT}.`);
  }
  if (onKeySetError !== undefined && typeof onKeySetError !== "function") {
    throwInvalid("options.onKeySetError must be a function.");
  }
  const limit = maxLength ?? DEFAULT_MAX_TOKEN_LENGTH;
  const report = reporterOf(onKeySetError);
  return async (input, verifyOptions) => {
    const detached = readVerifyOptions(verifyOptions);
    const parsed = parseJws(input, limit);
    if (!parsed.ok) {
      return parsed;
    }
    const jws = parsed.value;
    const signed = signedPayload(jws, detached);
    if (!signed.ok) {
      return signed;
    }
    const issues: JwtIssue[] = [];
    for (const [index, signature] of jws.signatures.entries()) {
      // One at a time: the first signature that verifies wins, and later ones need no key.
      // oxlint-disable-next-line no-await-in-loop
      const checked = await checkSignature(signature, signed.value, keys, understood, report);
      if (checked.ok) {
        const verified: VerifiedJws = Object.freeze({
          payload: payloadBytes(jws, detached),
          header: signature.protectedHeader as JwsHeader,
          ...(signature.unprotectedHeader === undefined ? {} : { unprotectedHeader: signature.unprotectedHeader }),
          key: checked.value,
          signatureIndex: index,
        });
        return frozenOk(verified);
      }
      for (const issue of checked.error.issues) {
        issues.push(jws.general ? { ...issue, path: ["signatures", index, ...(issue.path ?? [])] } : issue);
      }
    }
    return fail(...(issues as [JwtIssue, ...JwtIssue[]]));
  };
}

function throwInvalid(message: string): never {
  throw new TypeError(`${CALLER}: ${message}`);
}

/** Validates `options.crit` into a frozen copy: the extension names the caller's code understands. */
function readCritOption(crit: unknown): readonly string[] {
  if (crit === undefined) {
    return Object.freeze([]);
  }
  const names = isPlainArray(crit) ? Array.from({ length: crit.length }, (_, index): unknown => crit[index]) : [];
  const valid =
    isPlainArray(crit) &&
    names.every(
      (name, index) =>
        typeof name === "string" &&
        name.length > 0 &&
        name !== "b64" &&
        !REGISTERED_HEADER_NAMES.includes(name) &&
        names.indexOf(name) === index,
    );
  if (!valid) {
    throwInvalid(
      "options.crit must list distinct extension parameter names, none defined by RFC 7515 or RFC 7518 and not b64.",
    );
  }
  return Object.freeze(names as string[]);
}

/**
 * Validates one call's options, returning the detached payload, if any: bytes copied, or a string, which may
 * still be malformed.
 *
 * @throws TypeError for options that are not an object, an unknown member, or a payload of another type.
 */
function readVerifyOptions(options: unknown): Uint8Array<ArrayBuffer> | string | undefined {
  if (options === undefined) {
    return undefined;
  }
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${VERIFIER}: options must be an object.`);
  }
  rejectUnknownOptions(options, KNOWN_VERIFY_OPTIONS, VERIFIER);
  const payload = ownMember(options, "payload");
  if (payload === undefined || typeof payload === "string") {
    return payload;
  }
  // The same check `signJws` makes: `copyBytes` alone would also take an ArrayBuffer or another view.
  const bytes = isUint8Array(payload) ? copyBytes(payload) : undefined;
  if (bytes === undefined) {
    throw new TypeError(`${VERIFIER}: options.payload must be a string or a Uint8Array.`);
  }
  return bytes;
}

/**
 * The payload part of the signing input, after the protected header and its `.`: base64url text, or the
 * unencoded payload's bytes, from the JWS or from the detached payload given.
 */
function signedPayload(jws: ParsedJws, detached: Uint8Array<ArrayBuffer> | string | undefined): JwtResult<Uint8Array> {
  if (detached !== undefined) {
    if (jws.payload !== undefined && jws.payload.length > 0) {
      return PAYLOAD_MALFORMED;
    }
    if (typeof detached === "string" && !detached.isWellFormed()) {
      return PAYLOAD_MALFORMED;
    }
    const bytes = typeof detached === "string" ? encodeUtf8(detached) : detached;
    return frozenOk(jws.b64 ? encodeUtf8(encodeBase64Url(bytes)) : bytes);
  }
  if (jws.payload === undefined) {
    return PAYLOAD_MISSING;
  }
  return frozenOk(encodeUtf8(jws.payload));
}

/** The verified payload's bytes, a new array for each call. */
function payloadBytes(jws: ParsedJws, detached: Uint8Array<ArrayBuffer> | string | undefined): Uint8Array<ArrayBuffer> {
  if (detached !== undefined) {
    return typeof detached === "string" ? encodeUtf8(detached) : new Uint8Array(detached);
  }
  const carried = jws.payload as string;
  return jws.b64 ? (decodeBase64Url(carried) as Uint8Array<ArrayBuffer>) : encodeUtf8(carried);
}

/** Checks one signature: its algorithm and `crit` names, then its key and the signature itself. */
async function checkSignature(
  signature: JwsSignature,
  signedPayloadBytes: Uint8Array,
  keys: KeySet,
  understood: readonly string[],
  report: Reporter,
): Promise<JwtResult<VerificationKey>> {
  const { protectedHeader, header } = signature;
  const unsupported = algIssue(protectedHeader);
  if (unsupported !== undefined) {
    return fail(unsupported);
  }
  const crit = ownMember(protectedHeader, "crit") as readonly string[] | undefined;
  if (crit?.some((name) => name !== "b64" && !understood.includes(name)) === true) {
    return fail({ code: "unsupported_crit", path: ["header", "crit"] });
  }
  const selected = await selectKey(keys, header, report);
  if (!selected.ok) {
    return selected;
  }
  const key = selected.value;
  if (key.alg !== header.alg) {
    return fail({ code: "alg_mismatch", path: ["header", "alg"] });
  }
  const { cryptoKey, signatureLength } = getKeyEntry(key);
  if (signature.signature.length !== signatureLength) {
    return fail({ code: "bad_signature" });
  }
  const prefix = encodeUtf8(`${signature.protectedSegment}.`);
  const signingInput = new Uint8Array(prefix.length + signedPayloadBytes.length);
  signingInput.set(prefix);
  signingInput.set(signedPayloadBytes, prefix.length);
  const params = ALGORITHM_PARAMS[key.alg].signParams;
  if (!(await crypto.subtle.verify(params, cryptoKey, signature.signature, signingInput))) {
    return fail({ code: "bad_signature" });
  }
  return selected;
}
