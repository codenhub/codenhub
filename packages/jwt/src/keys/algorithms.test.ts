import { describe, expect, it } from "vitest";

import { compatibleAlgorithms, isAsymmetricAlgorithm } from "./algorithms";

describe("compatibleAlgorithms", () => {
  it.each([
    [{ kty: "EC", crv: "P-256" }, ["ES256"]],
    [{ kty: "EC", crv: "P-384" }, ["ES384"]],
    [{ kty: "EC", crv: "P-521" }, ["ES512"]],
    [{ kty: "OKP", crv: "Ed25519" }, ["EdDSA", "Ed25519"]],
    [{ kty: "RSA" }, ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512"]],
    [{ kty: "oct" }, ["HS256", "HS384", "HS512"]],
    [{ kty: "EC", crv: "secp256k1" }, []],
    [{ kty: "OKP", crv: "X25519" }, []],
    [{ kty: "rsa" }, []],
    [{}, []],
    [null, []],
    ["RSA", []],
  ])("should map %o to %o", (jwk, algorithms) => {
    expect(compatibleAlgorithms(jwk)).toEqual(algorithms);
  });

  it("should return nothing for a Proxy whose traps throw", () => {
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          throw new Error("trap");
        },
      },
    );
    expect(compatibleAlgorithms(hostile)).toEqual([]);
  });
});

describe("isAsymmetricAlgorithm", () => {
  it("should reject the HMAC algorithms", () => {
    expect(["PS256", "ES512", "HS256", "HS512"].map(isAsymmetricAlgorithm)).toEqual([true, true, false, false]);
  });
});
