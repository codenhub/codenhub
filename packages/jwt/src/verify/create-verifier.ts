import { fail, frozenOk } from "../core/result";
import type {
  JwtErr,
  JwtHeader,
  JwtIssue,
  JwtPayload,
  JwtRegisteredClaims,
  JwtResult,
  KeySet,
  KeySetResolver,
  VerificationKey,
  VerifiedJwt,
  VerifiedPayload,
  Verifier,
  VerifierOptions,
} from "../core/types";
import type { StandardSchemaV1 } from "../interop/standard-schema";
import { parseCompact, parsePayload, type CompactJws } from "../jws/compact";
import { ALGORITHM_PARAMS } from "../keys/algorithms";
import { getKeyEntry, isRegisteredKey } from "../keys/registry";
import { checkClaims, schemaIssues } from "./claims";
import { readRouteChecks, resolveOptions, type ResolvedOptions } from "./options";

const KEY_SET_ERROR = fail({ code: "key_fetch_failed", params: { reason: "key_set_error" } });
const MISSING_ISSUER = fail({ code: "missing_claim", path: ["payload", "iss"], params: { claim: "iss" } });
const INVALID_ISSUER = fail({ code: "invalid_claim", path: ["payload", "iss"] });
const WRONG_ISSUER = fail({ code: "wrong_issuer", path: ["payload", "iss"] });

/**
 * Creates a verifier that checks a token's structure, signature and claims in one call.
 *
 * @remarks
 * Each token goes through, in order: the length cap, before any decoding; strict parsing of its three
 * segments and header; key selection from `options.keys`; the selected key's algorithm, which must equal
 * the header's `alg`; the signature; and only then the payload, which is never read before its signature
 * verifies, except for the `iss` a `keys` function routes by, which is untrusted until then. Claim checks
 * then run and report every failing claim together: registered claim types, `exp` (expired once now ≥
 * `exp` + tolerance), `nbf`, `iat`, `maxAge`, issuer, subject, audience, `typ`, and required claims. When all of them pass, `options.claims` runs last.
 *
 * When `options.keys` is a {@link KeySetResolver}, the payload's `iss` is read before the signature, only to
 * ask it for the issuer's key set; nothing else in the payload is used until the signature verifies.
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
 * The verified payload's type comes from `options.claims` when it is given: `createVerifier({ keys, claims:
 * schema })` returns a `Verifier` whose payload is the schema's input type. Without a schema, a type argument
 * names it: `createVerifier<AccessClaims>({ keys })`, with `AccessClaims` any object type, an `interface`
 * included, whose registered claims have their RFC 7519 types. That type is not checked at runtime: only the
 * registered claims are, so a claim the token lacks or holds with another type still reaches your code as
 * typed. Give a schema when the payload's other claims must be checked.
 *
 * @typeParam TSchema - The Standard Schema given as `options.claims`, which types the verified payload.
 * @param options - Where keys come from and which claims to require; see {@link VerifierOptions}.
 * @returns A {@link Verifier}. It resolves to the frozen `{ header, payload, key }`, or to a failure and
 * never throws for any token. A key set whose `select` throws or rejects, or returns something other than
 * a result holding a public or secret key this package created, makes the verifier fail with
 * `key_fetch_failed` and `{ reason: "key_set_error" }`, except that a failed result whose issues each have
 * a string `code` is passed through. Caller code is not caught: a rejection from
 * `options.claims` propagates, and so does a `TypeError` when `options.now` returns something other than a
 * finite number, checked once per verification when the claims are checked, after the signature.
 * @throws TypeError when `options` is not an object; `options` has a member that is not an option, such as
 * a misspelled `audiance`; `keys` is neither a function nor an object with a `select` function; `issuer` or `subject` is neither a non-empty string nor a
 * non-empty array of them; `audience` is neither `false` nor one of those; `type` is neither a non-empty
 * string other than `application/` nor a non-empty array of such strings and `null`;
 * `requireExpiration` or `allowExpired` is not a boolean; `clockTolerance` is not an integer from 0
 * through 300; `maxAge` is not a positive integer;
 * `maxLength` is not an integer from 1 through 65536; `requiredClaims` is not an array of non-empty
 * strings; `claims` is not a version 1 Standard Schema; `now` is not a function; or `onKeySetError` is not a
 * function.
 */
export function createVerifier<TSchema extends StandardSchemaV1>(
  options: VerifierOptions<TSchema> & { readonly claims: TSchema },
): Verifier<VerifiedPayload<TSchema>>;
/**
 * Creates a verifier whose payload type is given rather than inferred from a `claims` schema; see the
 * overload above for everything it checks. Options whose `claims` may or may not be set also come here.
 *
 * @typeParam TPayload - The verified payload's type, unchecked at runtime beyond the registered claims: an
 * object type, an `interface` included, whose registered claims have their RFC 7519 types.
 * @param options - Where keys come from and which claims to require; see {@link VerifierOptions}.
 * @returns A {@link Verifier} whose payload is typed `TPayload`.
 * @throws TypeError for the invalid options the overload above lists.
 */
export function createVerifier<TPayload extends JwtRegisteredClaims = JwtPayload>(
  options: VerifierOptions<StandardSchemaV1 | undefined>,
): Verifier<TPayload>;
export function createVerifier(options: VerifierOptions<StandardSchemaV1 | undefined>): Verifier<JwtPayload> {
  const resolved = resolveOptions(options);
  const report = reporterOf(resolved.onKeySetError);
  return async (token) => {
    const parsed = parseCompact(token, resolved.maxLength);
    if (!parsed.ok) {
      return parsed;
    }
    const jws = parsed.value;
    let early: JwtPayload | undefined;
    let keys: KeySet;
    let checks: ResolvedOptions = resolved;
    if (typeof resolved.keys === "function") {
      const routed = await routeByIssuer(resolved.keys, jws, resolved.issuers, report);
      if ("error" in routed) {
        return routed;
      }
      ({ keys, payload: early } = routed);
      checks = routed.checks === undefined ? resolved : { ...resolved, ...routed.checks };
    } else {
      keys = resolved.keys;
    }
    const selected = await selectKey(keys, jws.header, report);
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
    const payload = early === undefined ? parsePayload(jws) : frozenOk(early);
    if (!payload.ok) {
      return payload;
    }
    const claimIssues = checkClaims(jws.header, payload.value, checks, key);
    const issues: JwtIssue[] =
      claimIssues.length === 0 && resolved.claims !== undefined
        ? await schemaIssues(resolved.claims, payload.value)
        : claimIssues;
    if (issues.length > 0) {
      return fail(...(issues as [JwtIssue, ...JwtIssue[]]));
    }
    // The header and payload come deep-frozen from the parser and the key frozen from its registration, so
    // only the new objects are frozen: `ok` would walk the whole token again.
    const verified: VerifiedJwt = Object.freeze({ header: jws.header, payload: payload.value, key });
    return frozenOk(verified);
  };
}

/**
 * Reads the claimed `iss` of a token whose signature is not checked yet, only to ask the caller's resolver for
 * that issuer's key set (scope.md decision 47). The payload is never returned unless the signature then
 * verifies; the issuer read here is the one the claim checks see, since both come from the same bytes.
 */
async function routeByIssuer(
  resolver: KeySetResolver,
  jws: CompactJws,
  issuers: readonly string[] | undefined,
  report: Reporter,
): Promise<IssuerRoute | JwtErr> {
  const payload = parsePayload(jws);
  if (!payload.ok) {
    return payload;
  }
  if (!Object.hasOwn(payload.value, "iss")) {
    return MISSING_ISSUER;
  }
  const iss = payload.value.iss;
  if (typeof iss !== "string") {
    return INVALID_ISSUER;
  }
  // An issuer the verifier refuses anyway never reaches the resolver.
  if (issuers !== undefined && !issuers.includes(iss)) {
    return WRONG_ISSUER;
  }
  let returned: unknown;
  try {
    returned = await resolver(iss, jws.header);
  } catch (error) {
    return report(error);
  }
  if (returned === undefined) {
    return WRONG_ISSUER;
  }
  try {
    // Read inside the `try`: a getter or Proxy trap on what the resolver returned can throw.
    if (isKeySet(returned)) {
      // Not wrapped in `ok`, which would deep-freeze the caller's key set and any state it keeps.
      return { keys: returned, payload: payload.value, checks: undefined };
    }
    const route = returned as { keys?: unknown; audience?: unknown; type?: unknown } | null;
    if (typeof route !== "object" || route === null || !isKeySet(route.keys)) {
      return report(new TypeError(NOT_A_KEY_SET));
    }
    const checks = readRouteChecks(route);
    return { keys: route.keys, payload: payload.value, checks };
  } catch (error) {
    return report(error);
  }
}

const NOT_A_KEY_SET = "The keys function returned something other than a key set, a route or undefined.";

function isKeySet(value: unknown): value is KeySet {
  return typeof value === "object" && value !== null && typeof (value as { select?: unknown }).select === "function";
}

/** The key set a resolver chose for a token, the payload already read to choose it, and the route's checks. */
interface IssuerRoute {
  readonly keys: KeySet;
  readonly payload: JwtPayload;
  readonly checks: Pick<ResolvedOptions, "audiences" | "types"> | undefined;
}

/** Hands a key set's error to `onKeySetError` and returns the `key_set_error` failure. */
export type Reporter = (error: unknown) => typeof KEY_SET_ERROR;

export function reporterOf(onKeySetError: ((error: unknown) => void) | undefined): Reporter {
  return (error) => {
    if (onKeySetError !== undefined) {
      try {
        const result: unknown = onKeySetError(error);
        if (result instanceof Promise) {
          void ignoreRejection(result);
        }
      } catch {
        // Deliberately ignored: the hook only observes the failure.
      }
    }
    return KEY_SET_ERROR;
  };
}

export async function ignoreRejection(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // Deliberately ignored: the hook only observes the failure.
  }
}

/**
 * Asks the key set for the header's key. A key set is caller code, so whatever it does wrong, throwing
 * included, becomes a `key_set_error` failure rather than an exception or an unchecked key.
 */
export async function selectKey(
  keys: KeySet,
  header: JwtHeader,
  report: Reporter,
): Promise<JwtResult<VerificationKey>> {
  try {
    const result: unknown = await keys.select(header);
    if (typeof result !== "object" || result === null) {
      return report(new TypeError("The key set's select returned something other than a result."));
    }
    // Read inside the `try` as well: a getter or Proxy trap on the result can throw too.
    const { ok: isOk, value, error } = result as { ok?: unknown; value?: unknown; error?: { issues?: unknown } };
    if (isOk === true) {
      return isRegisteredKey(value) && value.kind !== "private"
        ? frozenOk(value)
        : report(
            new TypeError("The key set's select returned a value that is not a public or secret key of this package."),
          );
    }
    const issues = isOk === false ? error?.issues : undefined;
    // Copied by index, so a hole becomes `undefined` and fails the check; `every` would skip it.
    const list = Array.isArray(issues) ? Array.from({ length: issues.length }, (_, index) => issues[index]) : [];
    return list.length > 0 && list.every(hasStringCode)
      ? fail(...(list as [JwtIssue, ...JwtIssue[]]))
      : report(new TypeError("The key set's select returned a failure without issues that each have a string code."));
  } catch (error) {
    return report(error);
  }
}

/** Whether `issue` is an object with an own data property `code` holding a string; a getter does not count. */
function hasStringCode(issue: unknown): boolean {
  if (typeof issue !== "object" || issue === null) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(issue, "code");
  return descriptor !== undefined && typeof descriptor.value === "string";
}
