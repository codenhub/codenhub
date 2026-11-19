import { describe, expect, it } from "vitest";

import * as entrypoint from "./index";

describe("package entrypoint", () => {
  it("should export exactly the public runtime API", () => {
    expect(Object.keys(entrypoint).sort()).toEqual([
      "ASYMMETRIC_ALGORITHMS",
      "JWS_ALGORITHMS",
      "SYMMETRIC_ALGORITHMS",
      "createKeySet",
      "createRemoteKeySet",
      "createVerifier",
      "decodeBase64Url",
      "encodeBase64Url",
      "exportPrivateJwk",
      "exportPublicJwk",
      "exportSecretJwk",
      "generateKeyPair",
      "generateSecretKey",
      "getPublicKey",
      "importKeyPair",
      "importKeySet",
      "importPrivateKey",
      "importPublicKey",
      "importSecretKey",
      "isAsymmetricAlgorithm",
      "isJwsAlgorithm",
      "isSymmetricAlgorithm",
      "jwkThumbprint",
      "readHeader",
      "sign",
      "tokenHash",
    ]);
  });
});
