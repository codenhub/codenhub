import { digestKey, randomToken, timingSafeEqual } from "../shared/encoding";

/**
 * Generates a client secret for a confidential client.
 *
 * @remarks
 * The secret is 256 bits from the Web Crypto random number generator, base64url-encoded. Give it to the
 * client once, and store only {@link hashClientSecret} of it: the provider never needs the plaintext again.
 *
 * @returns A new random secret of 43 characters.
 */
export function generateClientSecret(): string {
  return randomToken();
}

/**
 * Hashes a client secret for storage in {@link ClientAuthentication}'s `secretHash`.
 *
 * @remarks
 * A single SHA-256 is enough here, and not a password hash such as bcrypt or scrypt, because the input is
 * a 256-bit random value that cannot be guessed or brute-forced; a slow hash would add cost and buy nothing.
 * That holds only for secrets from {@link generateClientSecret}. A human-chosen password must never be used
 * as a client secret, because this hash would then be cheap to attack offline.
 *
 * @param secret - The plaintext secret that was given to the client.
 * @returns The base64url SHA-256 digest of the secret's UTF-8 bytes.
 * @throws {TypeError} When `secret` is not a non-empty string.
 */
export async function hashClientSecret(secret: string): Promise<string> {
  if (typeof secret !== "string" || secret === "") {
    throw new TypeError("hashClientSecret: secret must be a non-empty string");
  }
  return digestKey(secret);
}

/** Tests a presented secret against a stored {@link hashClientSecret} digest, in time independent of the match. */
export async function verifyClientSecret(secret: string, secretHash: string): Promise<boolean> {
  return timingSafeEqual(await digestKey(secret), secretHash);
}
