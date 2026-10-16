const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Not a base64url character. */
const INVALID = -1;

/** The 6-bit value of a base64url character code, or {@link INVALID}. Arithmetic, so no table is built. */
function sextet(code: number): number {
  if (code >= 0x41 && code <= 0x5a) {
    return code - 0x41;
  }
  if (code >= 0x61 && code <= 0x7a) {
    return code - 0x61 + 26;
  }
  if (code >= 0x30 && code <= 0x39) {
    return code - 0x30 + 52;
  }
  if (code === 0x2d) {
    return 62;
  }
  return code === 0x5f ? 63 : INVALID;
}

/**
 * Bits of the last character that encode no byte, by the length of the final group: 2 characters carry
 * one byte and 4 spare bits, 3 carry two bytes and 2 spare bits.
 */
const SPARE_BITS_MASK: Readonly<Record<number, number>> = { 2: 0b1111, 3: 0b11 };

/**
 * Tests whether text is canonical unpadded base64url (RFC 7515 §2): only `A-Z a-z 0-9 - _`, no `=`, a
 * length that is not 1 more than a multiple of 4, and zero in the spare bits of the last character, so
 * each byte string has exactly one encoding. The empty string is valid and encodes no bytes.
 */
export function isBase64Url(text: string): boolean {
  if (text.length % 4 === 1) {
    return false;
  }
  for (let index = 0; index < text.length; index++) {
    if (sextet(text.charCodeAt(index)) === INVALID) {
      return false;
    }
  }
  const mask = SPARE_BITS_MASK[text.length % 4];
  return mask === undefined || (sextet(text.charCodeAt(text.length - 1)) & mask) === 0;
}

/** Decodes canonical unpadded base64url, as {@link isBase64Url} defines it, or returns undefined for anything else. */
export function decodeBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!isBase64Url(text)) {
    return undefined;
  }
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bufferedBits = 0;
  let written = 0;
  for (let index = 0; index < text.length; index++) {
    buffer = ((buffer << 6) | sextet(text.charCodeAt(index))) & 0xffffff;
    bufferedBits += 6;
    if (bufferedBits >= 8) {
      bufferedBits -= 8;
      bytes[written++] = (buffer >> bufferedBits) & 0xff;
    }
  }
  return bytes;
}

/** Encodes bytes as unpadded base64url. */
export function encodeBase64Url(bytes: Uint8Array): string {
  let text = "";
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const group = ((bytes[index] as number) << 16) | ((bytes[index + 1] as number) << 8) | (bytes[index + 2] as number);
    text +=
      ALPHABET.charAt(group >> 18) +
      ALPHABET.charAt((group >> 12) & 63) +
      ALPHABET.charAt((group >> 6) & 63) +
      ALPHABET.charAt(group & 63);
  }
  const remaining = bytes.length - index;
  if (remaining === 1) {
    const group = (bytes[index] as number) << 16;
    text += ALPHABET.charAt(group >> 18) + ALPHABET.charAt((group >> 12) & 63);
  } else if (remaining === 2) {
    const group = ((bytes[index] as number) << 16) | ((bytes[index + 1] as number) << 8);
    text += ALPHABET.charAt(group >> 18) + ALPHABET.charAt((group >> 12) & 63) + ALPHABET.charAt((group >> 6) & 63);
  }
  return text;
}
