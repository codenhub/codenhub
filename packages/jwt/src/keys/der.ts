/** The few DER (ITU-T X.690) reads and writes the PEM formats need; nothing here parses a whole ASN.1 module. */

export const DER_INTEGER = 0x02;
export const DER_BIT_STRING = 0x03;
export const DER_OCTET_STRING = 0x04;
export const DER_NULL = 0x05;
export const DER_OID = 0x06;
export const DER_SEQUENCE = 0x30;
/** `[0] EXPLICIT`, such as a certificate's version or an `ECPrivateKey`'s parameters. */
export const DER_CONTEXT_0 = 0xa0;
/** `[1] EXPLICIT`, such as an `ECPrivateKey`'s public key. */
export const DER_CONTEXT_1 = 0xa1;

/** Longest DER length field read, in bytes; four already exceed any PEM this package accepts. */
const MAX_DER_LENGTH_BYTES = 4;

export interface DerElement {
  readonly tag: number;
  readonly start: number;
  readonly contentStart: number;
  readonly end: number;
}

/**
 * Reads the DER element at `offset`, which must end by `limit`; `undefined` for anything malformed. With
 * `isStrict`, a length must also be in its shortest form, as DER requires.
 */
export function readElement(der: Uint8Array, offset: number, limit: number, isStrict = false): DerElement | undefined {
  if (offset + 2 > limit) {
    return undefined;
  }
  const tag = der[offset] as number;
  const first = der[offset + 1] as number;
  let length = first;
  let contentStart = offset + 2;
  if (first >= 0x80) {
    const count = first & 0x7f;
    if (count === 0 || count > MAX_DER_LENGTH_BYTES || contentStart + count > limit) {
      return undefined;
    }
    if (isStrict && der[contentStart] === 0) {
      return undefined;
    }
    length = 0;
    for (let index = 0; index < count; index++) {
      length = length * 256 + (der[contentStart + index] as number);
    }
    if (isStrict && length < 0x80) {
      return undefined;
    }
    contentStart += count;
  }
  const end = contentStart + length;
  return end > limit ? undefined : { tag, start: offset, contentStart, end };
}

/** One DER element of `tag` holding `content`, its length in the shortest form. */
export function encodeElement(tag: number, ...content: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const length = content.reduce((total, part) => total + part.length, 0);
  const lengthBytes: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) {
    lengthBytes.unshift(rest % 256);
  }
  const header = length < 0x80 ? [tag, length] : [tag, 0x80 | lengthBytes.length, ...lengthBytes];
  const bytes = new Uint8Array(header.length + length);
  bytes.set(header);
  let offset = header.length;
  for (const part of content) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/** The content of an element as lowercase hex, to compare an OID against the known ones. */
export function contentHex(der: Uint8Array, element: DerElement): string {
  let hex = "";
  for (let index = element.contentStart; index < element.end; index++) {
    hex += (der[index] as number).toString(16).padStart(2, "0");
  }
  return hex;
}

/** OID contents, as hex, of the key algorithms and curves read from SPKI, PKCS#8 and SEC 1. */
export const OID = {
  /** 1.2.840.113549.1.1.1 */
  rsaEncryption: "2a864886f70d010101",
  /** 1.2.840.113549.1.1.10 */
  rsassaPss: "2a864886f70d01010a",
  /** 1.2.840.10045.2.1 */
  ecPublicKey: "2a8648ce3d0201",
  /** 1.3.101.112 */
  ed25519: "2b6570",
  /** 1.2.840.10045.3.1.7 */
  p256: "2a8648ce3d030107",
  /** 1.3.132.0.34 */
  p384: "2b81040022",
  /** 1.3.132.0.35 */
  p521: "2b81040023",
} as const;

/** The JWK `crv` of each named-curve OID. */
export const CURVE_BY_OID: Readonly<Record<string, string>> = {
  [OID.p256]: "P-256",
  [OID.p384]: "P-384",
  [OID.p521]: "P-521",
};

/** Bytes of a hex string written in this module, such as an OID above. */
export function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
