import { describe, expect, it } from "vitest";

import { isOnNistCurve } from "./on-curve";

type NistCurve = "P-256" | "P-384" | "P-521";

const hex = (value: string): Uint8Array => Uint8Array.from(Buffer.from(value, "hex"));

const toHex = (value: bigint, bytes: number): string => value.toString(16).padStart(bytes * 2, "0");

/** Each curve's generator (FIPS 186-4 §D.1.2, SEC 2 §2.4.2, §2.5.1, §2.6.1), field prime and coordinate length. */
const CURVES: readonly (readonly [NistCurve, { gx: string; gy: string; p: bigint; bytes: number }])[] = [
  [
    "P-256",
    {
      gx: "6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296",
      gy: "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5",
      p: 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n,
      bytes: 32,
    },
  ],
  [
    "P-384",
    {
      gx: "aa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7",
      gy: "3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f",
      p: 2n ** 384n - 2n ** 128n - 2n ** 96n + 2n ** 32n - 1n,
      bytes: 48,
    },
  ],
  [
    "P-521",
    {
      gx: "00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66",
      gy: "011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650",
      p: 2n ** 521n - 1n,
      bytes: 66,
    },
  ],
];

describe("isOnNistCurve", () => {
  it.each(CURVES)("should accept the %s generator", (curve, { gx, gy }) => {
    expect(isOnNistCurve(curve, hex(gx), hex(gy))).toBe(true);
  });

  it.each(CURVES)("should accept every %s public key Web Crypto generates", async (curve) => {
    const jwks = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: curve }, true, [
          "deriveBits",
        ])) as CryptoKeyPair;
        return crypto.subtle.exportKey("jwk", pair.publicKey);
      }),
    );

    for (const { x, y } of jwks) {
      expect(isOnNistCurve(curve, Buffer.from(x as string, "base64url"), Buffer.from(y as string, "base64url"))).toBe(
        true,
      );
    }
  });

  it.each(CURVES)("should refuse %s points off the curve", (curve, { gx, gy }) => {
    const flipped = hex(gy);
    flipped[flipped.length - 1] = (flipped[flipped.length - 1] as number) ^ 1;

    expect(isOnNistCurve(curve, hex(gx), hex(gx))).toBe(false);
    expect(isOnNistCurve(curve, hex(gx), flipped)).toBe(false);
    expect(isOnNistCurve(curve, hex(gy), hex(gx))).toBe(false);
  });

  it.each(CURVES)("should refuse a %s coordinate equal to p", (curve, { gx, gy, p, bytes }) => {
    expect(isOnNistCurve(curve, hex(toHex(p, bytes)), hex(gy))).toBe(false);
    expect(isOnNistCurve(curve, hex(gx), hex(toHex(p, bytes)))).toBe(false);
  });

  it("should refuse a P-521 coordinate that is on the curve only modulo p", () => {
    const [, { gx, gy, p, bytes }] = CURVES[2] as (typeof CURVES)[number];
    const wrapped = hex(toHex(BigInt(`0x${gx}`) + p, bytes));

    expect(isOnNistCurve("P-521", wrapped, hex(gy))).toBe(false);
  });
});
