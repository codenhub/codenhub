import { quietly } from "../core/hooks";
import { DEFAULT_MAX_TOKEN_LENGTH, MAX_TOKEN_LENGTH_LIMIT } from "../core/limits";
import { rejectUnknownOptions } from "../core/options";
import { isPlainObject } from "../core/plain";
import { fail, frozenOk } from "../core/result";
import type {
  AsymmetricAlgorithm,
  JwtHeader,
  JwtIssue,
  JwtPayload,
  JwtRegisteredClaims,
  JwtResult,
  PublicKey,
} from "../core/types";
import { parseCompact, parsePayload } from "../jws/compact";
import { ALGORITHM_PARAMS, ASYMMETRIC_ALGORITHMS, isAsymmetricAlgorithm, ownDataValue } from "../keys/algorithms";
import { importPublicJwk } from "../keys/import";
import { getKeyEntry } from "../keys/registry";
import { cryptoKeyThumbprint } from "../keys/thumbprint";
import { checkClaims, type ClaimCheckOptions } from "../verify/claims";
import { denseCopy, isIntegerInRange, MAX_CLOCK_TOLERANCE } from "../verify/options";
import {
  accessTokenHash,
  comparableHtu,
  DPOP_TYPE,
  isMethodToken,
  isNonEmptyString,
  normalizeHtu,
  urlText,
} from "./shared";

/** What a DPoP verifier's `nonce` function and `acceptJti` are told about the proof besides the value. */
export interface DpopProofContext {
  /** The RFC 7638 thumbprint of the proof's key. */
  readonly thumbprint: string;
  /**
   * The last second the proof is accepted, in seconds since the Unix epoch: its `iat` plus `maxAge` plus
   * `clockTolerance`. A replay store must keep the `jti` until then.
   */
  readonly keepUntil: number;
}

/** How {@link createDpopVerifier} checks proofs. */
export interface DpopVerifierOptions {
  /**
   * The algorithms a proof may be signed with, as a server's `dpop_signing_alg_values_supported` lists them.
   *
   * @defaultValue every asymmetric algorithm
   */
  readonly algorithms?: readonly AsymmetricAlgorithm[];
  /**
   * The oldest proof accepted, in seconds after its `iat`. A proof's `iat` may also be up to
   * `max(clockTolerance, 60)` seconds ahead of the clock.
   *
   * @defaultValue 60
   */
  readonly maxAge?: number;
  /**
   * Seconds of clock skew allowed, from 0 through 300.
   *
   * @defaultValue 0
   */
  readonly clockTolerance?: number;
  /**
   * The longest proof accepted, in characters, from 1 through 65536, checked before anything is decoded.
   *
   * @defaultValue 8192
   */
  readonly maxLength?: number;
  /**
   * The nonces the server accepts, when it requires one (RFC 9449 §8): one value, a list, or a function that
   * says whether a nonce is current. A proof without an accepted nonce is `wrong_nonce`.
   *
   * @defaultValue no nonce required, and a proof's `nonce` ignored
   */
  readonly nonce?:
    | string
    | readonly string[]
    | ((nonce: string, proof: DpopProofContext) => boolean | Promise<boolean>);
  /**
   * Records the proof's `jti` and says whether it was new: `true` accepts the proof, `false` makes it
   * `replayed`. Called last, only for a proof that passed every other check, so a refused proof records nothing.
   *
   * @defaultValue no replay check
   */
  readonly acceptJti?: (jti: string, proof: DpopProofContext) => boolean | Promise<boolean>;
  /**
   * The clock, in milliseconds since the Unix epoch.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
  /**
   * Receives what a `nonce` function or `acceptJti` threw or rejected with, or a `TypeError` when it returned
   * something other than a boolean; the proof then fails with `callback_failed`. Its own errors are swallowed.
   *
   * @defaultValue the error is dropped
   */
  readonly onCallbackError?: (error: unknown) => void;
}

/** The HTTP request a DPoP proof came with. */
export interface DpopRequest {
  /** The request's method, compared with `htm` exactly. */
  readonly method: string;
  /**
   * The request's URL, absolute, as a string or a `URL`. Compared with `htu` after both are normalized, without
   * their query and fragment: percent-encoded unreserved characters are decoded and other percent-encodings
   * compared in either case, and nothing else is decoded.
   */
  readonly url: string | URL;
  /**
   * The access token the request presents. The proof must then carry its hash as `ath`. Given together with
   * `accessTokenClaims` or not at all.
   *
   * @defaultValue no `ath` check, as at the token endpoint
   */
  readonly accessToken?: string;
  /**
   * The verified access token's payload, or its token introspection response: an object whose `cnf.jkt` the
   * proof's key must have as its thumbprint. Claims without a string `cnf.jkt` fail the proof with `wrong_key`.
   * Given together with `accessToken` or not at all.
   *
   * @defaultValue no key binding check
   */
  readonly accessTokenClaims?: object;
}

/** The claims of a verified DPoP proof. */
export interface DpopProofPayload extends JwtRegisteredClaims {
  /** The proof's unique identifier. */
  readonly jti: string;
  /** The request's method. */
  readonly htm: string;
  /** The request's URL, without query and fragment. */
  readonly htu: string;
  /** When the proof was created, in seconds since the Unix epoch. */
  readonly iat: number;
  /** The access token's hash, when the proof came with one. */
  readonly ath?: string;
  /** The server's nonce, when the proof carries one. */
  readonly nonce?: string;
  /** Any other claim the proof carries, unchecked. */
  readonly [claim: string]: unknown;
}

/** A verified DPoP proof. Frozen. */
export interface VerifiedDpopProof {
  /** The header, `jwk` included. */
  readonly header: JwtHeader;
  readonly payload: DpopProofPayload;
  /** The proof's public key, imported from its `jwk`. */
  readonly key: PublicKey;
  /** The key's RFC 7638 thumbprint, what an access token's `cnf.jkt` binds it to. */
  readonly thumbprint: string;
}

/**
 * Verifies one DPoP proof for one request. Resolves to a result, and never rejects for any proof.
 *
 * @throws TypeError, as a rejected promise, for a `request` that is not one, or has only one of
 * `accessToken` and `accessTokenClaims`, or a clock that returns something other than a finite number.
 */
export type DpopVerifier = (proof: unknown, request: DpopRequest) => Promise<JwtResult<VerifiedDpopProof>>;

const KNOWN_OPTIONS: Readonly<Record<keyof DpopVerifierOptions, true>> = {
  algorithms: true,
  maxAge: true,
  clockTolerance: true,
  maxLength: true,
  nonce: true,
  acceptJti: true,
  now: true,
  onCallbackError: true,
};

const REQUEST_MEMBERS: Readonly<Record<keyof DpopRequest, true>> = {
  method: true,
  url: true,
  accessToken: true,
  accessTokenClaims: true,
};

const DEFAULT_MAX_AGE = 60;
/** Claims every proof carries (RFC 9449 §4.2); `iat` is required by `maxAge`. */
const REQUIRED_CLAIMS = Object.freeze(["jti", "htm", "htu"]);

const at = (path: string, code: JwtIssue["code"]): JwtIssue => ({ code, path: ["payload", path] });
const WRONG_NONCE = at("nonce", "wrong_nonce");
const WRONG_KEY: JwtIssue = { code: "wrong_key", path: ["header", "jwk"] };

function throwInvalid(message: string): never {
  throw new TypeError(`createDpopVerifier: ${message}`);
}

type NonceCheck = readonly string[] | ((nonce: string, proof: DpopProofContext) => unknown);

interface ResolvedDpopOptions {
  readonly algorithms: readonly AsymmetricAlgorithm[];
  readonly maxLength: number;
  readonly claimChecks: ClaimCheckOptions & { readonly maxAge: number };
  readonly nonce?: NonceCheck;
  readonly acceptJti?: (jti: string, proof: DpopProofContext) => unknown;
  readonly onCallbackError?: (error: unknown) => void;
}

/**
 * Creates a verifier of DPoP proofs (RFC 9449 §4.3), for a server that receives them at its token endpoint or
 * with DPoP-bound access tokens.
 *
 * @remarks
 * Each proof goes through, in order, stopping at the first failure: the length cap; strict parsing, as a
 * token's; `typ` exactly `dpop+jwt`; an `alg` in `options.algorithms`; a `jwk` header that is a public JWK of
 * that `alg`, imported with every check {@link importPublicKey} runs; and the signature, with that key. Then the
 * claims, reporting every failure together: registered claim types, `iat` within `maxAge` and at most
 * `max(clockTolerance, 60)` seconds ahead, `exp` when present, `jti`, `htm` and `htu` present, `htm` equal
 * to `request.method`, `htu` equal to `request.url` once both are normalized and stripped of query and
 * fragment, `ath` when `request.accessToken` is given, a static `nonce`, and `cnf.jkt` when
 * `request.accessTokenClaims` is given. Last, only when all of that passed, a `nonce` function and then
 * `acceptJti`.
 *
 * The verifier trusts the key the proof carries, which is what a proof is: it shows the client holds that key.
 * Whether the key is the one an access token is bound to is the `accessTokenClaims` check.
 *
 * @example
 * ```ts
 * const verifyProof = createDpopVerifier({ algorithms: ["ES256", "EdDSA"], acceptJti: (jti, { keepUntil }) => seen.add(jti, keepUntil) });
 * const result = await verifyProof(request.headers.get("dpop"), {
 *   method: request.method,
 *   url: request.url,
 *   accessToken,
 *   accessTokenClaims: verifiedAccessToken.payload,
 * });
 * ```
 *
 * @param options - Accepted algorithms, the age window, nonce and replay checks; see {@link DpopVerifierOptions}.
 * @returns A {@link DpopVerifier}, resolving to the frozen `{ header, payload, key, thumbprint }` or a failure.
 * @throws TypeError when `options` is given and is not an object, has a member that is not an option;
 * `algorithms` is not a non-empty array of asymmetric algorithms; `maxAge` is not a positive integer;
 * `clockTolerance` is not an integer from 0 through 300; `maxLength` is not an integer from 1 through 65536;
 * `nonce` is not a non-empty string, a non-empty array of them, or a function; or `acceptJti`, `now` or
 * `onCallbackError` is not a function.
 */
export function createDpopVerifier(options: DpopVerifierOptions = {}): DpopVerifier {
  const resolved = resolveOptions(options);
  return async (proof, request) => {
    const { method, htu, accessToken, accessTokenClaims } = readRequest(request);
    const parsed = parseCompact(proof, resolved.maxLength);
    if (!parsed.ok) {
      return parsed;
    }
    const jws = parsed.value;
    const { header } = jws;
    if (!Object.hasOwn(header, "typ") || header.typ !== DPOP_TYPE) {
      return fail({ code: "wrong_type", path: ["header", "typ"] });
    }
    const alg = header.alg as AsymmetricAlgorithm;
    if (!resolved.algorithms.includes(alg)) {
      return fail({ code: "unsupported_alg", path: ["header", "alg"] });
    }
    const jwk = Object.hasOwn(header, "jwk") ? header.jwk : undefined;
    if (!isPlainObject(jwk)) {
      return fail({ code: "malformed", path: ["header", "jwk"] });
    }
    const imported = await importPublicJwk(jwk, alg);
    if (!imported.ok) {
      const [issue] = imported.error.issues;
      return fail({ ...issue, path: ["header", "jwk", ...(issue.path ?? [])] });
    }
    const key = imported.value;
    const { cryptoKey, signatureLength } = getKeyEntry(key);
    if (
      jws.signature.length !== signatureLength ||
      !(await crypto.subtle.verify(ALGORITHM_PARAMS[alg].signParams, cryptoKey, jws.signature, jws.signingInput))
    ) {
      return fail({ code: "bad_signature" });
    }
    const parsedPayload = parsePayload(jws);
    if (!parsedPayload.ok) {
      return parsedPayload;
    }
    const payload = parsedPayload.value;
    const thumbprint = await cryptoKeyThumbprint(cryptoKey, alg);
    const issues = checkClaims(header, payload, resolved.claimChecks, key);
    issues.push(...requestIssues(payload, method, htu));
    if (accessToken !== undefined) {
      issues.push(...athIssues(payload, await accessTokenHash(accessToken)));
    }
    const nonce = resolved.nonce;
    if (nonce !== undefined && (!Object.hasOwn(payload, "nonce") || typeof payload.nonce !== "string")) {
      issues.push(WRONG_NONCE);
    } else if (Array.isArray(nonce) && !nonce.includes(payload.nonce as string)) {
      issues.push(WRONG_NONCE);
    }
    if (accessTokenClaims !== undefined && boundThumbprint(accessTokenClaims) !== thumbprint) {
      issues.push(WRONG_KEY);
    }
    if (issues.length > 0) {
      return fail(...(issues as [JwtIssue, ...JwtIssue[]]));
    }
    const context: DpopProofContext = Object.freeze({
      thumbprint,
      keepUntil: (payload.iat as number) + resolved.claimChecks.maxAge + resolved.claimChecks.clockTolerance,
    });
    if (typeof nonce === "function") {
      const current = await runCallback(() => nonce(payload.nonce as string, context), "nonce", resolved);
      if (current !== true) {
        return current === false ? fail(WRONG_NONCE) : current;
      }
    }
    if (resolved.acceptJti !== undefined) {
      const { acceptJti } = resolved;
      const accepted = await runCallback(() => acceptJti(payload.jti as string, context), "acceptJti", resolved);
      if (accepted !== true) {
        return accepted === false ? fail(at("jti", "replayed")) : accepted;
      }
    }
    // The header and payload come deep-frozen from the parser, and the key frozen from its registration.
    const verified: VerifiedDpopProof = Object.freeze({
      header,
      payload: payload as DpopProofPayload,
      key,
      thumbprint,
    });
    return frozenOk(verified);
  };
}

/** The `htm`, `htu` checks: their types, then their values against the request's. */
function requestIssues(payload: JwtPayload, method: string, htu: string): JwtIssue[] {
  const issues: JwtIssue[] = [];
  if (Object.hasOwn(payload, "htm")) {
    if (typeof payload.htm !== "string") {
      issues.push(at("htm", "invalid_claim"));
    } else if (payload.htm !== method) {
      issues.push(at("htm", "wrong_method"));
    }
  }
  if (Object.hasOwn(payload, "htu")) {
    const claimed = typeof payload.htu === "string" ? normalizeHtu(payload.htu) : undefined;
    if (claimed === undefined) {
      issues.push(at("htu", "invalid_claim"));
    } else if (comparableHtu(claimed) !== htu) {
      issues.push(at("htu", "wrong_url"));
    }
  }
  return issues;
}

function athIssues(payload: JwtPayload, expected: string): JwtIssue[] {
  if (!Object.hasOwn(payload, "ath")) {
    return [{ code: "missing_claim", path: ["payload", "ath"], params: { claim: "ath" } }];
  }
  if (typeof payload.ath !== "string") {
    return [at("ath", "invalid_claim")];
  }
  return constantTimeEqual(payload.ath, expected) ? [] : [at("ath", "wrong_access_token_hash")];
}

/**
 * Compares in time that depends only on the lengths: `expected` is derived from the access token, and scope.md
 * section 4 asks every secret-dependent comparison outside Web Crypto to be constant-time.
 */
function constantTimeEqual(given: string, expected: string): boolean {
  let difference = given.length ^ expected.length;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= (given.charCodeAt(index) || 0) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

/** The `cnf.jkt` of an access token's claims, read without running a getter; `undefined` when there is none. */
function boundThumbprint(claims: object): string | undefined {
  try {
    const cnf = ownDataValue(claims, "cnf");
    const jkt = typeof cnf === "object" && cnf !== null ? ownDataValue(cnf, "jkt") : undefined;
    return typeof jkt === "string" ? jkt : undefined;
  } catch {
    // A Proxy can throw from its traps; such claims bind nothing.
    return undefined;
  }
}

/**
 * Runs a caller's callback, which a store behind it can make throw: its failure is kept out of the issue, which
 * could quote anything, and goes to `onCallbackError` instead, as a key set's does (scope.md decisions 16 and 53).
 *
 * @returns The boolean it returned, or the `callback_failed` failure.
 */
async function runCallback(
  callback: () => unknown,
  option: "nonce" | "acceptJti",
  resolved: ResolvedDpopOptions,
): Promise<boolean | ReturnType<typeof fail>> {
  let error: unknown;
  try {
    const returned: unknown = await callback();
    if (typeof returned === "boolean") {
      return returned;
    }
    error = new TypeError(`createDpopVerifier: options.${option} must return a boolean.`);
  } catch (thrown) {
    error = thrown;
  }
  report(resolved.onCallbackError, error);
  return fail({ code: "callback_failed", params: { option } });
}

function report(onCallbackError: ((error: unknown) => void) | undefined, error: unknown): void {
  if (onCallbackError === undefined) {
    return;
  }
  try {
    void quietly(onCallbackError(error));
  } catch {
    // Deliberately ignored: the hook only observes the failure.
  }
}

/** Reads a request, which is the caller's own: a malformed one is a programmer error and throws. */
function readRequest(request: DpopRequest): {
  method: string;
  htu: string;
  accessToken: string | undefined;
  accessTokenClaims: object | undefined;
} {
  if (typeof request !== "object" || request === null) {
    throwInvalid("request must be an object.");
  }
  rejectUnknownOptions(request, REQUEST_MEMBERS, "createDpopVerifier", "request");
  const { method, url, accessToken, accessTokenClaims } = request;
  if (!isMethodToken(method)) {
    throwInvalid("request.method must be an HTTP method token.");
  }
  const text = urlText(url);
  const normalized = text === undefined ? undefined : normalizeHtu(text);
  if (normalized === undefined) {
    throwInvalid("request.url must be an absolute http: or https: URL.");
  }
  const htu = comparableHtu(normalized);
  if (accessToken !== undefined && !isNonEmptyString(accessToken)) {
    throwInvalid("request.accessToken must be a non-empty string.");
  }
  if (accessTokenClaims !== undefined && (typeof accessTokenClaims !== "object" || accessTokenClaims === null)) {
    throwInvalid("request.accessTokenClaims must be an object.");
  }
  // One without the other would check `ath` without the key binding, or the binding without `ath`: a stolen
  // token would then pass with the thief's own key.
  if ((accessToken === undefined) !== (accessTokenClaims === undefined)) {
    throwInvalid("request.accessToken and request.accessTokenClaims must be given together.");
  }
  return { method, htu, accessToken, accessTokenClaims };
}

function resolveOptions(options: DpopVerifierOptions): ResolvedDpopOptions {
  if (typeof options !== "object" || options === null) {
    throwInvalid("options must be an object.");
  }
  rejectUnknownOptions(options, KNOWN_OPTIONS, "createDpopVerifier");
  const { algorithms, maxAge, clockTolerance, maxLength, nonce, acceptJti, now, onCallbackError } = options;
  const algorithmList = algorithms === undefined ? ASYMMETRIC_ALGORITHMS : readAlgorithms(algorithms);
  if (maxAge !== undefined && !isIntegerInRange(maxAge, 1, Number.MAX_SAFE_INTEGER)) {
    throwInvalid("options.maxAge must be a positive integer number of seconds.");
  }
  if (clockTolerance !== undefined && !isIntegerInRange(clockTolerance, 0, MAX_CLOCK_TOLERANCE)) {
    throwInvalid(`options.clockTolerance must be an integer number of seconds from 0 through ${MAX_CLOCK_TOLERANCE}.`);
  }
  if (maxLength !== undefined && !isIntegerInRange(maxLength, 1, MAX_TOKEN_LENGTH_LIMIT)) {
    throwInvalid(`options.maxLength must be an integer from 1 through ${MAX_TOKEN_LENGTH_LIMIT}.`);
  }
  for (const [name, value] of [
    ["acceptJti", acceptJti],
    ["onCallbackError", onCallbackError],
  ] as const) {
    if (value !== undefined && typeof value !== "function") {
      throwInvalid(`options.${name} must be a function.`);
    }
  }
  if (now !== undefined && typeof now !== "function") {
    throwInvalid("options.now must be a function returning milliseconds.");
  }
  return {
    algorithms: algorithmList,
    maxLength: maxLength ?? DEFAULT_MAX_TOKEN_LENGTH,
    claimChecks: {
      // A proof has no `aud` of its own to check, and its life is bounded by `maxAge`.
      audiences: false,
      requireExpiration: false,
      allowExpired: false,
      clockTolerance: clockTolerance ?? 0,
      maxAge: maxAge ?? DEFAULT_MAX_AGE,
      requiredClaims: REQUIRED_CLAIMS,
      now: now ?? Date.now,
    },
    ...(nonce === undefined ? {} : { nonce: readNonce(nonce) }),
    ...(acceptJti === undefined ? {} : { acceptJti }),
    ...(onCallbackError === undefined ? {} : { onCallbackError }),
  };
}

function readAlgorithms(value: unknown): readonly AsymmetricAlgorithm[] {
  const copy = Array.isArray(value) ? denseCopy(value) : undefined;
  if (copy === undefined || copy.length === 0 || !copy.every(isAsymmetricAlgorithm)) {
    throwInvalid("options.algorithms must be a non-empty array of asymmetric algorithms.");
  }
  return Object.freeze(copy as AsymmetricAlgorithm[]);
}

function readNonce(value: unknown): NonceCheck {
  if (typeof value === "function") {
    return value as NonceCheck;
  }
  const list: unknown = typeof value === "string" ? [value] : value;
  const copy = Array.isArray(list) ? denseCopy(list) : undefined;
  if (copy === undefined || copy.length === 0 || !copy.every(isNonEmptyString)) {
    throwInvalid("options.nonce must be a non-empty string, a non-empty array of them, or a function.");
  }
  return Object.freeze(copy as string[]);
}
