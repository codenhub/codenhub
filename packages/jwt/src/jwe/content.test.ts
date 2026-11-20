import { describe, expect, it } from "vitest";

import { CONTENT_ENCRYPTION_ALGORITHMS, CONTENT_PARAMS } from "./algorithms";
import {
  concatBytes,
  constantTimeEqual,
  decryptContent,
  encryptContent,
  exportContentKey,
  importContentKey,
} from "./content";

const hex = (text: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(text.replace(/\s+/g, ""), "hex"));

// RFC 7518 Appendix B: the plaintext, IV and associated data shared by its test cases.
const P = hex(`41 20 63 69 70 68 65 72 20 73 79 73 74 65 6d 20 6d 75 73 74 20 6e 6f 74 20 62 65 20 72 65 71 75
  69 72 65 64 20 74 6f 20 62 65 20 73 65 63 72 65 74 2c 20 61 6e 64 20 69 74 20 6d 75 73 74 20 62
  65 20 61 62 6c 65 20 74 6f 20 66 61 6c 6c 20 69 6e 74 6f 20 74 68 65 20 68 61 6e 64 73 20 6f 66
  20 74 68 65 20 65 6e 65 6d 79 20 77 69 74 68 6f 75 74 20 69 6e 63 6f 6e 76 65 6e 69 65 6e 63 65`);
const IV = hex("1a f3 8c 2d c2 b9 6f fd d8 66 94 09 23 41 bc 04");
const A = hex(`54 68 65 20 73 65 63 6f 6e 64 20 70 72 69 6e 63 69 70 6c 65 20 6f 66 20 41 75 67 75 73 74 65 20
  4b 65 72 63 6b 68 6f 66 66 73`);

/** RFC 7518 Appendix B.1 (AES_128_CBC_HMAC_SHA_256) and B.3 (AES_256_CBC_HMAC_SHA_512). */
const CASES = [
  {
    enc: "A128CBC-HS256",
    K: hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
    E: hex(`c8 0e df a3 2d df 39 d5 ef 00 c0 b4 68 83 42 79 a2 e4 6a 1b 80 49 f7 92 f7 6b fe 54 b9 03 a9 c9
      a9 4a c9 b4 7a d2 65 5c 5f 10 f9 ae f7 14 27 e2 fc 6f 9b 3f 39 9a 22 14 89 f1 63 62 c7 03 23 36
      09 d4 5a c6 98 64 e3 32 1c f8 29 35 ac 40 96 c8 6e 13 33 14 c5 40 19 e8 ca 79 80 df a4 b9 cf 1b
      38 4c 48 6f 3a 54 c5 10 78 15 8e e5 d7 9d e5 9f bd 34 d8 48 b3 d6 95 50 a6 76 46 34 44 27 ad e5
      4b 88 51 ff b5 98 f7 f8 00 74 b9 47 3c 82 e2 db`),
    T: hex("65 2c 3f a3 6b 0a 7c 5b 32 19 fa b3 a3 0b c1 c4"),
  },
  {
    enc: "A256CBC-HS512",
    K: hex(
      "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f",
    ),
    E: hex(`4a ff aa ad b7 8c 31 c5 da 4b 1b 59 0d 10 ff bd 3d d8 d5 d3 02 42 35 26 91 2d a0 37 ec bc c7 bd
      82 2c 30 1d d6 7c 37 3b cc b5 84 ad 3e 92 79 c2 e6 d1 2a 13 74 b7 7f 07 75 53 df 82 94 10 44 6b
      36 eb d9 70 66 29 6a e6 42 7e a7 5c 2e 08 46 a1 1a 09 cc f5 37 0d c8 0b fe cb ad 28 c7 3f 09 b3
      a3 b7 5e 66 2a 25 94 41 0a e4 96 b2 e2 e6 60 9e 31 e6 e0 2c c8 37 f0 53 d2 1f 37 ff 4f 51 95 0b
      be 26 38 d0 9d d7 a4 93 09 30 80 6d 07 03 b1 f6`),
    T: hex(`4d d3 b4 c0 88 a7 f4 5c 21 68 39 64 5b 20 12 bf 2e 62 69 a8 c5 6a 81 6d bc 1b 26 77 61 95 5b c5`),
  },
] as const;

describe("AES-CBC-HMAC-SHA2", () => {
  it.each(CASES)("should decrypt the RFC 7518 Appendix B vector for $enc", async ({ enc, K, E, T }) => {
    const key = await importContentKey(enc, K, false);

    expect(await decryptContent(enc, key, { iv: IV, ciphertext: E, tag: T }, A)).toEqual(P);
  });

  it.each(CASES)(
    "should fail the $enc vector for any changed tag, ciphertext, IV or AAD byte",
    async ({ enc, K, E, T }) => {
      const key = await importContentKey(enc, K, false);
      const flip = (bytes: Uint8Array<ArrayBuffer>, index: number): Uint8Array<ArrayBuffer> => {
        const copy = bytes.slice();
        copy[index] = (copy[index] as number) ^ 0x80;
        return copy;
      };

      expect(await decryptContent(enc, key, { iv: IV, ciphertext: E, tag: flip(T, T.length - 1) }, A)).toBeUndefined();
      expect(await decryptContent(enc, key, { iv: IV, ciphertext: flip(E, 0), tag: T }, A)).toBeUndefined();
      expect(await decryptContent(enc, key, { iv: flip(IV, 0), ciphertext: E, tag: T }, A)).toBeUndefined();
      expect(await decryptContent(enc, key, { iv: IV, ciphertext: E, tag: T }, flip(A, 0))).toBeUndefined();
    },
  );

  it("should fail ciphertext that is empty or not whole blocks, even under a tag that matches it", async () => {
    const { enc, K } = CASES[0];
    const key = await importContentKey(enc, K, false);

    expect(
      await decryptContent(enc, key, { iv: IV, ciphertext: new Uint8Array(0), tag: CASES[0].T }, A),
    ).toBeUndefined();
    expect(
      await decryptContent(enc, key, { iv: IV, ciphertext: CASES[0].E.slice(0, 17), tag: CASES[0].T }, A),
    ).toBeUndefined();
  });

  it("should fail correctly tagged ciphertext whose padding is wrong", async () => {
    const { enc, K } = CASES[0];
    const key = await importContentKey(enc, K, false);
    // Encrypt a block with no padding by hand, then tag it correctly: the tag passes, the padding does not.
    const encKey = await crypto.subtle.importKey("raw", K.slice(16), "AES-CBC", false, ["encrypt"]);
    const twoBlocks = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-CBC", iv: IV }, encKey, new Uint8Array(16)),
    );
    const ciphertext = twoBlocks.slice(0, 16);
    const al = new Uint8Array(8);
    new DataView(al.buffer).setUint32(4, A.length * 8);
    const macKey = await crypto.subtle.importKey("raw", K.slice(0, 16), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", macKey, concatBytes(A, IV, ciphertext, al)));

    // The block decrypts to zeros, so its last byte is no valid PKCS#7 padding length.
    expect(await decryptContent(enc, key, { iv: IV, ciphertext, tag: mac.slice(0, 16) }, A)).toBeUndefined();
  });
});

describe("encryptContent", () => {
  it.each(CONTENT_ENCRYPTION_ALGORITHMS)("should round-trip %s with a fresh IV each time", async (enc) => {
    const params = CONTENT_PARAMS[enc];
    const key = await importContentKey(enc, crypto.getRandomValues(new Uint8Array(params.keyBytes)), true);
    const aad = new TextEncoder().encode("eyJhbGciOiJkaXIifQ");
    const first = await encryptContent(enc, key, P, aad);
    const second = await encryptContent(enc, key, P, aad);

    expect([first.iv.length, first.tag.length]).toEqual([params.ivBytes, params.tagBytes]);
    expect(first.iv).not.toEqual(second.iv);
    expect(await decryptContent(enc, key, first, aad)).toEqual(P);
    expect(await decryptContent(enc, key, first, new TextEncoder().encode("eyJhbGciOiJkaXIiff"))).toBeUndefined();
  });

  it.each(CONTENT_ENCRYPTION_ALGORITHMS)("should export the bytes %s was imported from", async (enc) => {
    const bytes = crypto.getRandomValues(new Uint8Array(CONTENT_PARAMS[enc].keyBytes));

    expect(await exportContentKey(await importContentKey(enc, bytes, true))).toEqual(bytes);
  });

  it("should encrypt an empty plaintext under GCM to an empty ciphertext that decrypts", async () => {
    const key = await importContentKey("A128GCM", new Uint8Array(16), false);
    const sealed = await encryptContent("A128GCM", key, new Uint8Array(0), new Uint8Array(0));

    expect(sealed.ciphertext).toHaveLength(0);
    expect(await decryptContent("A128GCM", key, sealed, new Uint8Array(0))).toEqual(new Uint8Array(0));
  });
});

describe("constantTimeEqual", () => {
  it("should compare bytes and lengths", () => {
    expect(constantTimeEqual(hex("0102"), hex("0102"))).toBe(true);
    expect(constantTimeEqual(hex("0102"), hex("0103"))).toBe(false);
    expect(constantTimeEqual(hex("0102"), hex("01"))).toBe(false);
    expect(constantTimeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});
