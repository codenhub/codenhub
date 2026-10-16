// Helpers for the conformance suites. They build tokens the way an attacker would, with Web Crypto
// directly, so a forged token never depends on the code under test.

import type { JwtIssue } from "../../src";

/** Base64url of raw bytes, without padding. */
export const base64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

/** Base64url of UTF-8 text, without padding. */
export const segmentOf = (text: string): string => base64Url(new TextEncoder().encode(text));

/** The failure a verifier or importer returns for these issues. */
export const failure = (...issues: JwtIssue[]) => ({ ok: false, error: { issues } });

/** Replaces one segment of a compact token. */
export const withSegment = (token: string, index: number, segment: string): string => {
  const segments = token.split(".");
  segments[index] = segment;
  return segments.join(".");
};

/** Flips the lowest bit of the first signature byte. */
export const flipSignatureBit = (token: string): string => {
  const signature = Buffer.from(token.split(".")[2] as string, "base64url");
  signature[0] = (signature[0] as number) ^ 1;
  return withSegment(token, 2, base64Url(signature));
};

/** Web Crypto parameters for each algorithm, as an attacker holding the key material would use them. */
const RAW_ALGORITHMS = {
  HS256: { import: { name: "HMAC", hash: "SHA-256" }, sign: { name: "HMAC" } },
  RS256: { import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, sign: { name: "RSASSA-PKCS1-v1_5" } },
  PS256: { import: { name: "RSA-PSS", hash: "SHA-256" }, sign: { name: "RSA-PSS", saltLength: 32 } },
  ES256: { import: { name: "ECDSA", namedCurve: "P-256" }, sign: { name: "ECDSA", hash: "SHA-256" } },
  Ed25519: { import: { name: "Ed25519" }, sign: { name: "Ed25519" } },
} as const;

export type RawAlgorithm = keyof typeof RAW_ALGORITHMS;

/** Drops the members that bind a JWK to one algorithm, as an attacker reusing the material would. */
const withoutBinding = ({ alg: _alg, use: _use, key_ops: _keyOps, ...material }: JsonWebKey): JsonWebKey => material;

/** Signs `signingInput` with raw key material, outside the package. */
export async function rawSign(algorithm: RawAlgorithm, material: JsonWebKey | Uint8Array, signingInput: string) {
  const { import: importParams, sign: signParams } = RAW_ALGORITHMS[algorithm];
  const cryptoKey =
    material instanceof Uint8Array
      ? await crypto.subtle.importKey("raw", Uint8Array.from(material), importParams, false, ["sign"])
      : await crypto.subtle.importKey("jwk", withoutBinding(material), importParams, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign(signParams, cryptoKey, new TextEncoder().encode(signingInput)));
}

/** A compact token over arbitrary header and payload text, signed outside the package. */
export async function forge(
  algorithm: RawAlgorithm,
  material: JsonWebKey | Uint8Array,
  header: string,
  payload: string,
): Promise<string> {
  const signingInput = `${segmentOf(header)}.${segmentOf(payload)}`;
  return `${signingInput}.${base64Url(await rawSign(algorithm, material, signingInput))}`;
}
