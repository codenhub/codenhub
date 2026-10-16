import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { computeTokenHash } from "./token-hash";

const ACCESS_TOKEN = "jHkWEdUXMU1BwAsC4vtUsZwnrq_OZFtUeoM5n1Q_xCM";

/** Left half of the digest, base64url-encoded, as OpenID Connect Core §3.1.3.6 defines `at_hash`. */
const expectedHash = (algorithm: "sha256" | "sha512"): string => {
  const digest = createHash(algorithm).update(ACCESS_TOKEN, "utf8").digest();
  return digest.subarray(0, digest.length / 2).toString("base64url");
};

describe("computeTokenHash", () => {
  it.each(["ES256", "RS256", "PS256", "HS256"])("shouldUseSha256LeftHalfFor%s", async (alg) => {
    expect(await computeTokenHash(ACCESS_TOKEN, alg)).toBe(expectedHash("sha256"));
  });

  it.each(["EdDSA", "Ed25519"])("shouldUseSha512LeftHalfFor%s", async (alg) => {
    expect(await computeTokenHash(ACCESS_TOKEN, alg)).toBe(expectedHash("sha512"));
  });

  it("shouldReturn16ByteHashForSha256Algorithms", async () => {
    const hash = await computeTokenHash(ACCESS_TOKEN, "RS256");
    expect(hash).toBeDefined();
    expect(Buffer.from(hash ?? "", "base64url").length).toBe(16);
  });

  it("shouldReturn32ByteHashForEdDsa", async () => {
    const hash = await computeTokenHash(ACCESS_TOKEN, "EdDSA");
    expect(hash).toBeDefined();
    expect(Buffer.from(hash ?? "", "base64url").length).toBe(32);
  });

  it("shouldReturnUndefinedForUnknownAlgorithm", async () => {
    expect(await computeTokenHash(ACCESS_TOKEN, "none")).toBeUndefined();
  });

  it("shouldReturnUndefinedForInheritedObjectPropertyName", async () => {
    expect(await computeTokenHash(ACCESS_TOKEN, "constructor")).toBeUndefined();
  });
});
