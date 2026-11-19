import { describe, expect, it } from "vitest";

import { generateKeyPair, generateSecretKey } from "./generate";
import { importPublicKey } from "./import";
import { EC_P256_PUBLIC_JWK, valueOf } from "./test-fixtures";
import { jwkThumbprint } from "./thumbprint";

/** RFC 7638 §3.1: the RSA key of the example, and its thumbprint. */
const RFC7638_RSA_JWK = {
  kty: "RSA",
  n: "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
  e: "AQAB",
  alg: "RS256",
  kid: "2011-04-29",
};
const RFC7638_THUMBPRINT = "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs";

/** RFC 8037 Appendix A.3: the Ed25519 public key, and its thumbprint. */
const RFC8037_PUBLIC_JWK = { kty: "OKP", crv: "Ed25519", x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo" };
const RFC8037_THUMBPRINT = "kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k";

describe("jwkThumbprint", () => {
  it("should compute the RFC 7638 §3.1 thumbprint, whatever alg and kid the key carries", async () => {
    for (const alg of ["RS256", "PS512"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const key = valueOf(await importPublicKey({ ...RFC7638_RSA_JWK, alg }, { alg }));
      // oxlint-disable-next-line no-await-in-loop
      expect(await jwkThumbprint(key)).toBe(RFC7638_THUMBPRINT);
    }
  });

  it.each(["EdDSA", "Ed25519"] as const)("should compute the RFC 8037 A.3 thumbprint for %s", async (alg) => {
    const key = valueOf(await importPublicKey(RFC8037_PUBLIC_JWK, { alg }));
    expect(await jwkThumbprint(key)).toBe(RFC8037_THUMBPRINT);
  });

  it("should give an EC key a 43-character base64url thumbprint that ignores kid", async () => {
    const plain = await jwkThumbprint(valueOf(await importPublicKey(EC_P256_PUBLIC_JWK, { alg: "ES256" })));
    const named = await jwkThumbprint(
      valueOf(await importPublicKey({ ...EC_P256_PUBLIC_JWK, kid: "k1" }, { alg: "ES256" })),
    );
    expect(plain).toMatch(/^[\w-]{43}$/);
    expect(named).toBe(plain);
  });

  it("should give two generated keys different thumbprints", async () => {
    const [a, b] = await Promise.all([generateKeyPair({ alg: "ES384" }), generateKeyPair({ alg: "ES384" })]);
    expect(await jwkThumbprint(a.publicKey)).not.toBe(await jwkThumbprint(b.publicKey));
  });

  it("should throw TypeError for a private key, a secret key and a look-alike", async () => {
    const { privateKey } = await generateKeyPair({ alg: "ES256" });
    const secret = await generateSecretKey({ alg: "HS256" });
    for (const key of [privateKey, secret, { kind: "public", alg: "ES256" }]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(jwkThumbprint(key as never)).rejects.toThrow(TypeError);
    }
  });
});
