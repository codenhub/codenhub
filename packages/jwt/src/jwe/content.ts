import { CONTENT_PARAMS } from "./algorithms";
import type { ContentEncryptionAlgorithm } from "./types";

/**
 * A content key as Web Crypto holds it: one AES-GCM key, or for CBC-HMAC the two keys RFC 7518 §5.2.2.1 splits
 * the content key into, MAC_KEY (the first half) for HMAC and ENC_KEY (the second) for AES-CBC.
 */
export type ContentKey =
  | { readonly mode: "gcm"; readonly key: CryptoKey }
  | { readonly mode: "cbc"; readonly macKey: CryptoKey; readonly encKey: CryptoKey };

/** The three segments content encryption produces. */
export interface EncryptedContent {
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly ciphertext: Uint8Array<ArrayBuffer>;
  readonly tag: Uint8Array<ArrayBuffer>;
}

/**
 * Imports raw content key bytes for `enc`. The caller has checked the length is the one `enc` needs.
 *
 * @param extractable - Whether the bytes may be exported again, for a `dir` key that may be exported.
 */
export async function importContentKey(
  enc: ContentEncryptionAlgorithm,
  bytes: Uint8Array<ArrayBuffer>,
  extractable: boolean,
): Promise<ContentKey> {
  const params = CONTENT_PARAMS[enc];
  if (params.hash === undefined) {
    const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", extractable, ["encrypt", "decrypt"]);
    return Object.freeze({ mode: "gcm", key });
  }
  const half = params.keyBytes / 2;
  const [macKey, encKey] = await Promise.all([
    crypto.subtle.importKey("raw", bytes.slice(0, half), { name: "HMAC", hash: params.hash }, extractable, ["sign"]),
    crypto.subtle.importKey("raw", bytes.slice(half), "AES-CBC", extractable, ["encrypt", "decrypt"]),
  ]);
  return Object.freeze({ mode: "cbc", macKey, encKey });
}

/** Exports an extractable content key back to its raw bytes, MAC_KEY ‖ ENC_KEY for CBC-HMAC. */
export async function exportContentKey(key: ContentKey): Promise<Uint8Array<ArrayBuffer>> {
  if (key.mode === "gcm") {
    return new Uint8Array(await crypto.subtle.exportKey("raw", key.key));
  }
  const [mac, enc] = await Promise.all([
    crypto.subtle.exportKey("raw", key.macKey),
    crypto.subtle.exportKey("raw", key.encKey),
  ]);
  return concatBytes(new Uint8Array(mac), new Uint8Array(enc));
}

/**
 * Encrypts the plaintext with a fresh random IV (RFC 7516 §5.1 steps 9–15).
 *
 * @param aad - The ASCII bytes of the encoded protected header, which the tag covers.
 */
export async function encryptContent(
  enc: ContentEncryptionAlgorithm,
  key: ContentKey,
  plaintext: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
): Promise<EncryptedContent> {
  const params = CONTENT_PARAMS[enc];
  const iv = crypto.getRandomValues(new Uint8Array(params.ivBytes));
  if (key.mode === "gcm") {
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key.key, plaintext),
    );
    const split = sealed.length - params.tagBytes;
    return { iv, ciphertext: sealed.slice(0, split), tag: sealed.slice(split) };
  }
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key.encKey, plaintext));
  const tag = await cbcTag(key.macKey, aad, iv, ciphertext, params.tagBytes);
  return { iv, ciphertext, tag };
}

/**
 * Checks the tag and decrypts. Every failure, a wrong tag, wrong padding or a key of another algorithm, is the
 * same `undefined`, so no caller can tell them apart (RFC 7516 §11.5). The caller has checked the IV and tag
 * lengths.
 */
export async function decryptContent(
  enc: ContentEncryptionAlgorithm,
  key: ContentKey,
  segments: EncryptedContent,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const params = CONTENT_PARAMS[enc];
  const { iv, ciphertext, tag } = segments;
  try {
    if (key.mode === "gcm") {
      const sealed = concatBytes(ciphertext, tag);
      return new Uint8Array(
        await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key.key, sealed),
      );
    }
    // AES-CBC with PKCS#7 padding never yields an empty or partial block.
    if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) {
      return undefined;
    }
    const expected = await cbcTag(key.macKey, aad, iv, ciphertext, params.tagBytes);
    // The tag is checked before any decryption, so a padding error is never reached for a forged token.
    if (!constantTimeEqual(expected, tag)) {
      return undefined;
    }
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key.encKey, ciphertext));
  } catch {
    // Web Crypto's message may name the failure; every failure is the same one.
    return undefined;
  }
}

/** RFC 7518 §5.2.2.1: the first half of HMAC(MAC_KEY, A ‖ IV ‖ E ‖ AL), AL being A's length in bits, 64-bit big-endian. */
async function cbcTag(
  macKey: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>,
  ciphertext: Uint8Array<ArrayBuffer>,
  tagBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const al = new Uint8Array(8);
  const bits = aad.length * 8;
  const view = new DataView(al.buffer);
  view.setUint32(0, Math.floor(bits / 2 ** 32));
  view.setUint32(4, bits >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", macKey, concatBytes(aad, iv, ciphertext, al)));
  return mac.slice(0, tagBytes);
}

/** Compares two byte arrays in time that depends only on their lengths. */
export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] as number) ^ (right[index] as number);
  }
  return difference === 0;
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}
