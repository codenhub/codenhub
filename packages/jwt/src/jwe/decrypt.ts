import { readKeySetIssues } from "../core/key-set-issues";
import { MAX_TOKEN_LENGTH_LIMIT } from "../core/limits";
import { rejectUnknownOptions } from "../core/options";
import { fail, ok } from "../core/result";
import type { JwtIssue, JwtPathSegment, JwtPayload, JwtResult, Verifier } from "../core/types";
import { copyBytes } from "../encoding/bytes";
import { parseJsonObject, type JsonObject } from "../encoding/json";
import { decodeUtf8 } from "../encoding/text";
import { selectKey } from "../keysets/select";
import { CONTENT_ENCRYPTION_ALGORITHMS, isContentEncryptionAlgorithm } from "./algorithms";
import { parseCompactJwe } from "./compact";
import { decryptContent } from "./content";
import { DECRYPTION_FAILED, unwrapContentKey } from "./key-management";
import { getJweKeyEntry, isJweDecryptionKey, isJweKey } from "./registry";
import type {
  ContentEncryptionAlgorithm,
  DecryptedJwe,
  DecryptedJwt,
  Decrypter,
  JweDecryptionKey,
  JweHeader,
  JweKeySet,
  LocalJweKeySet,
  NestedVerifier,
} from "./types";

/** The default longest JWE a decrypter reads, in characters. A JWE is longer than the JWS it may hold. */
export const DEFAULT_MAX_JWE_LENGTH = 16_384;

/** How {@link createDecrypter} decrypts. Invalid options throw `TypeError` when the decrypter is created. */
export interface DecrypterOptions {
  /** Where decryption keys come from: {@link createJweKeySet}, or any object with a `select` function. */
  readonly keys: JweKeySet;
  /**
   * Content encryption algorithms accepted. A token whose `enc` is another fails with `unsupported_enc` before any
   * key is selected. Non-empty.
   *
   * @defaultValue every supported one: `A128GCM`, `A256GCM`, `A128CBC-HS256`, `A256CBC-HS512`
   */
  readonly enc?: readonly ContentEncryptionAlgorithm[];
  /**
   * Maximum token length in characters, checked before any decoding. An integer from 1 through 65536. It bounds the
   * ciphertext, and so the work and memory one token costs.
   *
   * @defaultValue 16384
   */
  readonly maxLength?: number;
}

const DECRYPTER_OPTIONS: Readonly<Record<keyof DecrypterOptions, true>> = { keys: true, enc: true, maxLength: true };

const KEY_SET_ERROR = fail({ code: "key_fetch_failed", params: { reason: "key_set_error" } });

/**
 * Creates a decrypter for compact JWE tokens (RFC 7516).
 *
 * @remarks
 * Each token goes through, in order: the length cap, before any decoding; strict parsing of its five segments
 * and header, with `alg` and `enc` read from the protected header, the only one a compact token has; key
 * selection from `options.keys` by `kid` and `alg`, never by trying keys in turn; the selected key's algorithm,
 * which must equal the header's `alg`, and for a `dir` key its `enc`; recovery of the content key; and the tag,
 * checked before any plaintext exists.
 *
 * A failed key unwrap and a wrong tag are one failure, `decryption_failed`: when unwrapping fails, a random
 * content key stands in and the token fails on its tag (RFC 7516 §11.5), so no answer tells an attacker which step
 * a forged token failed. `RSA1_5`, the `PBES2-*` algorithms, `zip` and every `crit` are refused before any
 * cryptography.
 *
 * @example
 * ```ts
 * const decrypt = createDecrypter({ keys: createJweKeySet([privateKey]), enc: ["A256GCM"] });
 * const result = await decrypt(token);
 * if (result.ok) {
 *   const claims = decodeJsonObject(result.value.plaintext);
 * }
 * ```
 *
 * @returns A {@link Decrypter}. It resolves to the frozen `{ header, plaintext, key }`, or to a failure, and never
 * throws for any token. A key set whose `select` throws, rejects, or returns anything other than a result holding a
 * JWE decryption key this package created fails with `key_fetch_failed` and `{ reason: "key_set_error" }`, except
 * that a failed result whose issues each have a string `code` is passed through.
 * @throws TypeError when `options` is not an object, has a member that is not an option, `keys` has no `select`
 * function, `enc` is not a non-empty array of supported content encryption algorithms, or `maxLength` is not an
 * integer from 1 through 65536.
 */
export function createDecrypter(options: DecrypterOptions): Decrypter {
  if (typeof options !== "object" || options === null) {
    throw new TypeError("createDecrypter: options must be an object.");
  }
  rejectUnknownOptions(options, DECRYPTER_OPTIONS, "createDecrypter");
  const { keys } = options;
  if (typeof keys !== "object" || keys === null || typeof (keys as { select?: unknown }).select !== "function") {
    throw new TypeError("createDecrypter: options.keys must be a key set with a select function.");
  }
  const accepted = readAccepted(options.enc);
  const maxLength = readMaxLength(options.maxLength);
  return async (token) => {
    const parsed = parseCompactJwe(token, maxLength, accepted);
    if (!parsed.ok) {
      return parsed;
    }
    const jwe = parsed.value;
    const selected = await selectFrom(keys, jwe.header);
    if (!selected.ok) {
      return selected;
    }
    const key = selected.value;
    if (key.alg !== jwe.header.alg) {
      return fail({ code: "alg_mismatch", path: ["header", "alg"] });
    }
    if (key.kind === "jwe-secret" && key.alg === "dir" && key.enc !== jwe.header.enc) {
      return fail({ code: "alg_mismatch", path: ["header", "enc"] });
    }
    const entry = getJweKeyEntry(key, "createDecrypter");
    const recovered = await unwrapContentKey(jwe.header, entry, jwe.encryptedKey);
    if ("issue" in recovered) {
      return fail(recovered.issue);
    }
    const plaintext = await decryptContent(jwe.header.enc, recovered.contentKey, jwe, jwe.aad);
    if (plaintext === undefined) {
      return fail(DECRYPTION_FAILED);
    }
    // Built by hand: `ok` freezes deeply, and the plaintext belongs to the caller.
    const value: DecryptedJwe = Object.freeze({ header: jwe.header, plaintext, key });
    return Object.freeze({ ok: true as const, value });
  };
}

function readAccepted(enc: unknown): ReadonlySet<ContentEncryptionAlgorithm> {
  if (enc === undefined) {
    return new Set(CONTENT_ENCRYPTION_ALGORITHMS);
  }
  if (!Array.isArray(enc) || enc.length === 0 || !enc.every(isContentEncryptionAlgorithm)) {
    throw new TypeError(
      `createDecrypter: options.enc must be a non-empty array of ${CONTENT_ENCRYPTION_ALGORITHMS.join(", ")}.`,
    );
  }
  return new Set(enc);
}

function readMaxLength(maxLength: unknown): number {
  if (maxLength === undefined) {
    return DEFAULT_MAX_JWE_LENGTH;
  }
  if (!Number.isInteger(maxLength) || (maxLength as number) < 1 || (maxLength as number) > MAX_TOKEN_LENGTH_LIMIT) {
    throw new TypeError(
      `createDecrypter: options.maxLength must be an integer from 1 through ${MAX_TOKEN_LENGTH_LIMIT}.`,
    );
  }
  return maxLength as number;
}

/**
 * Asks the key set for the header's key. A key set is caller code, so whatever it does wrong, throwing included,
 * becomes a `key_set_error` failure rather than an exception or an unchecked key.
 */
async function selectFrom(keys: JweKeySet, header: JweHeader): Promise<JwtResult<JweDecryptionKey>> {
  try {
    const result: unknown = await keys.select(header);
    if (typeof result !== "object" || result === null) {
      return KEY_SET_ERROR;
    }
    const { ok: isOk, value, error } = result as { ok?: unknown; value?: unknown; error?: { issues?: unknown } };
    if (isOk === true) {
      return isJweDecryptionKey(value) ? ok(value) : KEY_SET_ERROR;
    }
    const issues = readKeySetIssues(isOk === false ? error?.issues : undefined);
    return issues === undefined ? KEY_SET_ERROR : fail(...issues);
  } catch {
    return KEY_SET_ERROR;
  }
}

/**
 * Creates a key set over a fixed list of JWE decryption keys, for {@link createDecrypter}.
 *
 * @remarks
 * Keys are selected by `kid` and `alg` as {@link createKeySet}'s are: with a `kid`, the key with that `kid`, or else
 * a key without one; without a `kid`, the single key for the header's `alg`. Keys are never tried in turn, so a
 * token costs at most one key unwrap.
 *
 * @returns The frozen key set.
 * @throws TypeError when `keys` is not a non-empty array, holds anything but a JWE private or secret key this
 * package created (a JWS key or a JWE public key included), or two keys share a `kid` and `alg`.
 */
export function createJweKeySet(keys: readonly JweDecryptionKey[]): LocalJweKeySet {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new TypeError("createJweKeySet: keys must be a non-empty array.");
  }
  // Copied once, by index, so the set holds exactly the keys checked below.
  const snapshot: readonly unknown[] = Array.from({ length: keys.length }, (_, index) => keys[index]);
  const seen = new Set<string>();
  for (const key of snapshot) {
    if (!isJweKey(key)) {
      throw new TypeError(
        "createJweKeySet: keys must be JWE keys created by @codenhub/jwt (importJwe*, generateJwe*).",
      );
    }
    if (key.kind === "jwe-public") {
      throw new TypeError("createJweKeySet: keys must be JWE private or secret keys, not public keys.");
    }
    const identity = JSON.stringify([key.kid ?? null, key.alg]);
    if (seen.has(identity)) {
      throw new TypeError("createJweKeySet: two keys share the same kid and alg.");
    }
    seen.add(identity);
  }
  const checked = Object.freeze(snapshot as JweDecryptionKey[]);
  return Object.freeze({
    keys: checked,
    select: async (header: JweHeader): Promise<JwtResult<JweDecryptionKey>> => selectKey(checked, header),
  });
}

/**
 * Reads a JSON object from decrypted bytes, by the strict rules a token's payload is read with: UTF-8, no
 * duplicate member, at most 32 levels deep. Never throws.
 *
 * @returns The deep-frozen object, or a failure with `malformed`, `duplicate_key` or `too_large` at
 * `["plaintext"]`.
 */
export function decodeJsonObject(plaintext: Uint8Array): JwtResult<JsonObject> {
  const bytes = copyBytes(plaintext);
  if (bytes === undefined) {
    return fail({ code: "malformed", path: ["plaintext"] });
  }
  return parseJsonObject(bytes, ["plaintext"]);
}

/** How {@link createNestedVerifier} decrypts and verifies. */
export interface NestedVerifierOptions<TPayload extends JwtPayload = JwtPayload> {
  /** The decrypter for the outer JWE. */
  readonly decrypt: Decrypter;
  /** The verifier for the signed token inside, with every check it would apply to a bare token. */
  readonly verify: Verifier<TPayload>;
}

const NESTED_OPTIONS: Readonly<Record<keyof NestedVerifierOptions, true>> = { decrypt: true, verify: true };

/**
 * Creates a decrypt-then-verify function for a signed JWT inside a JWE (RFC 7519 §5.2), as {@link encryptJwt}
 * makes one.
 *
 * @remarks
 * The JWE is decrypted, its `cty` must be `JWT` (compared case-insensitively, with an `application/` prefix
 * ignored) or absent, and its plaintext is handed to an ordinary verifier, which checks the inner token exactly as
 * it would a bare one, signature and claims included. Encryption never stands in for a signature: a token that
 * decrypts but does not verify fails.
 *
 * @returns A {@link NestedVerifier} resolving to the verified token, with the outer header and decryption key as
 * `encryption`, or to the first failure: the decrypter's, `wrong_type` at `["header", "cty"]` for another `cty`,
 * `malformed` at `["plaintext"]` for a plaintext that is not UTF-8, or the verifier's, each of its issues with
 * `"plaintext"` before its path (`["plaintext", "header", "kid"]`, or `["plaintext"]` for an issue without one),
 * so an issue of the inner token is never mistaken for one of the JWE. Never throws for a token; the verifier's
 * own rejections, from caller code, propagate.
 * @throws TypeError when `options` is not an object, has a member that is not an option, or `decrypt` or
 * `verify` is not a function.
 */
export function createNestedVerifier<TPayload extends JwtPayload = JwtPayload>(
  options: NestedVerifierOptions<TPayload>,
): NestedVerifier<TPayload> {
  if (typeof options !== "object" || options === null) {
    throw new TypeError("createNestedVerifier: options must be an object.");
  }
  rejectUnknownOptions(options, NESTED_OPTIONS, "createNestedVerifier");
  const { decrypt, verify } = options;
  if (typeof decrypt !== "function" || typeof verify !== "function") {
    throw new TypeError("createNestedVerifier: options.decrypt and options.verify must be functions.");
  }
  return async (token) => {
    const decrypted = await decrypt(token);
    if (!decrypted.ok) {
      return decrypted;
    }
    const { header, plaintext, key } = decrypted.value;
    if (header.cty !== undefined && normalizeMediaType(header.cty) !== "jwt") {
      return fail({ code: "wrong_type", path: ["header", "cty"] });
    }
    const inner = decodeUtf8(plaintext);
    if (inner === undefined) {
      return fail({ code: "malformed", path: ["plaintext"] });
    }
    const verified = await verify(inner);
    if (!verified.ok) {
      const issues: unknown = verified.error?.issues;
      // A verifier is caller code; a failure that holds no list of issues is passed on as it came.
      return Array.isArray(issues) && issues.length > 0 ? fail(...underPlaintext(issues)) : verified;
    }
    const value: DecryptedJwt<TPayload> = { ...verified.value, encryption: { header, key } };
    return ok(value);
  };
}

/**
 * The inner verifier's issues, each with `"plaintext"` before its path, so a caller tells an inner failure from an
 * outer one: `["header", "kid"]` of the signed token is `["plaintext", "header", "kid"]`, and an issue without a
 * path gets `["plaintext"]`.
 */
function underPlaintext(issues: readonly JwtIssue[]): [JwtIssue, ...JwtIssue[]] {
  return issues.map((issue): JwtIssue => {
    const path: readonly JwtPathSegment[] = Array.isArray(issue.path) ? issue.path : [];
    return { ...issue, path: ["plaintext", ...path] };
  }) as [JwtIssue, ...JwtIssue[]];
}

/** RFC 7515 §4.1.10: compared case-insensitively, with the `application/` prefix optional. */
function normalizeMediaType(value: string): string {
  const lower = value.toLowerCase();
  return lower.startsWith("application/") ? lower.slice("application/".length) : lower;
}
