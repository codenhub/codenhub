// Test-only helpers for the verifier tests. Never import from package code.

import { ok } from "../core/result";
import type { JwtIssue, KeySet, SigningKey, VerificationKey } from "../core/types";
import { encodeBase64Url } from "../encoding/base64url";
import { ALGORITHM_PARAMS } from "../keys/algorithms";
import { getKeyEntry } from "../keys/registry";

/** The injected clock's time, in seconds since the Unix epoch. */
export const NOW_SECONDS = 1_800_000_000;

/** A clock fixed `offsetSeconds` after {@link NOW_SECONDS}. */
export const clockAt =
  (offsetSeconds = 0): (() => number) =>
  () =>
    (NOW_SECONDS + offsetSeconds) * 1000;

/** A key set that hands out `key` for any header, as a careless custom key set might. */
export const keySetOf = (key: VerificationKey): KeySet => ({ select: async () => ok(key) });

export const segmentOf = (text: string): string => encodeBase64Url(new TextEncoder().encode(text));

/** The failure a verifier returns for these issues. */
export const failure = (...issues: JwtIssue[]) => ({ ok: false, error: { issues } });

/**
 * Signs arbitrary header and payload text with `key`'s own algorithm, whatever the header says, as an
 * attacker holding the key material could.
 */
export async function signRaw(key: SigningKey, header: string, payload: string): Promise<string> {
  const signingInput = `${segmentOf(header)}.${segmentOf(payload)}`;
  const signature = await crypto.subtle.sign(
    ALGORITHM_PARAMS[key.alg].signParams,
    getKeyEntry(key).cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}
