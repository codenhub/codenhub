import { beforeAll, describe, expect, it } from "vitest";

import {
  createDpopProof,
  createDpopVerifier,
  createDecrypter,
  createJweKeySet,
  createJwsVerifier,
  createKeySet,
  createNestedVerifier,
  createRemoteEncryptionKeySet,
  createRemoteKeySet,
  createVerifier,
  encrypt,
  encryptJwt,
  generateJweKeyPair,
  generateJweSecretKey,
  importJweKeyPair,
  importJwePrivateKey,
  importJwePublicKey,
  importJweSecretKey,
  importEncryptionKeySet,
  generateKeyPair,
  generateSecretKey,
  importKeyPair,
  importKeySet,
  importPrivateKey,
  importPublicKey,
  importSecretKey,
  readHeader,
  sign,
  signGeneralJws,
  signJws,
  type JweKeyPair,
  type KeyPair,
} from "../../src";
import { RFC7515_A2_JWK, RFC7515_A2_TOKEN } from "./fixtures/rfc-vectors";

/*
 * Every public function that takes an options object refuses a member it does not know, so a misspelled
 * option fails at the call instead of silently falling back to a default (scope.md decisions 22 and 28).
 */

let pair: KeyPair;
let jwePair: JweKeyPair;

beforeAll(async () => {
  pair = await generateKeyPair({ alg: "ES256" });
  jwePair = await generateJweKeyPair({ alg: "ECDH-ES", extractable: true });
});

const RSA_PUBLIC_JWK = { kty: "RSA", n: RFC7515_A2_JWK.n, e: RFC7515_A2_JWK.e };
const RSA_ENCRYPTION_JWK = { ...RFC7515_A2_JWK, use: "enc" };

/** Each call with one misspelled member, and the name it must report. */
const CALLS: readonly (readonly [string, string, () => unknown])[] = [
  ["sign", "input.headers", () => sign({ payload: {}, key: pair.privateKey, headers: { typ: "JWT" } } as never)],
  [
    "signJws",
    "input.serialisation",
    () => signJws({ payload: "", key: pair.privateKey, serialisation: "flattened" } as never),
  ],
  [
    "signGeneralJws",
    "input.signers[0].headers",
    () => signGeneralJws({ payload: "", signers: [{ key: pair.privateKey, headers: {} }] } as never),
  ],
  [
    "createJwsVerifier",
    "options.algorithms",
    () => createJwsVerifier({ keys: createKeySet([pair.publicKey]), algorithms: ["ES256"] } as never),
  ],
  [
    "JWS verifier",
    "options.detached",
    () => createJwsVerifier({ keys: createKeySet([pair.publicKey]) })("a.b.c", { detached: "a" } as never),
  ],
  ["readHeader", "options.maxlength", () => readHeader(RFC7515_A2_TOKEN, { maxlength: 10 } as never)],
  ["importKeySet", "options.algoritms", () => importKeySet({ keys: [] }, { algoritms: ["ES256"] } as never)],
  ["generateKeyPair", "options.extractible", () => generateKeyPair({ alg: "ES256", extractible: true } as never)],
  ["generateSecretKey", "options.extractible", () => generateSecretKey({ alg: "HS256", extractible: true } as never)],
  [
    "importPublicKey",
    "options.extractable",
    () => importPublicKey(RSA_PUBLIC_JWK, { alg: "RS256", extractable: true } as never),
  ],
  [
    "importPrivateKey",
    "options.algorithm",
    () => importPrivateKey(RFC7515_A2_JWK, { alg: "RS256", algorithm: "RS256" } as never),
  ],
  [
    "importKeyPair",
    "options.algorithm",
    () => importKeyPair(RFC7515_A2_JWK, { alg: "RS256", algorithm: "RS256" } as never),
  ],
  [
    "importSecretKey",
    "options.extractible",
    () => importSecretKey(new Uint8Array(32), { alg: "HS256", extractible: true } as never),
  ],
  [
    "createVerifier",
    "options.audiance",
    () => createVerifier({ keys: createKeySet([pair.publicKey]), audiance: "api" } as never),
  ],
  [
    "createRemoteKeySet",
    "options.timout",
    () => createRemoteKeySet({ url: "https://issuer.example/jwks", timout: 1 } as never),
  ],
  [
    "createDpopProof",
    "input.htm",
    () => createDpopProof({ key: pair.privateKey, method: "GET", url: "https://rs.example/", htm: "GET" } as never),
  ],
  ["createDpopVerifier", "options.maxage", () => createDpopVerifier({ maxage: 60 } as never)],
  [
    "createDpopVerifier",
    "request.jkt",
    () => createDpopVerifier()("proof", { method: "GET", url: "https://rs.example/", jkt: "x" } as never),
  ],
  [
    "createRemoteEncryptionKeySet",
    "options.algoritms",
    () => createRemoteEncryptionKeySet({ url: "https://issuer.example/jwks", algoritms: ["ECDH-ES"] } as never),
  ],
  [
    "importEncryptionKeySet",
    "options.algoritms",
    () => importEncryptionKeySet({ keys: [] }, { algoritms: ["ECDH-ES"] } as never),
  ],
  [
    "encrypt",
    "input.headers",
    () => encrypt({ plaintext: "", key: jwePair.publicKey, enc: "A128GCM", headers: {} } as never),
  ],
  [
    "encryptJwt",
    "input.payload",
    () => encryptJwt({ sign: { payload: {}, key: pair.privateKey }, key: jwePair.publicKey, payload: {} } as never),
  ],
  [
    "createDecrypter",
    "options.encs",
    () => createDecrypter({ keys: createJweKeySet([jwePair.privateKey]), encs: ["A128GCM"] } as never),
  ],
  [
    "createNestedVerifier",
    "options.verifier",
    () =>
      createNestedVerifier({
        decrypt: createDecrypter({ keys: createJweKeySet([jwePair.privateKey]) }),
        verify: createVerifier({ keys: createKeySet([pair.publicKey]) }),
        verifier: true,
      } as never),
  ],
  ["generateJweKeyPair", "options.curve", () => generateJweKeyPair({ alg: "ECDH-ES", curve: "P-256" } as never)],
  [
    "generateJweSecretKey",
    "options.extractible",
    () => generateJweSecretKey({ alg: "A128KW", extractible: true } as never),
  ],
  [
    "importJwePublicKey",
    "options.extractable",
    () => importJwePublicKey({ ...RSA_PUBLIC_JWK, use: "enc" }, { alg: "RSA-OAEP", extractable: true } as never),
  ],
  [
    "importJwePrivateKey",
    "options.enc",
    () => importJwePrivateKey(RSA_ENCRYPTION_JWK, { alg: "RSA-OAEP", enc: "A128GCM" } as never),
  ],
  [
    "importJweKeyPair",
    "options.enc",
    () => importJweKeyPair(RSA_ENCRYPTION_JWK, { alg: "RSA-OAEP", enc: "A128GCM" } as never),
  ],
  [
    "importJweSecretKey",
    "options.extractible",
    () => importJweSecretKey(new Uint8Array(16), { alg: "A128KW", extractible: true } as never),
  ],
];

describe("unknown options", () => {
  it.each(CALLS)("%s should throw a TypeError naming %s", async (functionName, member, call) => {
    // A synchronous throw and a rejected promise are both the call failing.
    await expect(async () => call()).rejects.toThrow(new TypeError(`${functionName}: ${member} is not an option.`));
  });

  it("should still accept a documented member whose value is undefined", async () => {
    await expect(generateKeyPair({ alg: "ES256", kid: undefined })).resolves.toMatchObject({});
    expect(readHeader(RFC7515_A2_TOKEN, { maxLength: undefined }).ok).toBe(true);
  });
});
