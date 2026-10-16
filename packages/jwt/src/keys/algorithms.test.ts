import { describe, expect, it } from "vitest";

import { compatibleAlgorithms, isAsymmetricAlgorithm } from "./algorithms";

describe("compatibleAlgorithms", () => {
  it.each([
    [{ kty: "EC", crv: "P-256" }, ["ES256"]],
    [{ kty: "OKP", crv: "Ed25519" }, ["EdDSA", "Ed25519"]],
    [{ kty: "RSA" }, ["RS256", "PS256"]],
    [{ kty: "oct" }, ["HS256"]],
    [{ kty: "EC", crv: "P-384" }, []],
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
  it("should reject HS256", () => {
    expect(["PS256", "HS256"].map(isAsymmetricAlgorithm)).toEqual([true, false]);
  });
});
