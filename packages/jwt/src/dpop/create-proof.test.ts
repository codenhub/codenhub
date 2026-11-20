import { runInNewContext } from "node:vm";

import { beforeAll, describe, expect, it } from "vitest";

import { decodeBase64Url } from "../encoding/base64url";
import type { AsymmetricAlgorithm, KeyPair } from "../index";
import { ALGORITHM_PARAMS } from "../keys/algorithms";
import { exportPublicJwk } from "../keys/export";
import { createExternalSigningKey } from "../keys/external";
import { generateKeyPair, generateSecretKey } from "../keys/generate";
import { importPrivateKey, importPublicKey } from "../keys/import";
import { getKeyEntry } from "../keys/registry";
import { valueOf } from "../keys/test-fixtures";
import { createDpopProof } from "./create-proof";

const partOf = (token: string, index: 0 | 1): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(decodeBase64Url(token.split(".")[index] as string))) as Record<string, unknown>;

/** 2026-01-01T00:00:00.789Z, in milliseconds. */
const NOW_MS = 1_767_225_600_789;
const now = () => NOW_MS;

let pair: KeyPair;

beforeAll(async () => {
  pair = await generateKeyPair({ alg: "ES256", kid: "client-key" });
});

describe("createDpopProof", () => {
  // RFC 9449 §4.2, the shape of the example in §4.1.
  it("should write typ, alg and the public jwk, and jti, htm, htu and iat", async () => {
    const proof = await createDpopProof({
      key: pair.privateKey,
      method: "POST",
      url: "https://server.example.com/token",
      jti: "-BwC3ESc6acc2lTc",
      now,
    });

    const header = partOf(proof, 0);
    expect(Object.keys(header)).toEqual(["alg", "typ", "jwk"]);
    const { kty, crv, x, y } = await exportPublicJwk(pair.publicKey);
    expect(header).toEqual({ alg: "ES256", typ: "dpop+jwt", jwk: { kty, crv, x, y } });
    expect(Object.keys(header.jwk as object)).toEqual(["kty", "crv", "x", "y"]);
    expect(partOf(proof, 1)).toEqual({
      jti: "-BwC3ESc6acc2lTc",
      htm: "POST",
      htu: "https://server.example.com/token",
      iat: 1_767_225_600,
    });
  });

  it("should leave out the key's kid, since the jwk names the key", async () => {
    const proof = await createDpopProof({ key: pair.privateKey, method: "GET", url: "https://rs.example/r", now });

    expect(partOf(proof, 0)).not.toHaveProperty("kid");
  });

  it("should write a random UUID as jti by default", async () => {
    const first = partOf(await createDpopProof({ key: pair.privateKey, method: "GET", url: "https://a.example/" }), 1);
    const second = partOf(await createDpopProof({ key: pair.privateKey, method: "GET", url: "https://a.example/" }), 1);

    expect(first.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(first.jti).not.toBe(second.jti);
  });

  it("should read the clock as Date.now by default", async () => {
    const before = Math.floor(Date.now() / 1000);
    const { iat } = partOf(
      await createDpopProof({ key: pair.privateKey, method: "GET", url: "https://a.example/" }),
      1,
    );

    expect(iat).toBeGreaterThanOrEqual(before);
    expect(iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  // RFC 9449 §4.2: htu is the target URI without query and fragment.
  it.each([
    ["https://rs.example/resource?x=1#frag", "https://rs.example/resource"],
    ["HTTPS://RS.Example:443/a/../b", "https://rs.example/b"],
    ["http://localhost:8080/token?", "http://localhost:8080/token"],
  ])("should write htu for %s as %s", async (url, htu) => {
    const proof = await createDpopProof({ key: pair.privateKey, method: "GET", url, now });

    expect(partOf(proof, 1).htu).toBe(htu);
  });

  it("should take a URL object", async () => {
    const proof = await createDpopProof({
      key: pair.privateKey,
      method: "GET",
      url: new URL("https://rs.example/r?q#h"),
      now,
    });

    expect(partOf(proof, 1).htu).toBe("https://rs.example/r");
  });

  // A vm context has no URL class, so an object of that realm with an href stands in for its URL.
  it("should take a URL object from another realm", async () => {
    const url = runInNewContext('({ href: "https://rs.example/other?q" })') as URL;

    const proof = await createDpopProof({ key: pair.privateKey, method: "GET", url, now });

    expect(partOf(proof, 1).htu).toBe("https://rs.example/other");
  });

  // RFC 9449 §4.2 and the example of §7.1.
  it("should write ath, the base64url SHA-256 of the access token", async () => {
    const proof = await createDpopProof({
      key: pair.privateKey,
      method: "GET",
      url: "https://resource.example.org/protectedresource",
      accessToken: "Kz~8mXK1EalYznwH-LC-1fBAo.4Ljp~zsPE_NeO.gxU",
      nonce: "eyJ7S_zG.eyJH0-Z.HX4w-7v",
      now,
    });

    expect(partOf(proof, 1)).toMatchObject({
      ath: "fUHyO2r2Z3DZ53EsNrWBb0xWXoaNy59IiKCAqksmQEo",
      nonce: "eyJ7S_zG.eyJH0-Z.HX4w-7v",
    });
  });

  it.each(["ES384", "ES512", "EdDSA", "Ed25519", "RS256", "PS512"] as const)(
    "should sign a %s proof whose jwk verifies it",
    async (alg) => {
      const keys = await generateKeyPair({ alg });
      const proof = await createDpopProof({ key: keys.privateKey, method: "GET", url: "https://a.example/", now });

      const header = partOf(proof, 0);
      expect(header.alg).toBe(alg);
      expect(await verifiesWithEmbeddedKey(proof, alg)).toBe(true);
    },
  );

  it("should sign with a non-extractable key", async () => {
    const pairs = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const key = valueOf(await importPrivateKey(pairs, { alg: "ES256" }));
    expect(key.extractable).toBe(false);

    const proof = await createDpopProof({ key, method: "GET", url: "https://a.example/", now });

    expect(await verifiesWithEmbeddedKey(proof, "ES256")).toBe(true);
  });

  it("should sign with an external signing key", async () => {
    const material = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as CryptoKeyPair;
    const key = createExternalSigningKey({
      publicKey: valueOf(await importPublicKey(material.publicKey, { alg: "Ed25519" })),
      sign: async (data) => new Uint8Array(await crypto.subtle.sign("Ed25519", material.privateKey, data)),
    });

    const proof = await createDpopProof({ key, method: "GET", url: "https://a.example/", now });

    expect(await verifiesWithEmbeddedKey(proof, "Ed25519")).toBe(true);
  });

  describe("programmer errors", () => {
    /** Stands in for the key in the table, which is built before `beforeAll` runs. */
    const KEY = Symbol("key");
    const base = () => ({ key: KEY as unknown, method: "GET", url: "https://a.example/" });
    const withKey = (input: unknown): unknown =>
      typeof input === "object" && input !== null && (input as { key?: unknown }).key === KEY
        ? { ...input, key: pair.privateKey }
        : input;

    it.each([
      ["input", null, "createDpopProof: input must be an object."],
      ["an unknown member", { ...base(), htm: "GET" }, "createDpopProof: input.htm is not an option."],
      ["a missing key", { ...base(), key: undefined }, "createDpopProof: input.key must be a private key."],
      [
        "a forged key",
        { ...base(), key: { kind: "private", alg: "ES256" } },
        "createDpopProof: input.key must be a private key.",
      ],
      ["an empty method", { ...base(), method: "" }, "createDpopProof: input.method must be an HTTP method token."],
      [
        "a method with a space",
        { ...base(), method: "GE T" },
        "createDpopProof: input.method must be an HTTP method token.",
      ],
      [
        "a relative url",
        { ...base(), url: "/token" },
        "createDpopProof: input.url must be an absolute http: or https: URL.",
      ],
      [
        "a non-http url",
        { ...base(), url: "ftp://a.example/" },
        "createDpopProof: input.url must be an absolute http: or https: URL.",
      ],
      ["a numeric url", { ...base(), url: 42 }, "createDpopProof: input.url must be an absolute http: or https: URL."],
      [
        "an empty accessToken",
        { ...base(), accessToken: "" },
        "createDpopProof: input.accessToken must be a non-empty string.",
      ],
      ["an empty nonce", { ...base(), nonce: "" }, "createDpopProof: input.nonce must be a non-empty string."],
      ["a numeric jti", { ...base(), jti: 1 }, "createDpopProof: input.jti must be a non-empty string."],
      ["a now that is not a function", { ...base(), now: 1 }, "createDpopProof: input.now must be a function."],
    ])("should throw for %s", async (_, input, message) => {
      await expect(createDpopProof(withKey(input) as never)).rejects.toThrow(new TypeError(message));
    });

    it("should refuse a public key", async () => {
      await expect(createDpopProof({ ...base(), key: pair.publicKey } as never)).rejects.toThrow(
        new TypeError("createDpopProof: input.key must be a private key."),
      );
    });

    it("should refuse a secret key, which has no public key to embed", async () => {
      const secret = await generateSecretKey({ alg: "HS256" });

      await expect(createDpopProof({ ...base(), key: secret } as never)).rejects.toThrow(
        new TypeError("createDpopProof: input.key must be a private key."),
      );
    });

    it.each([Number.NaN, -1, 253_402_300_800_000, "1"])("should throw when now returns %s", async (time) => {
      await expect(createDpopProof(withKey({ ...base(), now: () => time }) as never)).rejects.toThrow(
        new TypeError("createDpopProof: input.now must return milliseconds since the Unix epoch."),
      );
    });
  });
});

/** Verifies a proof's signature with the key its own header carries, as a server does. */
async function verifiesWithEmbeddedKey(proof: string, alg: AsymmetricAlgorithm): Promise<boolean> {
  const embedded = valueOf(await importPublicKey(partOf(proof, 0).jwk, { alg }));
  const [header, payload, signature] = proof.split(".") as [string, string, string];
  return crypto.subtle.verify(
    ALGORITHM_PARAMS[alg].signParams,
    getKeyEntry(embedded).cryptoKey,
    decodeBase64Url(signature) as Uint8Array<ArrayBuffer>,
    new TextEncoder().encode(`${header}.${payload}`),
  );
}
