import * as jose from "jose";
import { describe, expect, it } from "vitest";

import {
  CONTENT_ENCRYPTION_ALGORITHMS,
  createDecrypter,
  createJweKeySet,
  encrypt,
  exportJwePrivateJwk,
  exportJwePublicJwk,
  exportJweSecretJwk,
  generateJweKeyPair,
  generateJweSecretKey,
  importJwePrivateKey,
  importJwePublicKey,
  importJweSecretKey,
  type ContentEncryptionAlgorithm,
  type JweCurve,
  type JweDecryptionKey,
  type JweEncryptionKey,
} from "../../src";

const ENCS = CONTENT_ENCRYPTION_ALGORITHMS;
const ECDH = ["ECDH-ES", "ECDH-ES+A128KW", "ECDH-ES+A256KW"] as const;
const CURVES: readonly JweCurve[] = ["P-256", "P-384", "P-521", "X25519"];
const RSA = ["RSA-OAEP", "RSA-OAEP-256", "RSA-OAEP-384", "RSA-OAEP-512"] as const;
const KW = ["A128KW", "A256KW", "A128GCMKW", "A256GCMKW"] as const;

const PLAINTEXT = new TextEncoder().encode("Live long and prosper.");

interface Recipient {
  readonly label: string;
  readonly encryptionKey: JweEncryptionKey;
  readonly decryptionKey: JweDecryptionKey;
  /** The JWK jose encrypts to. */
  readonly encryptJwk: jose.JWK;
  /** The JWK jose decrypts with. */
  readonly decryptJwk: jose.JWK;
  /** A `dir` key fixes the one `enc` it allows. */
  readonly enc?: ContentEncryptionAlgorithm;
}

async function asymmetricRecipient(
  alg: (typeof ECDH)[number] | (typeof RSA)[number],
  crv?: JweCurve,
): Promise<Recipient> {
  const { publicKey, privateKey } = await generateJweKeyPair({ alg, crv, extractable: true });
  return {
    label: crv === undefined ? alg : `${alg} ${crv}`,
    encryptionKey: publicKey,
    decryptionKey: privateKey,
    encryptJwk: { ...(await exportJwePublicJwk(publicKey)) } as jose.JWK,
    decryptJwk: { ...(await exportJwePrivateJwk(privateKey)) } as jose.JWK,
  };
}

async function secretRecipient(alg: "dir" | (typeof KW)[number], enc?: ContentEncryptionAlgorithm): Promise<Recipient> {
  const key = await generateJweSecretKey({ alg, enc, extractable: true });
  const jwk = { ...(await exportJweSecretJwk(key)) } as jose.JWK;
  return {
    label: enc === undefined ? alg : `${alg} ${enc}`,
    encryptionKey: key,
    decryptionKey: key,
    encryptJwk: jwk,
    decryptJwk: jwk,
    enc,
  };
}

const recipients = async (): Promise<Recipient[]> => [
  ...(await Promise.all(ECDH.flatMap((alg) => CURVES.map((crv) => asymmetricRecipient(alg, crv))))),
  ...(await Promise.all(RSA.map((alg) => asymmetricRecipient(alg)))),
  ...(await Promise.all(KW.map((alg) => secretRecipient(alg)))),
  ...(await Promise.all(ENCS.map((enc) => secretRecipient("dir", enc)))),
];

const pairs = (all: readonly Recipient[]): [Recipient, ContentEncryptionAlgorithm][] =>
  all.flatMap((recipient) =>
    (recipient.enc === undefined ? ENCS : [recipient.enc]).map(
      (enc) => [recipient, enc] as [Recipient, ContentEncryptionAlgorithm],
    ),
  );

describe("JWE interoperability with jose", () => {
  it("should decrypt in jose every token it encrypts, for each alg and enc", async () => {
    const outcomes = await Promise.all(
      pairs(await recipients()).map(async ([recipient, enc]) => {
        const token = await encrypt({ plaintext: PLAINTEXT, key: recipient.encryptionKey, enc });
        const key = await jose.importJWK(recipient.decryptJwk, recipient.encryptionKey.alg);
        const { plaintext, protectedHeader } = await jose.compactDecrypt(token, key);
        const matches =
          protectedHeader.alg === recipient.encryptionKey.alg &&
          protectedHeader.enc === enc &&
          Buffer.from(plaintext).equals(Buffer.from(PLAINTEXT));
        return `${recipient.label} ${enc}: ${matches ? "ok" : "mismatch"}`;
      }),
    );

    expect(outcomes.filter((outcome) => !outcome.endsWith(": ok"))).toEqual([]);
    expect(outcomes).toHaveLength(84);
  });

  it("should decrypt every token jose encrypts, for each alg and enc", async () => {
    const outcomes = await Promise.all(
      pairs(await recipients()).map(async ([recipient, enc]) => {
        const key = await jose.importJWK(recipient.encryptJwk, recipient.encryptionKey.alg);
        const token = await new jose.CompactEncrypt(PLAINTEXT)
          .setProtectedHeader({ alg: recipient.encryptionKey.alg, enc })
          .encrypt(key);
        const decrypt = createDecrypter({ keys: createJweKeySet([recipient.decryptionKey]), enc: [enc] });
        const result = await decrypt(token);
        const matches = result.ok && Buffer.from(result.value.plaintext).equals(Buffer.from(PLAINTEXT));
        return `${recipient.label} ${enc}: ${matches ? "ok" : "failed"}`;
      }),
    );

    expect(outcomes.filter((outcome) => !outcome.endsWith(": ok"))).toEqual([]);
    expect(outcomes).toHaveLength(84);
  });

  it("should import keys jose generates and decrypt its tokens", async () => {
    const { publicKey, privateKey } = await jose.generateKeyPair("ECDH-ES+A256KW", {
      crv: "X25519",
      extractable: true,
    });
    const privateJwk = { ...(await jose.exportJWK(privateKey)), use: "enc" };
    const imported = await importJwePrivateKey(privateJwk, { alg: "ECDH-ES+A256KW" });
    const token = await new jose.CompactEncrypt(PLAINTEXT)
      .setProtectedHeader({ alg: "ECDH-ES+A256KW", enc: "A256GCM" })
      .encrypt(publicKey);

    expect(imported.ok).toBe(true);
    const decrypt = createDecrypter({ keys: createJweKeySet([imported.ok ? imported.value : (undefined as never)]) });
    const result = await decrypt(token);
    expect(result.ok && result.value.plaintext).toEqual(PLAINTEXT);

    const publicJwk = { ...(await jose.exportJWK(publicKey)), use: "enc" };
    const ownPublic = await importJwePublicKey(publicJwk, { alg: "ECDH-ES+A256KW" });
    expect(ownPublic.ok).toBe(true);
  });

  it("should import a raw secret and interoperate with jose's A128KW", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const imported = await importJweSecretKey(bytes, { alg: "A128KW" });
    expect(imported.ok).toBe(true);
    const key = imported.ok ? imported.value : (undefined as never);
    const token = await new jose.CompactEncrypt(PLAINTEXT)
      .setProtectedHeader({ alg: "A128KW", enc: "A128GCM" })
      .encrypt(bytes);
    const result = await createDecrypter({ keys: createJweKeySet([key]) })(token);
    expect(result.ok && result.value.plaintext).toEqual(PLAINTEXT);

    const ours = await encrypt({ plaintext: PLAINTEXT, key, enc: "A128CBC-HS256" });
    expect(new Uint8Array((await jose.compactDecrypt(ours, bytes)).plaintext)).toEqual(PLAINTEXT);
  });
});
