import type { AsymmetricAlgorithm, JwtIssue } from "../core/types";
import { decodeBase64Url } from "../encoding";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportWebCryptoJwk } from "./exported-jwk";

/**
 * Longest PEM text read, in characters. A PKCS#8 RSA 8192-bit key, the largest this package imports, is
 * about 6.4 KB; the cap keeps a hostile string from being scanned or decoded at any length.
 */
export const MAX_PEM_LENGTH = 16_384;

/**
 * One PEM block (RFC 7468 §2) and nothing else around it but whitespace: its label, then base64 lines.
 * The label must match on both ends, and only the two labels Web Crypto reads are recognized.
 */
const PEM_PATTERN =
  /^-----BEGIN (PUBLIC KEY|PRIVATE KEY)-----\r?\n((?:[A-Za-z0-9+/=]+\r?\n)+)-----END (PUBLIC KEY|PRIVATE KEY)-----$/;

/** Standard base64 with canonical padding (RFC 4648 §4). */
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** A PEM key read as a JWK, or the one issue that refuses it. */
export type PemResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issue: JwtIssue };

/** The JWK members Web Crypto adds on export that say nothing about the material. */
const EXPORT_METADATA = ["alg", "ext", "key_ops", "use"] as const;

/**
 * Reads a PEM `PUBLIC KEY` (SPKI) or `PRIVATE KEY` (PKCS#8) as the JWK of its material, for the JWK checks
 * to run on exactly as on a JWK given directly. Web Crypto parses the DER: it is imported for `alg`, and
 * exported again as a JWK.
 *
 * @returns The JWK, with `kid` when one is given; `unexpected_private_key` for a private key where a public
 * one is expected; otherwise `invalid_key` for anything that is not one well-formed block of the expected
 * label holding a key of `alg`'s type. Never throws, and an issue never quotes the input.
 */
export async function pemToJwk(
  pem: string,
  alg: AsymmetricAlgorithm,
  role: "public" | "private",
  kid: string | undefined,
): Promise<PemResult> {
  const invalid: PemResult = { ok: false, issue: { code: "invalid_key" } };
  if (pem.length > MAX_PEM_LENGTH) {
    return invalid;
  }
  const match = PEM_PATTERN.exec(pem.trim());
  const [, label, body, endLabel] = match ?? [];
  if (label === undefined || body === undefined || label !== endLabel) {
    return invalid;
  }
  if (label === "PRIVATE KEY" && role === "public") {
    return { ok: false, issue: { code: "unexpected_private_key" } };
  }
  if (label === "PUBLIC KEY" && role === "private") {
    return invalid;
  }
  const base64 = body.replace(/\r?\n/g, "");
  const der = BASE64_PATTERN.test(base64)
    ? decodeBase64Url(base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""))
    : undefined;
  if (der === undefined || der.length === 0) {
    return invalid;
  }
  try {
    const { importParams } = ALGORITHM_PARAMS[alg];
    const format = role === "public" ? "spki" : "pkcs8";
    const cryptoKey = await crypto.subtle.importKey(format, der, importParams, true, [
      role === "public" ? "verify" : "sign",
    ]);
    const jwk: Record<string, unknown> = { ...(await exportWebCryptoJwk(cryptoKey, alg)) };
    for (const name of EXPORT_METADATA) {
      delete jwk[name];
    }
    return { ok: true, value: kid === undefined ? jwk : { ...jwk, kid } };
  } catch {
    // Web Crypto rejects DER it cannot read or a key of another type or curve; its message may quote it.
    return invalid;
  }
}
