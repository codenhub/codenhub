import { describe, expect, it } from "vitest";

import * as entrypoint from "./index";

describe("package entrypoint", () => {
  it("should export exactly the public runtime API", () => {
    expect(Object.keys(entrypoint).sort()).toEqual([
      "ASYMMETRIC_ALGORITHMS",
      "JWS_ALGORITHMS",
      "SYMMETRIC_ALGORITHMS",
      "certificateThumbprint",
      "createDpopProof",
      "createDpopVerifier",
      "createExternalSigningKey",
      "createKeySet",
      "createRemoteKeySet",
      "createVerifier",
      "decodeBase64Url",
      "encodeBase64Url",
      "exportPrivateJwk",
      "exportPrivatePem",
      "exportPublicJwk",
      "exportPublicPem",
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
      "jwkThumbprintUri",
      "readHeader",
      "sign",
      "tokenHash",
    ]);
  });
});
