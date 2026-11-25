import { beforeAll, describe, expect, it } from "vitest";

import {
  createKeySet,
  createRemoteKeySet,
  createVerifier,
  generateKeyPair,
  generateSecretKey,
  importKeyPair,
  importKeySet,
  importPrivateKey,
  importPublicKey,
  importSecretKey,
  readHeader,
  sign,
  type KeyPair,
} from "../../src";
import { RFC7515_A2_JWK, RFC7515_A2_TOKEN } from "./fixtures/rfc-vectors";

/*
 * Every public function that takes an options object refuses a member it does not know, so a misspelled
 * option fails at the call instead of silently falling back to a default (scope.md decisions 22 and 28).
 */

let pair: KeyPair;

beforeAll(async () => {
  pair = await generateKeyPair({ alg: "ES256" });
});

const RSA_PUBLIC_JWK = { kty: "RSA", n: RFC7515_A2_JWK.n, e: RFC7515_A2_JWK.e };

/** Each call with one misspelled member, and the name it must report. */
const CALLS: readonly (readonly [string, string, () => unknown])[] = [
  ["sign", "input.headers", () => sign({ payload: {}, key: pair.privateKey, headers: { typ: "JWT" } } as never)],
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
