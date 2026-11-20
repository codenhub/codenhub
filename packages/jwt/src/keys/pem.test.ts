import { describe, expect, it } from "vitest";

import type { AsymmetricAlgorithm } from "../core/types";
import { createKeySet } from "../keysets/local";
import { sign } from "../sign/sign";
import { createVerifier } from "../verify/create-verifier";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportPrivateJwk, exportPublicJwk } from "./export";
import { generateKeyPair } from "./generate";
import { importKeyPair, importPrivateKey, importPublicKey } from "./import";
import { MAX_PEM_LENGTH } from "./pem";
import { valueOf } from "./test-fixtures";

const ASYMMETRIC: readonly AsymmetricAlgorithm[] = [
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
  "Ed25519",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
];

/** Wraps DER in a PEM block of 64-character lines (RFC 7468 §2), as OpenSSL writes it. */
function pemOf(label: string, der: ArrayBuffer, newline = "\n"): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`, ""].join(newline);
}

/** A key pair made by Web Crypto directly, as PEM, standing in for one made by OpenSSL. */
async function pemPair(alg: AsymmetricAlgorithm, modulusLength = 2048): Promise<{ spki: string; pkcs8: string }> {
  const { importParams } = ALGORITHM_PARAMS[alg];
  const params =
    ALGORITHM_PARAMS[alg].kty === "RSA"
      ? { ...(importParams as RsaHashedImportParams), modulusLength, publicExponent: new Uint8Array([1, 0, 1]) }
      : importParams;
  const pair = (await crypto.subtle.generateKey(params, true, ["sign", "verify"])) as CryptoKeyPair;
  return {
    spki: pemOf("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey)),
    pkcs8: pemOf("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
  };
}

const issuesOf = (result: { ok: boolean; error?: { issues: unknown } }) => (result.ok ? [] : result.error?.issues);

describe.each(ASYMMETRIC)("PEM import for %s", (alg) => {
  it("should import SPKI and PKCS#8 that sign and verify together, with the kid given", async () => {
    const { spki, pkcs8 } = await pemPair(alg);
    const publicKey = valueOf(await importPublicKey(spki, { alg, kid: "pem-1" }));
    const privateKey = valueOf(await importPrivateKey(pkcs8, { alg, kid: "pem-1" }));
    expect([publicKey, privateKey]).toEqual([
      { kind: "public", alg, kid: "pem-1" },
      { kind: "private", alg, kid: "pem-1", extractable: false },
    ]);

    const token = await sign({ payload: { sub: "u1", exp: Math.floor(Date.now() / 1000) + 600 }, key: privateKey });
    const verified = await createVerifier({ keys: createKeySet([publicKey]) })(token);
    expect(verified.ok).toBe(true);
  });

  it("should import a key pair from PKCS#8 whose public key matches the SPKI", async () => {
    const { spki, pkcs8 } = await pemPair(alg);
    const pair = valueOf(await importKeyPair(pkcs8, { alg }));
    const publicKey = valueOf(await importPublicKey(spki, { alg }));
    expect(await exportPublicJwk(pair.publicKey)).toEqual(await exportPublicJwk(publicKey));
  });
});

describe("PEM import text", () => {
  it("should accept CRLF line endings, surrounding whitespace and a single-line body", async () => {
    const { importParams } = ALGORITHM_PARAMS.ES256;
    const pair = (await crypto.subtle.generateKey(importParams, true, ["sign", "verify"])) as CryptoKeyPair;
    const der = await crypto.subtle.exportKey("spki", pair.publicKey);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));

    for (const pem of [
      `  \r\n${pemOf("PUBLIC KEY", der, "\r\n")}\r\n\n`,
      `-----BEGIN PUBLIC KEY-----\n${base64}\n-----END PUBLIC KEY-----`,
      // As an environment variable often holds it: line breaks dropped, or turned into spaces.
      `-----BEGIN PUBLIC KEY-----${base64}-----END PUBLIC KEY-----`,
      `-----BEGIN PUBLIC KEY----- ${base64.match(/.{1,64}/g)?.join(" ")} -----END PUBLIC KEY-----`,
      // Trailing spaces on a line, and a blank line inside the block.
      pemOf("PUBLIC KEY", der, "  \n\n"),
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      expect((await importPublicKey(pem, { alg: "ES256" })).ok).toBe(true);
    }
  });

  it("should read literal backslash-n and backslash-r-backslash-n escapes as line breaks", async () => {
    const { importParams } = ALGORITHM_PARAMS.ES256;
    const pair = (await crypto.subtle.generateKey(importParams, true, ["sign", "verify"])) as CryptoKeyPair;
    const der = await crypto.subtle.exportKey("spki", pair.publicKey);
    const results = [];
    // As a .env file or a JSON-encoded secret often leaves a PEM: its line breaks written as escapes.
    for (const escape of [String.raw`\n`, String.raw`\r\n`]) {
      // oxlint-disable-next-line no-await-in-loop
      results.push((await importPublicKey(pemOf("PUBLIC KEY", der, escape) + escape, { alg: "ES256" })).ok);
    }
    expect(results).toEqual([true, true]);
  });

  it("should refuse a backslash that is not a line break escape as invalid_key", async () => {
    const { importParams } = ALGORITHM_PARAMS.ES256;
    const pair = (await crypto.subtle.generateKey(importParams, true, ["sign", "verify"])) as CryptoKeyPair;
    const der = await crypto.subtle.exportKey("spki", pair.publicKey);
    expect(await importPublicKey(pemOf("PUBLIC KEY", der, String.raw`\t`), { alg: "ES256" })).toEqual({
      ok: false,
      error: { issues: [{ code: "invalid_key" }] },
    });
  });

  it("should refuse a private key where a public one is expected as unexpected_private_key", async () => {
    const { pkcs8 } = await pemPair("ES256");
    expect(issuesOf(await importPublicKey(pkcs8, { alg: "ES256" }))).toEqual([{ code: "unexpected_private_key" }]);
  });

  it("should refuse a public key where a private one is expected as invalid_key", async () => {
    const { spki } = await pemPair("ES256");
    expect(issuesOf(await importPrivateKey(spki, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
    expect(issuesOf(await importKeyPair(spki, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });

  it("should refuse a key of another curve or type than alg as invalid_key", async () => {
    const p384 = await pemPair("ES384");
    const ed = await pemPair("Ed25519");
    expect(issuesOf(await importPublicKey(p384.spki, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
    expect(issuesOf(await importPrivateKey(ed.pkcs8, { alg: "RS256" }))).toEqual([{ code: "invalid_key" }]);
  });

  it("should run the JWK checks on the key read, so a 1024-bit RSA modulus is weak_key", async () => {
    const { spki } = await pemPair("RS256", 1024);
    expect(issuesOf(await importPublicKey(spki, { alg: "RS256" }))).toEqual([
      { code: "weak_key", path: ["n"], params: { minimum: 2048 } },
    ]);
  });

  it("should refuse a JWK whose own kid differs from options.kid as invalid_key at kid", async () => {
    const { spki } = await pemPair("ES256");
    const jwk = { ...(await exportPublicJwk(valueOf(await importPublicKey(spki, { alg: "ES256" })))), kid: "own" };
    expect(issuesOf(await importPublicKey(jwk, { alg: "ES256", kid: "given" }))).toEqual([
      { code: "invalid_key", path: ["kid"] },
    ]);
    expect(valueOf(await importPublicKey(jwk, { alg: "ES256", kid: "own" })).kid).toBe("own");
  });

  it("should give a public JWK without a kid the kid option", async () => {
    const { spki } = await pemPair("ES256");
    const jwk = await exportPublicJwk(valueOf(await importPublicKey(spki, { alg: "ES256" })));
    expect(valueOf(await importPublicKey(jwk, { alg: "ES256", kid: "given" })).kid).toBe("given");
  });

  it("should give both halves of a private JWK without a kid the kid option", async () => {
    const pair = await generateKeyPair({ alg: "ES256", extractable: true });
    const jwk = await exportPrivateJwk(pair.privateKey);
    const imported = valueOf(await importKeyPair(jwk, { alg: "ES256", kid: "given" }));
    expect([imported.privateKey.kid, imported.publicKey.kid]).toEqual(["given", "given"]);
    expect(issuesOf(await importPrivateKey({ ...jwk, kid: "own" }, { alg: "ES256", kid: "given" }))).toEqual([
      { code: "invalid_key", path: ["kid"] },
    ]);
  });

  it("should throw a TypeError for a kid that is not a string", async () => {
    await expect(importPublicKey("", { alg: "ES256", kid: 1 as never })).rejects.toThrow(
      new TypeError("importPublicKey: options.kid must be a string."),
    );
  });

  it("should refuse a PEM over the length cap without reading it", async () => {
    const { spki } = await pemPair("ES256");
    const padded = `${" ".repeat(MAX_PEM_LENGTH - spki.length + 1)}${spki}`;
    expect(padded.length).toBe(MAX_PEM_LENGTH + 1);
    expect(issuesOf(await importPublicKey(padded, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });

  it.each<[string, (spki: string) => string]>([
    ["an empty string", () => ""],
    ["a bare base64 body", (spki) => spki.split("\n").slice(1, -2).join("")],
    ["mismatched labels", (spki) => spki.replace("END PUBLIC KEY", "END PRIVATE KEY")],
    ["a PKCS#1 label", (spki) => spki.replaceAll("PUBLIC KEY", "RSA PUBLIC KEY")],
    ["a lowercase label", (spki) => spki.replaceAll("PUBLIC KEY", "public key")],
    ["PEM headers inside the block", (spki) => spki.replace("-----\n", "-----\nProc-Type: 4,ENCRYPTED\n")],
    ["text before the block", (spki) => `key:\n${spki}`],
    ["two blocks", (spki) => `${spki}${spki}`],
    ["a character outside base64", (spki) => spki.replace(/\n(.)/, "\n*")],
    ["broken padding", (spki) => spki.replace(/\n-----END/, "=\n-----END")],
    ["an empty body", () => "-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----"],
    ["DER that is not a key", () => "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----"],
    ["a truncated key", (spki) => spki.replace(/\n[^\n]*\n-----END/, "\n-----END")],
  ])("should report invalid_key without throwing for %s", async (_, change) => {
    const { spki } = await pemPair("ES256");
    expect(issuesOf(await importPublicKey(change(spki), { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });
});
