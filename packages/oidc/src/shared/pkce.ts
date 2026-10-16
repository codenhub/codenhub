import { digestKey } from "./encoding";

/** RFC 7636 §4.1: 43 to 128 characters from the unreserved set. */
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

/*
 * A base64url SHA-256 digest is 43 characters. The last one carries only 4 data bits, so its low 2 bits are
 * always zero, which leaves 16 possible final characters: A E I M Q U Y c g k o s w 0 4 8.
 */
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

/** Tests whether a value is a PKCE code verifier (RFC 7636 §4.1). */
export function isCodeVerifier(value: unknown): value is string {
  return typeof value === "string" && CODE_VERIFIER_PATTERN.test(value);
}

/** Tests whether a value has the shape of an S256 code challenge (RFC 7636 §4.2). */
export function isCodeChallenge(value: unknown): value is string {
  return typeof value === "string" && CODE_CHALLENGE_PATTERN.test(value);
}

/** Computes the S256 code challenge for a verifier: base64url of its SHA-256 digest. */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  return digestKey(verifier);
}
