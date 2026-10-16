const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const RANDOM_TOKEN_BYTES = 32;
const SIX_BIT_MASK = 0x3f;
const BIT_BUFFER_MASK = 0xffff;
const BITS_PER_BYTE = 8;
const BITS_PER_CHARACTER = 6;

const encoder = new TextEncoder();

/** Encodes bytes as unpadded base64url (RFC 4648 §5). */
export function encodeBase64Url(bytes: Uint8Array): string {
  // Bit-by-bit instead of `btoa`, which is not available in every runtime this package supports.
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << BITS_PER_BYTE) | byte) & BIT_BUFFER_MASK;
    bits += BITS_PER_BYTE;
    while (bits >= BITS_PER_CHARACTER) {
      bits -= BITS_PER_CHARACTER;
      output += BASE64URL_ALPHABET[(buffer >> bits) & SIX_BIT_MASK];
    }
  }
  if (bits > 0) {
    output += BASE64URL_ALPHABET[(buffer << (BITS_PER_CHARACTER - bits)) & SIX_BIT_MASK];
  }
  return output;
}

/** Returns a 256-bit random token, base64url-encoded to 43 characters, from the Web Crypto RNG. */
export function randomToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(RANDOM_TOKEN_BYTES)));
}

/** Returns the SHA-256 digest of the UTF-8 bytes of `text`. */
export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/** Returns the base64url SHA-256 of `value`, the form used as a store key for codes and tokens. */
export async function digestKey(value: string): Promise<string> {
  return encodeBase64Url(await sha256(value));
}

/**
 * Tests whether two strings are equal without leaking, through timing, where they first differ.
 *
 * Returns false at once when the UTF-8 byte lengths differ, since lengths are not secret here.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
