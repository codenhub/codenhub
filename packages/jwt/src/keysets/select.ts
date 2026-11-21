import { fail, ok } from "../core";
import type { JwtResult } from "../core/types";

/** What selection reads of a key: a JWS verification key, or a JWE key, of either kind. */
export interface SelectableKey {
  readonly alg: string;
  readonly kid?: string;
}

/** What selection reads of a header or a query: its `alg` and `kid`, whatever their type. */
export interface SelectionQuery {
  readonly alg?: unknown;
  readonly kid?: unknown;
}

const UNKNOWN_KID = fail({ code: "unknown_kid", path: ["header", "kid"] });
const ALG_MISMATCH = fail({ code: "alg_mismatch", path: ["header", "alg"] });
const NO_MATCHING_KEY = fail({ code: "no_matching_key" });
const AMBIGUOUS_KEY = fail({ code: "ambiguous_key" });

/**
 * Picks the one key for a header from `keys`, shared by local and remote key sets.
 *
 * With a `kid`, only keys with that `kid` are candidates and exactly one of them must have the header's
 * `alg`. When no key has that `kid`, a key without any `kid` stands in, as a PEM key has none: exactly one
 * such key must have the header's `alg`, or the `kid` is unknown. Without a `kid` in the header, exactly
 * one key in the set must have the `alg`. Keys are never tried in turn. A secret
 * key only matches `HS256` and a public key only its own algorithm, since both follow from `alg`
 * equality. Never throws, whatever `header` holds.
 */
export function selectKey<TKey extends SelectableKey>(keys: readonly TKey[], header: SelectionQuery): JwtResult<TKey> {
  if (typeof header !== "object" || header === null) {
    return NO_MATCHING_KEY;
  }
  let alg: unknown;
  let kid: unknown;
  try {
    ({ alg, kid } = header);
  } catch {
    // A getter or Proxy trap on a caller's header can throw; no key matches such a header.
    return NO_MATCHING_KEY;
  }
  if (kid !== undefined) {
    const candidates = keys.filter((key) => key.kid === kid);
    if (candidates.length === 0) {
      const unnamed = keys.filter((key) => key.kid === undefined && key.alg === alg);
      return typeof kid === "string" && unnamed.length > 0 ? single(unnamed, UNKNOWN_KID) : UNKNOWN_KID;
    }
    return single(
      candidates.filter((key) => key.alg === alg),
      ALG_MISMATCH,
    );
  }
  return single(
    keys.filter((key) => key.alg === alg),
    NO_MATCHING_KEY,
  );
}

function single<TKey>(candidates: readonly TKey[], whenNone: JwtResult<never>): JwtResult<TKey> {
  if (candidates.length === 0) {
    return whenNone;
  }
  return candidates.length === 1 ? ok(candidates[0] as TKey) : AMBIGUOUS_KEY;
}

/**
 * Whether the header names a `kid` that no key in `keys` carries, so a refetch may bring it, whatever
 * the selection gave: `unknown_kid`, a key without a `kid` standing in, or several such keys.
 */
export function lacksKid(keys: readonly SelectableKey[], header: SelectionQuery): boolean {
  if (typeof header !== "object" || header === null) {
    return false;
  }
  try {
    const { kid } = header;
    return kid !== undefined && !keys.some((key) => key.kid === kid);
  } catch {
    return false;
  }
}
