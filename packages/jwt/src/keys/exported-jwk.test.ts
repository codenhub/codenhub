import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeBase64Url, encodeBase64Url } from "../encoding";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportPrivateJwk } from "./export";
import { importKeyPair, importPrivateKey } from "./import";
import { LEADING_ZERO_D_JWKS, valueOf } from "./test-fixtures";

const originalExportKey = crypto.subtle.exportKey.bind(crypto.subtle);

/**
 * Makes `exportKey` drop the leading zero bytes of `d`, as Playwright's WebKit on Windows does for P-256,
 * P-384 and P-521 keys (about half of P-521 keys, whose top byte holds one bit).
 */
function stripLeadingZerosOfD(): void {
  vi.spyOn(crypto.subtle, "exportKey").mockImplementation((async (format: KeyFormat, key: CryptoKey) => {
    const exported = await originalExportKey(format as "jwk", key);
    if (format !== "jwk" || typeof exported.d !== "string") {
      return exported;
    }
    const bytes = decodeBase64Url(exported.d) as Uint8Array;
    const start = bytes.findIndex((byte) => byte !== 0);
    return { ...exported, d: encodeBase64Url(bytes.subarray(start)) };
  }) as typeof crypto.subtle.exportKey);
}

/** A fixed key pair whose `d` starts with a zero byte, so the stub above shortens it. */
async function pairWithLeadingZeroD(alg: "ES512" | "Ed25519") {
  const pair = valueOf(await importKeyPair(LEADING_ZERO_D_JWKS[alg], { alg, extractable: true }));
  expect(decodeBase64Url(LEADING_ZERO_D_JWKS[alg].d)?.[0]).toBe(0);
  return pair;
}

function pkcs8Pem(der: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// The fix is the same code for every curve, so one EC curve and Ed25519 stand for all.
describe.each(["ES512", "Ed25519"] as const)("a %s d that Web Crypto exports short", (alg) => {
  const coordinateBytes = ALGORITHM_PARAMS[alg].coordinateBytes;

  it("should be exported at full length by exportPrivateJwk and import again", async () => {
    const pair = await pairWithLeadingZeroD(alg);
    stripLeadingZerosOfD();
    const jwk = await exportPrivateJwk(pair.privateKey);
    expect(decodeBase64Url(jwk.d as string)?.length).toBe(coordinateBytes);
    expect((await importKeyPair(jwk, { alg })).ok).toBe(true);
  });

  it("should be read at full length from a PEM PRIVATE KEY", async () => {
    const pair = await pairWithLeadingZeroD(alg);
    const jwk = await exportPrivateJwk(pair.privateKey);
    const cryptoKey = await crypto.subtle.importKey("jwk", jwk, ALGORITHM_PARAMS[alg].importParams, true, ["sign"]);
    const pem = pkcs8Pem(await crypto.subtle.exportKey("pkcs8", cryptoKey));
    stripLeadingZerosOfD();
    expect(valueOf(await importPrivateKey(pem, { alg })).alg).toBe(alg);
    expect((await importKeyPair(pem, { alg })).ok).toBe(true);
  });
});
