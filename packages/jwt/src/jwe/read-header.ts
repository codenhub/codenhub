import { MAX_TOKEN_LENGTH_LIMIT } from "../core/limits";
import { rejectUnknownOptions } from "../core/options";
import { ok } from "../core/result";
import type { JwtResult } from "../core/types";
import { CONTENT_ENCRYPTION_ALGORITHMS } from "./algorithms";
import { parseCompactJwe } from "./compact";
import { DEFAULT_MAX_JWE_LENGTH } from "./decrypt";
import type { ContentEncryptionAlgorithm, JweHeader } from "./types";

/** How {@link readJweHeader} reads a token. Invalid options throw `TypeError`. */
export interface ReadJweHeaderOptions {
  /**
   * Maximum token length in characters, checked before any decoding. An integer from 1 through 65536.
   *
   * @defaultValue 16384
   */
  readonly maxLength?: number;
}

const KNOWN_OPTIONS: Readonly<Record<keyof ReadJweHeaderOptions, true>> = { maxLength: true };

const EVERY_ENC: ReadonlySet<ContentEncryptionAlgorithm> = new Set(CONTENT_ENCRYPTION_ALGORITHMS);

function resolveMaxLength(options: unknown): number {
  if (options === undefined) {
    return DEFAULT_MAX_JWE_LENGTH;
  }
  if (typeof options !== "object" || options === null) {
    throw new TypeError("readJweHeader: options must be an object.");
  }
  rejectUnknownOptions(options, KNOWN_OPTIONS, "readJweHeader");
  const maxLength: unknown = Object.hasOwn(options, "maxLength")
    ? (options as ReadJweHeaderOptions).maxLength
    : undefined;
  if (maxLength === undefined) {
    return DEFAULT_MAX_JWE_LENGTH;
  }
  if (
    typeof maxLength !== "number" ||
    !Number.isInteger(maxLength) ||
    maxLength < 1 ||
    maxLength > MAX_TOKEN_LENGTH_LIMIT
  ) {
    throw new TypeError(
      `readJweHeader: options.maxLength must be an integer from 1 through ${MAX_TOKEN_LENGTH_LIMIT}.`,
    );
  }
  return maxLength;
}

/**
 * Reads the protected header of a compact JWE without decrypting it, so a caller can route a token, or pick a
 * decrypter by its `kid` or `alg`, before decryption.
 *
 * @remarks
 * The header is untrusted: the tag that authenticates it is checked only by decryption. The token is checked as a
 * decrypter checks it up to its cryptography: its length before any decoding, exactly five canonical base64url
 * segments, a header that is a JSON object without repeated members, a supported `alg` and `enc` (any of
 * {@link CONTENT_ENCRYPTION_ALGORITHMS}, since no decrypter's `enc` list applies), no `zip` or `crit`, an `epk`
 * where `alg` needs one, an encrypted key that is empty exactly when `alg` writes none, and an IV and tag of the
 * lengths `enc` makes them. The encrypted key's own length is checked only by decryption. Only the protected
 * header is returned; no key is used and nothing is decrypted.
 *
 * @example
 * ```ts
 * const result = readJweHeader(token);
 * if (result.ok) {
 *   console.log(result.value.alg, result.value.enc, result.value.kid);
 * }
 * ```
 *
 * @param token - The untrusted token. Any value is accepted; a value that is not a string is `malformed`.
 * @param options - Limits for reading the token.
 * @returns The frozen header, or a failure with the first issue found: `too_large` with
 * `{ limit: "length", maximum }`, `malformed`, `duplicate_key`, `too_large` with `{ limit: "depth", maximum: 32 }`,
 * `unsupported_alg`, `unsupported_enc` or `unsupported_crit`. It reports a bad token by its result and never throws
 * for one.
 * @throws {TypeError} When `options` is not an object, holds a member that is not an option, or has a `maxLength`
 * that is not an integer from 1 through 65536.
 */
export function readJweHeader(token: unknown, options?: ReadJweHeaderOptions): JwtResult<JweHeader> {
  const parsed = parseCompactJwe(token, resolveMaxLength(options), EVERY_ENC);
  return parsed.ok ? ok(parsed.value.header) : parsed;
}
