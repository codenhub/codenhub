import { describe, expect, it } from "vitest";

import * as entrypoint from "./index";

describe("package entrypoint", () => {
  it("should export exactly the public runtime API", () => {
    expect(Object.keys(entrypoint).sort()).toEqual([
      "createKeySet",
      "createRemoteKeySet",
      "createVerifier",
      "exportPrivateJwk",
      "exportPublicJwk",
      "exportSecretJwk",
      "generateKeyPair",
      "generateSecretKey",
      "importKeySet",
      "importPrivateKey",
      "importPublicKey",
      "importSecretKey",
      "readHeader",
      "sign",
    ]);
  });
});
