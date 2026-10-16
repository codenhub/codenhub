import { fail, ok } from "../core/result";
import type {
  JwtHeader,
  JwtIssue,
  JwtResult,
  KeySet,
  VerificationKey,
  VerifiedJwt,
  VerifiedPayload,
  Verifier,
  VerifierOptions,
} from "../core/types";
import type { StandardSchemaV1 } from "../interop/standard-schema";
import { parseCompact, parsePayload } from "../jws/compact";
import { ALGORITHM_PARAMS } from "../keys/algorithms";
import { getKeyEntry, isRegisteredKey } from "../keys/registry";
import { checkClaims, schemaIssues } from "./claims";
import { resolveOptions } from "./options";

const KEY_SET_ERROR = fail({ code: "key_fetch_failed", params: { reason: "key_set_error" } });

/**
 * Creates a verifier that checks a token's structure, signature and claims in one call.
 *
 * @remarks
 * Each token goes through, in order: the length cap, before any decoding; strict parsing of its three
 * segments and header; key selection from `options.keys`; the selected key's algorithm, which must equal
 * the header's `alg`; the signature; and only then the payload, which is never read before its signature
 * verifies. Claim checks then run and report every failing claim together: registered claim types,
 * `exp` (expired once now ≥ `exp` + tolerance), `nbf`, `iat`, `maxAge`, issuer, audience, `typ`, and
 * required claims. When all of them pass, `options.claims` runs last.
 *
 * Times compare in fractional seconds, `options.now() / 1000`, against the numeric date claims.
 *
 * @example
 * ```ts
 * const verify = createVerifier({
 *   keys: createKeySet([publicKey]),
 *   issuer: "https://issuer.example",
 *   audience: "api",
 *   clockTolerance: 30,
 * });
 * const result = await verify(token);
 * if (!result.ok) {
 *   return reject(result.error.issues);
 * }
 * const { sub } = result.value.payload;
 * ```
 *
 * @typeParam TSchema - The Standard Schema given as `options.claims`, which types the verified payload.
 * @param options - Where keys come from and which claims to require; see {@link VerifierOptions}.
 * @returns A {@link Verifier}. It resolves to the frozen `{ header, payload, key }`, or to a failure and
 * never throws for any token. A key set whose `select` throws or rejects, or returns something other than
 * a result holding a public or secret key this package created, makes the verifier fail with
 * `key_fetch_failed` and `{ reason: "key_set_error" }`. A rejection from `options.claims` is not caught.
 * @throws TypeError when `options` is not an object; `keys` has no `select` function; `issuer` or
 * `audience` is neither a non-empty string nor a non-empty array of them; `type` is not a non-empty
 * string; `clockTolerance` is not an integer from 0 through 300; `maxAge` is not a positive integer;
 * `maxLength` is not an integer from 1 through 65536; `requiredClaims` is not an array of non-empty
 * strings; `claims` is not a version 1 Standard Schema; or `now` is not a function.
 */
export function createVerifier<TSchema extends StandardSchemaV1 | undefined = undefined>(
  options: VerifierOptions<TSchema>,
): Verifier<VerifiedPayload<TSchema>> {
  const resolved = resolveOptions(options);
  return async (token) => {
    const parsed = parseCompact(token, resolved.maxLength);
    if (!parsed.ok) {
      return parsed;
    }
    const jws = parsed.value;
    const selected = await selectKey(resolved.keys, jws.header);
    if (!selected.ok) {
      return selected;
    }
    const key = selected.value;
    if (key.alg !== jws.header.alg) {
      return fail({ code: "alg_mismatch", path: ["header", "alg"] });
    }
    const { cryptoKey, signatureLength } = getKeyEntry(key);
    if (jws.signature.length !== signatureLength) {
      return fail({ code: "bad_signature" });
    }
    const signParams = ALGORITHM_PARAMS[key.alg].signParams;
    if (!(await crypto.subtle.verify(signParams, cryptoKey, jws.signature, jws.signingInput))) {
      return fail({ code: "bad_signature" });
    }
    const payload = parsePayload(jws);
    if (!payload.ok) {
      return payload;
    }
    const claimIssues = checkClaims(jws.header, payload.value, resolved);
    const issues: JwtIssue[] =
      claimIssues.length === 0 && resolved.claims !== undefined
        ? await schemaIssues(resolved.claims, payload.value)
        : claimIssues;
    if (issues.length > 0) {
      return fail(...(issues as [JwtIssue, ...JwtIssue[]]));
    }
    const verified: VerifiedJwt<VerifiedPayload<TSchema>> = {
      header: jws.header,
      payload: payload.value as VerifiedPayload<TSchema>,
      key,
    };
    return ok(verified);
  };
}

/**
 * Asks the key set for the header's key. A key set is caller code, so whatever it does wrong, throwing
 * included, becomes a `key_set_error` failure rather than an exception or an unchecked key.
 */
async function selectKey(keys: KeySet, header: JwtHeader): Promise<JwtResult<VerificationKey>> {
  let result: unknown;
  try {
    result = await keys.select(header);
  } catch {
    return KEY_SET_ERROR;
  }
  if (typeof result !== "object" || result === null) {
    return KEY_SET_ERROR;
  }
  const { ok: isOk, value, error } = result as { ok?: unknown; value?: unknown; error?: { issues?: unknown } };
  if (isOk === true) {
    return isRegisteredKey(value) && value.kind !== "private" ? ok(value) : KEY_SET_ERROR;
  }
  const issues = isOk === false ? error?.issues : undefined;
  return Array.isArray(issues) && issues.length > 0 ? fail(...(issues as [JwtIssue, ...JwtIssue[]])) : KEY_SET_ERROR;
}
