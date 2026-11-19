import { describe, expect, it } from "vitest";

import { tokenHash } from "./token-hash";

const ACCESS_TOKEN = "dNZX1hEZ9wBCzNL40Upu646bdzQA";
// Left half of each digest of ACCESS_TOKEN, base64url, computed independently with Python's hashlib.
const LEFT_HALF = {
  "SHA-256": "wfgvmE9VxjAudsl9lc6TqA",
  "SHA-384": "phZaPQJosyg-qi-OIYyQ3xJB9wsHYEEz",
  "SHA-512": "8xltSlOGYrWy8W9yNvRlEth1i_bXW-JROWPLvCv5zog",
} as const;

describe("tokenHash", () => {
  it.each([
    ["ES256", "SHA-256"],
    ["RS256", "SHA-256"],
    ["PS256", "SHA-256"],
    ["HS256", "SHA-256"],
    ["ES384", "SHA-384"],
    ["RS384", "SHA-384"],
    ["PS384", "SHA-384"],
    ["HS384", "SHA-384"],
    ["ES512", "SHA-512"],
    ["RS512", "SHA-512"],
    ["PS512", "SHA-512"],
    ["HS512", "SHA-512"],
    // OpenID Connect Core errata: Ed25519 hashes with SHA-512.
    ["EdDSA", "SHA-512"],
    ["Ed25519", "SHA-512"],
  ] as const)("should hash with the left half of %s's digest, %s", async (alg, digest) => {
    expect(await tokenHash(ACCESS_TOKEN, alg)).toBe(LEFT_HALF[digest]);
  });

  it("should hash the empty string", async () => {
    // Left half of SHA-256(""), base64url.
    expect(await tokenHash("", "RS256")).toBe("47DEQpj8HBSa-_TImW-5JA");
  });

  it.each([["none"], ["rs256"], ["constructor"], ["toString"], [""], [undefined], [256]])(
    "should throw TypeError for alg %s",
    async (alg) => {
      await expect(tokenHash(ACCESS_TOKEN, alg as never)).rejects.toThrow(
        new TypeError("tokenHash: alg must be a supported JWS algorithm."),
      );
    },
  );

  it.each([[undefined], [42], [new Uint8Array(1)]])("should throw TypeError for value %s", async (value) => {
    await expect(tokenHash(value as never, "RS256")).rejects.toThrow(
      new TypeError("tokenHash: value must be a string."),
    );
  });
});
