import type { PrivateKey, PublicKey } from "../core/types";
import { getKeyEntryOfKind, kidMember, registerKey } from "./registry";

/** The public key handed out for each private key, so every call returns the same object. */
const publicKeys = new WeakMap<PrivateKey, PublicKey>();

/**
 * Returns the public half of a private key, bound to the same algorithm and carrying the same `kid`.
 *
 * @remarks
 * Every private key this package creates holds its public half, proven to match when the key was generated
 * or imported, also when the private key is not extractable. Use it when only the private key was loaded,
 * such as with {@link importPrivateKey}, to publish its JWK with {@link exportPublicJwk}, to verify your own
 * tokens, or to embed it in a DPoP proof. Each call for the same private key returns the same public key.
 *
 * @example
 * ```ts
 * const result = await importPrivateKey(env.SIGNING_KEY_PEM, { alg: "ES256", kid: "2026-11" });
 * if (!result.ok) throw new Error("The signing key could not be imported.");
 * const jwks = { keys: [await exportPublicJwk(getPublicKey(result.value))] };
 * ```
 *
 * @param key - A private key created by this package.
 * @returns The frozen public key.
 * @throws TypeError when `key` is not a private key created by this package.
 */
export function getPublicKey(key: PrivateKey): PublicKey {
  const entry = getKeyEntryOfKind(key, "private");
  const known = publicKeys.get(key);
  if (known !== undefined) {
    return known;
  }
  if (entry.publicCryptoKey === undefined) {
    // Every private key is registered with its public half; this guards the invariant, not a caller mistake.
    throw new TypeError("getPublicKey: key has no public half.");
  }
  const publicKey = registerKey<PublicKey>(
    { kind: "public", alg: key.alg, ...kidMember(key.kid) },
    { cryptoKey: entry.publicCryptoKey, signatureLength: entry.signatureLength },
  );
  publicKeys.set(key, publicKey);
  return publicKey;
}
