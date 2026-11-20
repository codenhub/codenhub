import { rejectUnknownOptions } from "../core/options";
import type { PrivateKey } from "../core/types";
import { getPublicKey } from "../keys/public-key";
import { isRegisteredKey } from "../keys/registry";
import { signToken } from "../sign/sign";
import { accessTokenHash, DPOP_TYPE, isMethodToken, isNonEmptyString, normalizeHtu, urlText } from "./shared";

/** What {@link createDpopProof} signs a proof for. */
export interface DpopProofInput {
  /**
   * The client's private key, of an asymmetric algorithm: generated, imported, non-extractable or external.
   * It fixes the proof's `alg`, and its public half is embedded as the `jwk` header.
   */
  readonly key: PrivateKey;
  /** The request's HTTP method, written as `htm`, such as `POST`. Methods are case-sensitive. */
  readonly method: string;
  /**
   * The request's target URI, written as `htu` without its query and fragment: an absolute `http:` or `https:`
   * URL, as a string or a `URL`.
   */
  readonly url: string | URL;
  /**
   * The access token the request presents, whose SHA-256 hash is written as `ath`. Give it for a request to a
   * resource server; leave it out at the token endpoint.
   *
   * @defaultValue no `ath`
   */
  readonly accessToken?: string;
  /**
   * The nonce the server last sent in a `DPoP-Nonce` header, written as `nonce`.
   *
   * @defaultValue no `nonce`
   */
  readonly nonce?: string;
  /**
   * The proof's unique identifier, written as `jti`.
   *
   * @defaultValue a random UUID from `crypto.randomUUID()`
   */
  readonly jti?: string;
  /**
   * The clock `iat` is read from, in milliseconds since the Unix epoch, as `sign`'s is. `iat` is written in
   * whole seconds.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
}

const INPUT_MEMBERS: Readonly<Record<keyof DpopProofInput, true>> = {
  key: true,
  method: true,
  url: true,
  accessToken: true,
  nonce: true,
  jti: true,
  now: true,
};

const MILLISECONDS_PER_SECOND = 1000;
/** The end of year 9999, the latest `iat` `sign` writes, in milliseconds. */
const MAX_TIME_MS = 253_402_300_799_999;

const fail = (message: string): never => {
  throw new TypeError(`createDpopProof: ${message}`);
};

/**
 * Creates a DPoP proof (RFC 9449): a JWT that shows the client holds `key`, for one HTTP request.
 *
 * @remarks
 * The header is `alg` from the key, `typ: "dpop+jwt"` and `jwk`, the key's public half, with only its
 * material; the key's own `kid` is not written, since the `jwk` names the key. The payload is `jti`, `htm`,
 * `htu` and `iat`, then `ath` and `nonce` when given. Send it in the request's `DPoP` header, a new proof
 * for each request.
 *
 * @example
 * ```ts
 * const { privateKey } = await generateKeyPair({ alg: "ES256" });
 * const proof = await createDpopProof({
 *   key: privateKey,
 *   method: "GET",
 *   url: "https://api.example/orders",
 *   accessToken,
 * });
 * await fetch("https://api.example/orders", { headers: { authorization: `DPoP ${accessToken}`, dpop: proof } });
 * ```
 *
 * @param input - The key, the request it is for, and the optional `ath`, `nonce`, `jti` and clock.
 * @returns The compact proof.
 * @throws TypeError, as a rejected promise, when `input` is not an object or has a member that is not an
 * option; `input.key` is not a private key this package created, such as a public or secret key;
 * `input.method` is not an HTTP method token; `input.url` is not an absolute `http:` or `https:` URL;
 * `input.accessToken`, `input.nonce` or `input.jti` is not a non-empty string; or `input.now` is not a
 * function, or returns something other than milliseconds since the Unix epoch.
 */
export async function createDpopProof(input: DpopProofInput): Promise<string> {
  if (typeof input !== "object" || input === null) {
    fail("input must be an object.");
  }
  rejectUnknownOptions(input, INPUT_MEMBERS, "createDpopProof", "input");
  const { key, method, url, accessToken, nonce, jti, now } = input;
  // A secret key has no public half to embed, and a proof anyone holding the secret could sign proves nothing.
  if (!isRegisteredKey(key) || key.kind !== "private") {
    fail("input.key must be a private key.");
  }
  if (!isMethodToken(method)) {
    fail("input.method must be an HTTP method token.");
  }
  const text = urlText(url);
  const htu = text === undefined ? undefined : normalizeHtu(text);
  if (htu === undefined) {
    fail("input.url must be an absolute http: or https: URL.");
  }
  for (const [name, value] of [
    ["accessToken", accessToken],
    ["nonce", nonce],
    ["jti", jti],
  ] as const) {
    if (value !== undefined && !isNonEmptyString(value)) {
      fail(`input.${name} must be a non-empty string.`);
    }
  }
  if (now !== undefined && typeof now !== "function") {
    fail("input.now must be a function.");
  }
  const time: unknown = (now ?? Date.now)();
  // The bound `sign` puts on numeric dates (scope.md decision 45), in milliseconds.
  if (typeof time !== "number" || !Number.isFinite(time) || time < 0 || time > MAX_TIME_MS) {
    fail("input.now must return milliseconds since the Unix epoch.");
  }
  const payload: Record<string, string | number> = {
    jti: jti ?? crypto.randomUUID(),
    htm: method,
    htu: htu as string,
    iat: Math.floor((time as number) / MILLISECONDS_PER_SECOND),
  };
  if (accessToken !== undefined) {
    payload.ath = await accessTokenHash(accessToken);
  }
  if (nonce !== undefined) {
    payload.nonce = nonce;
  }
  return signToken({ payload, key, header: { typ: DPOP_TYPE }, embedKey: getPublicKey(key) }, false);
}
