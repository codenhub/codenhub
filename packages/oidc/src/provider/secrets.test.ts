import { describe, expect, it } from "vitest";

import { generateClientSecret, hashClientSecret, verifyClientSecret } from "./secrets";

describe("generateClientSecret", () => {
  it("returns a 256-bit base64url secret", () => {
    expect(generateClientSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns a different secret each time", () => {
    expect(generateClientSecret()).not.toBe(generateClientSecret());
  });
});

describe("hashClientSecret and verifyClientSecret", () => {
  it("verifies the secret it hashed", async () => {
    const secret = generateClientSecret();
    const hash = await hashClientSecret(secret);

    expect(await verifyClientSecret(secret, hash)).toBe(true);
  });

  it("rejects a different secret", async () => {
    const hash = await hashClientSecret(generateClientSecret());

    expect(await verifyClientSecret(generateClientSecret(), hash)).toBe(false);
  });

  it("stores a hash that differs from the secret", async () => {
    const secret = generateClientSecret();

    expect(await hashClientSecret(secret)).not.toBe(secret);
  });

  it("throws TypeError for an empty secret", async () => {
    await expect(hashClientSecret("")).rejects.toThrow(TypeError);
  });
});
