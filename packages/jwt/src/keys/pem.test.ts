import { createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { AsymmetricAlgorithm } from "../core/types";
import { createKeySet } from "../keysets/local";
import { sign } from "../sign/sign";
import { createVerifier } from "../verify/create-verifier";
import { ALGORITHM_PARAMS } from "./algorithms";
import {
  DER_BIT_STRING,
  DER_CONTEXT_1,
  DER_INTEGER,
  DER_OCTET_STRING,
  DER_SEQUENCE,
  encodeElement,
  readElement,
} from "./der";
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

  it("should refuse a key of another curve or type than alg as unsupported_key, as for a JWK", async () => {
    const p256 = await pemPair("ES256");
    const p384 = await pemPair("ES384");
    const ed = await pemPair("Ed25519");
    const rsa = await pemPair("RS256");
    const crv = [{ code: "unsupported_key", path: ["crv"] }];
    const kty = [{ code: "unsupported_key", path: ["kty"] }];
    expect(issuesOf(await importPublicKey(p384.spki, { alg: "ES256" }))).toEqual(crv);
    expect(issuesOf(await importPublicKey(p256.spki, { alg: "ES384" }))).toEqual(crv);
    expect(issuesOf(await importPrivateKey(ed.pkcs8, { alg: "RS256" }))).toEqual(kty);
    expect(issuesOf(await importPublicKey(rsa.spki, { alg: "ES256" }))).toEqual(kty);
    expect(issuesOf(await importKeyPair(p256.pkcs8, { alg: "EdDSA" }))).toEqual(kty);
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
    ["a lowercase label", (spki) => spki.replaceAll("PUBLIC KEY", "public key")],
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

/** A key pair made by OpenSSL through `node:crypto`, in the PEM forms it writes for RSA (PKCS#1) and EC (SEC 1). */
function nodePair(type: "rsa" | "ec", namedCurve?: string, cipher?: string) {
  const privateKeyEncoding = {
    type: type === "rsa" ? "pkcs1" : "sec1",
    format: "pem",
    // A passphrase made for the run, never written down: the test only needs the key to be encrypted.
    ...(cipher === undefined ? {} : { cipher, passphrase: randomUUID() }),
  } as const;
  const publicKeyEncoding = { type: type === "rsa" ? "pkcs1" : "spki", format: "pem" } as const;
  return type === "rsa"
    ? generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding, privateKeyEncoding } as never)
    : generateKeyPairSync("ec", { namedCurve: namedCurve as string, publicKeyEncoding, privateKeyEncoding } as never);
}

/** The DER of a PEM block. */
const derOfPem = (pem: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(pem.replace(/-----[A-Z ]+-----|\s/g, "")), (char) => char.charCodeAt(0));

const spkiPemOf = (pem: string) => createPublicKey(pem).export({ type: "spki", format: "pem" }) as string;

const ec256 = (): string => (nodePair("ec", "prime256v1") as unknown as { privateKey: string }).privateKey;

describe("PEM import of PKCS#1 and SEC 1", () => {
  it("should import an RSA PRIVATE KEY and an RSA PUBLIC KEY as the same key as its PKCS#8 and SPKI", async () => {
    const { publicKey, privateKey } = nodePair("rsa") as unknown as { publicKey: string; privateKey: string };
    expect(privateKey.startsWith("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
    expect(publicKey.startsWith("-----BEGIN RSA PUBLIC KEY-----")).toBe(true);
    const pair = valueOf(await importKeyPair(privateKey, { alg: "PS256", kid: "pkcs1" }));
    const fromPublic = valueOf(await importPublicKey(publicKey, { alg: "PS256" }));
    const fromSpki = valueOf(await importPublicKey(spkiPemOf(publicKey), { alg: "PS256" }));
    expect((await exportPublicJwk(pair.publicKey)).n).toBe((await exportPublicJwk(fromSpki)).n);
    expect((await exportPublicJwk(fromPublic)).n).toBe((await exportPublicJwk(fromSpki)).n);
    const token = await sign({ payload: { exp: Math.floor(Date.now() / 1000) + 600 }, key: pair.privateKey });
    expect((await createVerifier({ keys: createKeySet([fromPublic]) })(token)).ok).toBe(true);
  });

  it.each([
    ["ES256", "prime256v1"],
    ["ES384", "secp384r1"],
    ["ES512", "secp521r1"],
  ] as const)("should import a %s EC PRIVATE KEY whose public key matches the SPKI", async (alg, curve) => {
    const { publicKey, privateKey } = nodePair("ec", curve) as unknown as { publicKey: string; privateKey: string };
    expect(privateKey.startsWith("-----BEGIN EC PRIVATE KEY-----")).toBe(true);
    const pair = valueOf(await importKeyPair(privateKey, { alg }));
    const spki = valueOf(await importPublicKey(publicKey, { alg }));
    expect(await exportPublicJwk(pair.publicKey)).toEqual(await exportPublicJwk(spki));
  });

  // A P-256 ECPrivateKey: 30 77 | 02 01 01 | 04 20 <32 bytes> | a0 0a <OID> | a1 44 <public key>.
  it("should import an EC PRIVATE KEY without its optional public key", async () => {
    const der = derOfPem(ec256());
    const withoutPublic = encodeElement(DER_SEQUENCE, der.subarray(2, 2 + 3 + 34 + 12));
    expect(withoutPublic[withoutPublic.length - 12]).toBe(0xa0);
    expect(valueOf(await importPrivateKey(pemOf("EC PRIVATE KEY", withoutPublic.buffer), { alg: "ES256" }))).toEqual({
      kind: "private",
      alg: "ES256",
      extractable: false,
    });
  });

  it("should refuse an EC PRIVATE KEY without parameters as an unsupported form", async () => {
    const der = derOfPem(ec256());
    const withoutParameters = encodeElement(DER_SEQUENCE, der.subarray(2, 2 + 3 + 34));
    const pem = pemOf("EC PRIVATE KEY", withoutParameters.buffer);
    expect(issuesOf(await importPrivateKey(pem, { alg: "ES256" }))).toEqual([
      { code: "invalid_key", params: { reason: "unsupported_format" } },
    ]);
  });

  it("should refuse an EC PRIVATE KEY of another curve or type than alg as unsupported_key", async () => {
    const p256 = ec256();
    const secp256k1 = (nodePair("ec", "secp256k1") as unknown as { privateKey: string }).privateKey;
    const crv = [{ code: "unsupported_key", path: ["crv"] }];
    expect(issuesOf(await importPrivateKey(p256, { alg: "ES384" }))).toEqual(crv);
    expect(issuesOf(await importPrivateKey(secp256k1, { alg: "ES256" }))).toEqual(crv);
    expect(issuesOf(await importPrivateKey(p256, { alg: "RS256" }))).toEqual([
      { code: "unsupported_key", path: ["kty"] },
    ]);
  });

  it.each<[string, (der: Uint8Array) => Uint8Array]>([
    ["bytes after the key", (der) => Uint8Array.from([...der, 0])],
    ["version 0", (der) => Uint8Array.from(der, (byte, index) => (index === 4 ? 0 : byte))],
    ["a non-minimal length", (der) => Uint8Array.from([0x30, 0x81, ...der.subarray(1)])],
    ["parameters that are not an OID", (der) => Uint8Array.from(der, (byte, index) => (index === 41 ? 0x05 : byte))],
  ])("should refuse an EC PRIVATE KEY with %s as invalid_key", async (_, change) => {
    const der = derOfPem(ec256());
    expect([der[1], der[4], der[39], der[41]]).toEqual([0x77, 1, 0xa0, 0x06]);
    const pem = pemOf("EC PRIVATE KEY", Uint8Array.from(change(der)).buffer);
    expect(issuesOf(await importPrivateKey(pem, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });

  it("should refuse an RSA PUBLIC KEY given to a private import, and an RSA PRIVATE KEY to a public one", async () => {
    const { publicKey, privateKey } = nodePair("rsa") as unknown as { publicKey: string; privateKey: string };
    expect(issuesOf(await importPrivateKey(publicKey, { alg: "RS256" }))).toEqual([{ code: "invalid_key" }]);
    expect(issuesOf(await importPublicKey(privateKey, { alg: "RS256" }))).toEqual([{ code: "unexpected_private_key" }]);
  });
});

describe("PEM import of encrypted and unsupported keys", () => {
  const encrypted = [{ code: "invalid_key", params: { reason: "encrypted" } }];

  it("should refuse an ENCRYPTED PRIVATE KEY as encrypted", async () => {
    const { privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: randomUUID() },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    expect(privateKey.startsWith("-----BEGIN ENCRYPTED PRIVATE KEY-----")).toBe(true);
    expect(issuesOf(await importPrivateKey(privateKey, { alg: "ES256" }))).toEqual(encrypted);
    expect(issuesOf(await importKeyPair(privateKey, { alg: "ES256" }))).toEqual(encrypted);
    expect(issuesOf(await importPublicKey(privateKey, { alg: "ES256" }))).toEqual([{ code: "unexpected_private_key" }]);
  });

  it.each([
    ["RSA", "rsa", undefined, "RS256"],
    ["EC", "ec", "prime256v1", "ES256"],
  ] as const)("should refuse a legacy encrypted %s PRIVATE KEY as encrypted", async (_, type, curve, alg) => {
    const pem = (nodePair(type, curve, "aes-256-cbc") as unknown as { privateKey: string }).privateKey;
    expect(pem).toMatch(/^-----BEGIN (RSA|EC) PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: /);
    expect(issuesOf(await importPrivateKey(pem, { alg }))).toEqual(encrypted);
    expect(issuesOf(await importPrivateKey(pem.replaceAll("\n", "\r\n"), { alg }))).toEqual(encrypted);
  });

  it.each(["OPENSSH PRIVATE KEY", "DSA PRIVATE KEY", "CERTIFICATE REQUEST"])(
    "should refuse a %s block as an unsupported format",
    async (label) => {
      const pem = `-----BEGIN ${label}-----\nAAAA\n-----END ${label}-----\n`;
      expect(issuesOf(await importPrivateKey(pem, { alg: "ES256" }))).toEqual([
        { code: "invalid_key", params: { reason: "unsupported_format" } },
      ]);
    },
  );

  it("should refuse PEM headers that do not say the key is encrypted as an unsupported format", async () => {
    const { spki } = await pemPair("ES256");
    const withHeader = spki.replace("-----\n", "-----\nComment: made by hand\n\n");
    expect(issuesOf(await importPublicKey(withHeader, { alg: "ES256" }))).toEqual([
      { code: "invalid_key", params: { reason: "unsupported_format" } },
    ]);
  });
});

/** `der` with its outer length written one byte longer than it needs: `30 81 59` for `30 59`, `30 82 00 87` for `30 81 87`. */
function withNonMinimalLength(der: Uint8Array): Uint8Array {
  const first = der[1] as number;
  const count = first < 0x80 ? 0 : first & 0x7f;
  const lengthBytes = first < 0x80 ? [first] : [0, ...der.subarray(2, 2 + count)];
  return Uint8Array.from([der[0] as number, 0x80 | lengthBytes.length, ...lengthBytes, ...der.subarray(2 + count)]);
}

// Web Crypto engines disagree on these: Node imports an SPKI with bytes after it, Firefox a PKCS#8 with one, and
// Node and WebKit an SPKI whose outer length is not minimal. The package refuses them all before Web Crypto reads them.
describe("PEM import of DER that is not one minimal element", () => {
  const changes: readonly [string, (der: Uint8Array) => Uint8Array][] = [
    ["a byte after the key", (der) => Uint8Array.from([...der, 0])],
    ["a non-minimal outer length", withNonMinimalLength],
  ];

  it.each(changes)("should refuse a PUBLIC KEY and a PRIVATE KEY with %s as invalid_key", async (_, change) => {
    const { spki, pkcs8 } = await pemPair("ES256");
    const publicPem = pemOf("PUBLIC KEY", Uint8Array.from(change(derOfPem(spki))).buffer);
    const privatePem = pemOf("PRIVATE KEY", Uint8Array.from(change(derOfPem(pkcs8))).buffer);
    expect(issuesOf(await importPublicKey(publicPem, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
    expect(issuesOf(await importPrivateKey(privatePem, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });

  it.each(changes)(
    "should refuse an RSA PUBLIC KEY and an RSA PRIVATE KEY with %s as invalid_key",
    async (_, change) => {
      const { publicKey, privateKey } = nodePair("rsa") as unknown as { publicKey: string; privateKey: string };
      const publicPem = pemOf("RSA PUBLIC KEY", Uint8Array.from(change(derOfPem(publicKey))).buffer);
      const privatePem = pemOf("RSA PRIVATE KEY", Uint8Array.from(change(derOfPem(privateKey))).buffer);
      expect(issuesOf(await importPublicKey(publicPem, { alg: "RS256" }))).toEqual([{ code: "invalid_key" }]);
      expect(issuesOf(await importPrivateKey(privatePem, { alg: "RS256" }))).toEqual([{ code: "invalid_key" }]);
    },
  );

  it("should still import the unchanged DER of each", async () => {
    const { spki, pkcs8 } = await pemPair("ES256");
    expect(withNonMinimalLength(Uint8Array.of(0x30, 0x01, 0x05))).toEqual(Uint8Array.of(0x30, 0x81, 0x01, 0x05));
    expect((await importPublicKey(pemOf("PUBLIC KEY", derOfPem(spki).buffer), { alg: "ES256" })).ok).toBe(true);
    expect((await importPrivateKey(pemOf("PRIVATE KEY", derOfPem(pkcs8).buffer), { alg: "ES256" })).ok).toBe(true);
  });
});

/** The DER of each element inside the one constructed element `der` is. */
function childrenOf(der: Uint8Array): Uint8Array[] {
  const outer = readElement(der, 0, der.length);
  if (outer === undefined) {
    throw new Error("the fixture is not DER");
  }
  const children: Uint8Array[] = [];
  for (let offset = outer.contentStart; offset < outer.end;) {
    const child = readElement(der, offset, outer.end);
    if (child === undefined) {
      throw new Error("the fixture is not DER");
    }
    children.push(der.subarray(child.start, child.end));
    offset = child.end;
  }
  return children;
}

/** The content of the one DER element `der` is. */
const contentOf = (der: Uint8Array): Uint8Array => der.subarray(readElement(der, 0, der.length)?.contentStart);

const pemOfBytes = (label: string, der: Uint8Array): string => pemOf(label, Uint8Array.from(der).buffer);

/** An RSA `SubjectPublicKeyInfo` made by OpenSSL, its modulus `n` replaced by `change(n)`. */
function rsaSpkiWithModulus(change: (n: Uint8Array) => Uint8Array): Uint8Array {
  const { publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  const [algorithm, bitString] = childrenOf(Uint8Array.from(publicKey)) as [Uint8Array, Uint8Array];
  const [n, e] = childrenOf(contentOf(bitString).subarray(1)) as [Uint8Array, Uint8Array];
  expect(contentOf(n)[0]).toBe(0);
  const rsaPublicKey = encodeElement(DER_SEQUENCE, change(n), e);
  return encodeElement(DER_SEQUENCE, algorithm, encodeElement(DER_BIT_STRING, Uint8Array.of(0), rsaPublicKey));
}

/** `n` with one more leading zero byte than DER allows. */
const withExtraZero = (n: Uint8Array) => encodeElement(DER_INTEGER, Uint8Array.of(0), contentOf(n));
/** `n` without the leading zero byte that keeps it positive, so DER reads it as negative. */
const asNegative = (n: Uint8Array) => encodeElement(DER_INTEGER, contentOf(n).subarray(1));

/** A P-256 `SubjectPublicKeyInfo` made by OpenSSL, its `AlgorithmIdentifier` rewritten by `change`. */
function ecSpkiWithAlgorithm(change: (algorithm: Uint8Array) => Uint8Array): Uint8Array {
  const { publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  const [algorithm, bitString] = childrenOf(Uint8Array.from(publicKey)) as [Uint8Array, Uint8Array];
  return encodeElement(DER_SEQUENCE, change(algorithm), bitString);
}

/** An Ed25519 PKCS#8 made by OpenSSL, as its fields, and the raw public key of its SPKI. */
function ed25519Pkcs8(): { version: Uint8Array; algorithm: Uint8Array; privateKey: Uint8Array; publicKey: Uint8Array } {
  const pair = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  const [version, algorithm, privateKey] = childrenOf(Uint8Array.from(pair.privateKey)) as [
    Uint8Array,
    Uint8Array,
    Uint8Array,
  ];
  const publicKey = contentOf(childrenOf(Uint8Array.from(pair.publicKey))[1] as Uint8Array).subarray(1);
  return { version, algorithm, privateKey, publicKey };
}

// Web Crypto engines disagree on these too, so the package reads the whole key strictly before they do: Node and
// WebKit import a non-minimal or indefinite inner length that Chromium and Firefox refuse, Node alone a modulus with
// an extra zero byte or an Ed25519 private key with a byte after it, and WebKit reads a negative modulus as another.
describe("PEM import of a key whose inner DER is not strict", () => {
  const invalid = [{ code: "invalid_key" }];

  it("should refuse an AlgorithmIdentifier whose length is not minimal as invalid_key", async () => {
    const der = ecSpkiWithAlgorithm((algorithm) => Uint8Array.from([0x30, 0x81, ...algorithm.subarray(1)]));
    expect(der.subarray(2, 5)).toEqual(Uint8Array.of(0x30, 0x81, 0x13));
    expect(issuesOf(await importPublicKey(pemOfBytes("PUBLIC KEY", der), { alg: "ES256" }))).toEqual(invalid);
  });

  it("should refuse an AlgorithmIdentifier of indefinite length as invalid_key", async () => {
    const der = ecSpkiWithAlgorithm((algorithm) => Uint8Array.from([0x30, 0x80, ...contentOf(algorithm), 0, 0]));
    expect(issuesOf(await importPublicKey(pemOfBytes("PUBLIC KEY", der), { alg: "ES256" }))).toEqual(invalid);
  });

  it.each([
    ["an extra leading zero byte", withExtraZero],
    ["a negative value", asNegative],
  ])("should refuse an RSA modulus with %s as invalid_key", async (_, change) => {
    const pem = pemOfBytes("PUBLIC KEY", rsaSpkiWithModulus(change));
    expect(issuesOf(await importPublicKey(pem, { alg: "RS256" }))).toEqual(invalid);
  });

  it("should refuse an Ed25519 private key with a byte after it inside its OCTET STRING as invalid_key", async () => {
    const { version, algorithm, privateKey } = ed25519Pkcs8();
    const padded = encodeElement(DER_OCTET_STRING, contentOf(privateKey), Uint8Array.of(0));
    const pem = pemOfBytes("PRIVATE KEY", encodeElement(DER_SEQUENCE, version, algorithm, padded));
    expect(issuesOf(await importPrivateKey(pem, { alg: "Ed25519" }))).toEqual(invalid);
  });

  it("should refuse an RSA PRIVATE KEY whose modulus has an extra leading zero byte as invalid_key", async () => {
    const { privateKey } = nodePair("rsa") as unknown as { privateKey: string };
    const [version, n, ...rest] = childrenOf(derOfPem(privateKey)) as [Uint8Array, Uint8Array, ...Uint8Array[]];
    const der = encodeElement(DER_SEQUENCE, version, withExtraZero(n), ...rest);
    expect(issuesOf(await importPrivateKey(pemOfBytes("RSA PRIVATE KEY", der), { alg: "RS256" }))).toEqual(invalid);
  });

  it("should refuse an EC PRIVATE KEY whose public key has unused bits as invalid_key", async () => {
    const [version, privateKey, parameters, publicKey] = childrenOf(derOfPem(ec256())) as [
      Uint8Array,
      Uint8Array,
      Uint8Array,
      Uint8Array,
    ];
    const bitString = Uint8Array.from(contentOf(publicKey));
    expect(bitString.subarray(0, 3)).toEqual(Uint8Array.of(DER_BIT_STRING, 0x42, 0));
    bitString[2] = 1;
    const der = encodeElement(DER_SEQUENCE, version, privateKey, parameters, encodeElement(DER_CONTEXT_1, bitString));
    expect(issuesOf(await importPrivateKey(pemOfBytes("EC PRIVATE KEY", der), { alg: "ES256" }))).toEqual(invalid);
  });

  it("should still import the strict DER of each, and a PKCS#8 version 2 key with its public key", async () => {
    const rsa = pemOfBytes(
      "PUBLIC KEY",
      rsaSpkiWithModulus((n) => n),
    );
    expect((await importPublicKey(rsa, { alg: "RS256" })).ok).toBe(true);
    const ec = pemOfBytes(
      "PUBLIC KEY",
      ecSpkiWithAlgorithm((algorithm) => algorithm),
    );
    expect((await importPublicKey(ec, { alg: "ES256" })).ok).toBe(true);
    const { algorithm, privateKey, publicKey } = ed25519Pkcs8();
    // RFC 5958's OneAsymmetricKey: version 1, and the public key as `[1] IMPLICIT BIT STRING`.
    const v2 = encodeElement(
      DER_SEQUENCE,
      Uint8Array.of(DER_INTEGER, 1, 1),
      algorithm,
      privateKey,
      encodeElement(0x81, Uint8Array.of(0), publicKey),
    );
    const pair = valueOf(await importKeyPair(pemOfBytes("PRIVATE KEY", v2), { alg: "Ed25519" }));
    expect((await exportPublicJwk(pair.publicKey)).x).toBe(Buffer.from(publicKey).toString("base64url"));
  });
});

describe.each(["ES256", "ES384", "ES512"] as const)("PEM import for %s off the curve", (alg) => {
  it("should refuse an SPKI whose point is off the curve as invalid_key", async () => {
    const { namedCurve } = ALGORITHM_PARAMS[alg].importParams as EcKeyImportParams;
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const der = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    // An EC SPKI ends with the uncompressed point, so its last byte is the last byte of y.
    der[der.length - 1] = (der[der.length - 1] as number) ^ 1;
    expect(issuesOf(await importPublicKey(pemOf("PUBLIC KEY", der.buffer), { alg }))).toEqual([
      { code: "invalid_key" },
    ]);
  });
});
