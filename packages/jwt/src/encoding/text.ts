const ENCODER = new TextEncoder();

/** Encodes text as UTF-8 bytes. Text made only of ASCII, such as a compact token's signing input, maps one character per byte. */
export const encodeUtf8 = (text: string): Uint8Array<ArrayBuffer> => ENCODER.encode(text);

/**
 * Decodes UTF-8 bytes strictly, or returns undefined when they are not valid UTF-8. A leading byte order
 * mark is kept as U+FEFF rather than dropped, so it reaches the caller's parser as the stray character
 * it is.
 */
export function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
}
