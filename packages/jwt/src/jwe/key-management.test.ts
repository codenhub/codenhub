import { describe, expect, it } from "vitest";

import { decodeBase64Url, encodeBase64Url } from "../encoding/base64url";
import { concatKdf } from "./key-management";

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("concatKdf", () => {
  it("should derive the RFC 7518 Appendix C key", async () => {
    // RFC 7518 Appendix C: ECDH-ES for A128GCM, apu "Alice", apv "Bob".
    const z = new Uint8Array([
      158, 86, 217, 29, 129, 113, 53, 211, 114, 131, 66, 131, 191, 132, 38, 156, 251, 49, 110, 163, 218, 128, 106, 72,
      246, 218, 167, 121, 140, 254, 144, 196,
    ]);

    const key = await concatKdf(z, 16, "A128GCM", ascii("Alice"), ascii("Bob"));

    expect(encodeBase64Url(key)).toBe("VqqN6vgjbSBcIijNcacQGg");
  });

  it("should agree on Z with Web Crypto for the RFC 7518 Appendix C keys", async () => {
    const curve = { name: "ECDH", namedCurve: "P-256" } as const;
    const alice = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: "gI0GAILBdu7T53akrFmMyGcsF3n5dO7MmwNBHKW5SV0",
        y: "SLW_xSffzlPWrHEVI30DHM_4egVwt3NQqeUD7nMFpps",
      },
      curve,
      false,
      [],
    );
    const bob = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: "weNJy2HscCSM6AEDTDg04biOvhFhyyWvOHQfeF_PxMQ",
        y: "e8lnCO-AlStT-NJVX-crhB7QRYhiix03illJOVAOyck",
        d: "VEmDZpDXXK8p8N0Cndsxs924q6nS1RXFASRl6BfUqdw",
      },
      curve,
      false,
      ["deriveBits"],
    );
    const z = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: alice }, bob, 256));

    expect(encodeBase64Url(await concatKdf(z, 16, "A128GCM", ascii("Alice"), ascii("Bob")))).toBe(
      "VqqN6vgjbSBcIijNcacQGg",
    );
  });

  it("should derive keys longer than one SHA-256 block from consecutive counters", async () => {
    const z = decodeBase64Url("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") as Uint8Array;
    const long = await concatKdf(z, 64, "A256CBC-HS512", new Uint8Array(0), new Uint8Array(0));
    const other = await concatKdf(z, 64, "A128CBC-HS256", new Uint8Array(0), new Uint8Array(0));

    expect(long).toHaveLength(64);
    expect(long.slice(0, 32)).not.toEqual(long.slice(32));
    // The algorithm ID and the key length are both bound into the derivation.
    expect(long).not.toEqual(other);
  });
});
