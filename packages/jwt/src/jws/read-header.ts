import { DEFAULT_MAX_TOKEN_LENGTH, MAX_TOKEN_LENGTH_LIMIT } from "../core/limits";
import { rejectUnknownOptions } from "../core/options";
import { ok } from "../core/result";
import type { JwtHeader, JwtResult } from "../core/types";
import { checkSegments } from "./compact";

/** How {@link readHeader} reads a token. Invalid options throw `TypeError`. */
export interface ReadHeaderOptions {
  /**
   * Maximum token length in characters, checked before any decoding. An integer from 1 through 65536.
   *
   * @defaultValue 8192
   */
  readonly maxLength?: number;
}

const KNOWN_OPTIONS: Readonly<Record<keyof ReadHeaderOptions, true>> = { maxLength: true };

/**
 * Rejects options that are not an object, hold an unknown member, or have a `maxLength` outside 1 through
 * {@link MAX_TOKEN_LENGTH_LIMIT}.
 */
function resolveMaxLength(options: unknown): number {
  if (options === undefined) {
    return DEFAULT_MAX_TOKEN_LENGTH;
  }
  if (typeof options !== "object" || options === null) {
    throw new TypeError("readHeader: options must be an object.");
  }
  rejectUnknownOptions(options, KNOWN_OPTIONS, "readHeader");
  const maxLength: unknown = Object.hasOwn(options, "maxLength") ? (options as ReadHeaderOptions).maxLength : undefined;
  if (maxLength === undefined) {
    return DEFAULT_MAX_TOKEN_LENGTH;
  }
  if (
    typeof maxLength !== "number" ||
    !Number.isInteger(maxLength) ||
    maxLength < 1 ||
    maxLength > MAX_TOKEN_LENGTH_LIMIT
  ) {
    throw new TypeError(`readHeader: options.maxLength must be an integer from 1 through ${MAX_TOKEN_LENGTH_LIMIT}.`);
  }
  return maxLength;
}

/**
 * Reads the protected header of a compact JWS without verifying it, so a caller can pick a key or route
 * a token before verification.
 *
 * @remarks
 * The header is untrusted until a verifier accepts the token. The token is checked as a verifier checks
 * it up to the header: its length before any decoding, exactly three non-empty base64url segments, a
 * header that is a JSON object without repeated members, a supported `alg`, no `crit` or `b64`, and a
 * `kid`, `typ` and `cty` that are text when present. The payload is never decoded: there is no way to
 * read claims from a token that has not been verified.
 *
 * @example
 * ```ts
 * const result = readHeader(token);
 * if (result.ok) {
 *   console.log(result.value.alg, result.value.kid);
 * }
 * ```
 *
 * @param token - The untrusted token. Any value is accepted; a value that is not a string is `malformed`.
 * @param options - Limits for reading the token.
 * @returns The frozen header, or a failure with the first issue found: `too_large` with
 * `{ limit: "length", maximum }`, `malformed`, `duplicate_key`, `too_large` with
 * `{ limit: "depth", maximum: 32 }`, `unsupported_alg` (including `none` in any casing), or
 * `unsupported_crit`. It reports a bad token by its result and never throws for one.
 * @throws {TypeError} When `options` is not an object, holds a member that is not an option, or has a
 * `maxLength` that is not an integer from 1 through 65536.
 */
export function readHeader(token: unknown, options?: ReadHeaderOptions): JwtResult<JwtHeader> {
  const checked = checkSegments(token, resolveMaxLength(options));
  return checked.ok ? ok(checked.value.header) : checked;
}
