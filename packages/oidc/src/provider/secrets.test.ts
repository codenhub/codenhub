import { describe, expect, it, vi } from "vitest";

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

    expect(await verifyClientSecret(secret, [hash])).toBe(true);
  });

  it("verifies a secret that matches any entry, first or last", async () => {
    const [first, second, third] = [generateClientSecret(), generateClientSecret(), generateClientSecret()];
    const hashes = await Promise.all([first, second, third].map(hashClientSecret));

    expect(await verifyClientSecret(first, hashes)).toBe(true);
    expect(await verifyClientSecret(second, hashes)).toBe(true);
    expect(await verifyClientSecret(third, hashes)).toBe(true);
  });

  it("rejects a secret that matches none of several entries", async () => {
    const hashes = await Promise.all([generateClientSecret(), generateClientSecret()].map(hashClientSecret));

    expect(await verifyClientSecret(generateClientSecret(), hashes)).toBe(false);
  });

  it("rejects every secret against an empty list", async () => {
    expect(await verifyClientSecret(generateClientSecret(), [])).toBe(false);
  });

  it("compares with every entry, so a match does not end the work early", async () => {
    const encoding = await import("../shared/encoding");
    const secret = generateClientSecret();
    const hashes = [await hashClientSecret(secret), "x", "y"];
    const compare = vi.spyOn(encoding, "timingSafeEqual");

    expect(await verifyClientSecret(secret, hashes)).toBe(true);
    expect(compare).toHaveBeenCalledTimes(3);
    compare.mockRestore();
  });

  it("rejects a different secret", async () => {
    const hash = await hashClientSecret(generateClientSecret());

    expect(await verifyClientSecret(generateClientSecret(), [hash])).toBe(false);
  });

  it("stores a hash that differs from the secret", async () => {
    const secret = generateClientSecret();

    expect(await hashClientSecret(secret)).not.toBe(secret);
  });

  it("throws TypeError for an empty secret", async () => {
    await expect(hashClientSecret("")).rejects.toThrow(TypeError);
  });

  it("hashes to the base64url SHA-256 digest of the secret", async () => {
    // Checked against node:crypto, not trusted from memory: sha256("abc") in base64url.
    expect(await hashClientSecret("abc")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  });
});
