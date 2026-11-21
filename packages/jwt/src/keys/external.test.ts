import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import type { AsymmetricAlgorithm, PrivateKey } from "../core/types";
import { createKeySet } from "../keysets/local";
import { sign } from "../sign/sign";
import { createVerifier } from "../verify/create-verifier";
import { ALGORITHM_PARAMS } from "./algorithms";
import { exportPrivateJwk, exportPublicJwk } from "./export";
import { createExternalSigningKey } from "./external";
import { generateSecretKey } from "./generate";
import { importPublicKey } from "./import";
import { getPublicKey } from "./public-key";
import { valueOf } from "./test-fixtures";
import { jwkThumbprint } from "./thumbprint";

const EXP = () => Math.floor(Date.now() / 1000) + 600;

/** A key held by Web Crypto standing in for one held by a KMS: only its signing function leaves it. */
async function kmsKey(alg: AsymmetricAlgorithm, kid?: string) {
  const { importParams, signParams, kty } = ALGORITHM_PARAMS[alg];
  const params =
    kty === "RSA"
      ? { ...(importParams as RsaHashedImportParams), modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }
      : importParams;
  const pair = (await crypto.subtle.generateKey(params, false, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = valueOf(await importPublicKey(pair.publicKey, { alg, ...(kid === undefined ? {} : { kid }) }));
  const signRaw = async (data: Uint8Array<ArrayBuffer>) =>
    new Uint8Array(await crypto.subtle.sign(signParams, pair.privateKey, data));
  return { publicKey, signRaw };
}

/** Encodes one non-negative big-endian integer as DER, minimally, as a KMS writes `r` and `s`. */
function derInteger(bytes: Uint8Array): number[] {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start++;
  }
  const value = [...bytes.subarray(start)];
  const content = (value[0] as number) >= 0x80 ? [0, ...value] : value;
  return [0x02, content.length, ...content];
}

/** An ECDSA signature as DER `Ecdsa-Sig-Value` (RFC 3279 §2.2.3), the form AWS KMS and Google Cloud KMS return. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  const body = [...derInteger(raw.subarray(0, half)), ...derInteger(raw.subarray(half))];
  const length = body.length >= 0x80 ? [0x81, body.length] : [body.length];
  return new Uint8Array([0x30, ...length, ...body]);
}

async function verifies(token: string, key: PrivateKey): Promise<boolean> {
  return (await createVerifier({ keys: createKeySet([getPublicKey(key)]) })(token)).ok;
}

describe("createExternalSigningKey", () => {
  it.each<AsymmetricAlgorithm>(["ES256", "ES512", "Ed25519", "RS256", "PS256"])(
    "should sign %s tokens through the signer that the public key verifies",
    async (alg) => {
      const { publicKey, signRaw } = await kmsKey(alg, "kms-1");
      const calls: Uint8Array[] = [];
      const key = createExternalSigningKey({
        publicKey,
        sign: async (data) => {
          calls.push(data);
          return signRaw(data);
        },
      });
      expect(key).toEqual({ kind: "private", alg, kid: "kms-1", extractable: false });

      const token = await sign({ payload: { sub: "u1", exp: EXP() }, key });
      expect(await verifies(token, key)).toBe(true);
      expect(calls).toHaveLength(1);
      expect(new TextDecoder().decode(calls[0])).toBe(token.slice(0, token.lastIndexOf(".")));
    },
  );

  it.each<AsymmetricAlgorithm>(["ES256", "ES384", "ES512"])(
    "should convert a DER %s signature to the JWS form",
    async (alg) => {
      const { publicKey, signRaw } = await kmsKey(alg);
      const key = createExternalSigningKey({
        publicKey,
        signatureFormat: "der",
        sign: async (data) => rawToDer(await signRaw(data)),
      });
      // Enough tokens that some r or s has a leading zero byte, or its top bit set, in DER.
      const tokens = await Promise.all(
        Array.from({ length: 24 }, (_, index) => sign({ payload: { sub: `u${index}`, exp: EXP() }, key })),
      );
      const results = await Promise.all(tokens.map((token) => verifies(token, key)));
      expect(results.every(Boolean)).toBe(true);
    },
  );

  it("should accept an ArrayBuffer from the signer", async () => {
    const { publicKey, signRaw } = await kmsKey("ES256");
    const key = createExternalSigningKey({
      publicKey,
      sign: async (data) => (await signRaw(data)).buffer as ArrayBuffer,
    });
    expect(await verifies(await sign({ payload: { exp: EXP() }, key }), key)).toBe(true);
  });

  it.each([
    ["Uint8Array", "new Uint8Array(raw)"],
    ["ArrayBuffer", "new Uint8Array(raw).buffer"],
    ["DataView", "new DataView(new Uint8Array(raw).buffer)"],
  ])("should accept a %s from another realm from the signer", async (_name, expression) => {
    const { publicKey, signRaw } = await kmsKey("ES256");
    const key = createExternalSigningKey({
      publicKey,
      sign: async (data) => {
        const foreign = runInNewContext(expression, { raw: [...(await signRaw(data))] }) as Uint8Array;
        expect(foreign instanceof Object).toBe(false);
        return foreign;
      },
    });
    expect(await verifies(await sign({ payload: { exp: EXP() }, key }), key)).toBe(true);
  });

  it("should throw from sign when the signer signs other bytes than the ones it was given", async () => {
    const { publicKey, signRaw } = await kmsKey("ES256");
    const key = createExternalSigningKey({
      publicKey,
      sign: async (data) => {
        data.fill(0x41);
        return signRaw(data);
      },
    });
    await expect(sign({ payload: { exp: EXP() }, key })).rejects.toThrow(TypeError);
  });

  it("should give the public key back from getPublicKey, and its thumbprint", async () => {
    const { publicKey, signRaw } = await kmsKey("ES256");
    const key = createExternalSigningKey({ publicKey, sign: signRaw });
    expect(await exportPublicJwk(getPublicKey(key))).toEqual(await exportPublicJwk(publicKey));
    expect(await jwkThumbprint(key)).toBe(await jwkThumbprint(publicKey));
  });

  it("should embed the public key for a DPoP proof", async () => {
    const { publicKey, signRaw } = await kmsKey("ES256");
    const key = createExternalSigningKey({ publicKey, sign: signRaw });
    const token = await sign({ payload: { exp: EXP() }, key, embedKey: publicKey, header: { typ: "dpop+jwt" } });
    expect(await verifies(token, key)).toBe(true);
  });

  it("should throw from sign when the signature does not verify with the public key", async () => {
    const { publicKey } = await kmsKey("ES256");
    const other = await kmsKey("ES256");
    const key = createExternalSigningKey({ publicKey, sign: other.signRaw });
    await expect(sign({ payload: { exp: EXP() }, key })).rejects.toThrow(
      new TypeError("sign: the external signer's signature does not verify with its public key."),
    );
  });

  // Node's Web Crypto refuses a signature of the wrong length; the stub stands in for an engine that would verify
  // an RSA signature without its leading zero byte, which every verifier of this package then refuses.
  it.each(["RS256", "ES256"] as const)(
    "should throw from sign when an %s signature is not as long as the key's signatures",
    async (alg) => {
      const { publicKey, signRaw } = await kmsKey(alg);
      const key = createExternalSigningKey({ publicKey, sign: async (data) => (await signRaw(data)).subarray(1) });
      const verify = vi.spyOn(crypto.subtle, "verify").mockResolvedValue(true);
      try {
        await expect(sign({ payload: { exp: EXP() }, key })).rejects.toThrow(
          new TypeError(`sign: the external signer's signature is not ${alg === "RS256" ? 256 : 64} bytes long.`),
        );
      } finally {
        verify.mockRestore();
      }
    },
  );

  it.each<[string, (der: number[]) => number[]]>([
    ["no sequence", (der) => der.slice(2)],
    ["trailing bytes", (der) => [...der, 0]],
    ["a sequence length past the end", (der) => [0x30, (der[1] as number) + 1, ...der.slice(2)]],
    ["a sequence length short of the end", (der) => [0x30, (der[1] as number) - 1, ...der.slice(2)]],
    ["a long-form length that fits the short form", (der) => [0x30, 0x81, ...der.slice(1)]],
    ["a negative integer", () => [0x30, 0x06, 0x02, 0x01, 0x80, 0x02, 0x01, 0x01]],
    ["a non-minimal integer", () => [0x30, 0x07, 0x02, 0x02, 0x00, 0x01, 0x02, 0x01, 0x01]],
    ["an empty integer", () => [0x30, 0x05, 0x02, 0x00, 0x02, 0x01, 0x01]],
    ["an integer longer than the curve", () => [0x30, 0x26, 0x02, 0x21, ...Array(33).fill(1), 0x02, 0x01, 0x01]],
    ["one integer", () => [0x30, 0x03, 0x02, 0x01, 0x01]],
  ])("should throw from sign for a DER signature with %s", async (_, change) => {
    const { publicKey, signRaw } = await kmsKey("ES256");
    const key = createExternalSigningKey({
      publicKey,
      signatureFormat: "der",
      sign: async (data) => new Uint8Array(change([...rawToDer(await signRaw(data))])),
    });
    await expect(sign({ payload: { exp: EXP() }, key })).rejects.toThrow(
      new TypeError("sign: the external signer returned a malformed DER signature."),
    );
  });

  it("should throw from sign when the signer returns something other than bytes", async () => {
    const { publicKey } = await kmsKey("ES256");
    const key = createExternalSigningKey({ publicKey, sign: async () => "signature" as never });
    await expect(sign({ payload: { exp: EXP() }, key })).rejects.toThrow(
      new TypeError("sign: the external signer must resolve to a Uint8Array or an ArrayBuffer."),
    );
  });

  it("should pass the signer's rejection through sign", async () => {
    const { publicKey } = await kmsKey("ES256");
    const failure = new Error("KMS unavailable");
    const key = createExternalSigningKey({
      publicKey,
      sign: async () => {
        throw failure;
      },
    });
    await expect(sign({ payload: { exp: EXP() }, key })).rejects.toBe(failure);
  });

  it("should refuse to export the key's private material", async () => {
    const { publicKey, signRaw } = await kmsKey("ES256");
    await expect(exportPrivateJwk(createExternalSigningKey({ publicKey, sign: signRaw }))).rejects.toThrow(
      new TypeError("exportPrivateJwk: the key's material is held by an external signer."),
    );
  });

  it("should throw a TypeError for invalid options", async () => {
    const { publicKey, signRaw } = await kmsKey("Ed25519");
    const secret = await generateSecretKey({ alg: "HS256" });
    const cases: [unknown, string][] = [
      [undefined, "createExternalSigningKey: options must be an object."],
      [{ sign: signRaw }, "createExternalSigningKey: options.publicKey must be a public key this package created."],
      [
        { publicKey: secret, sign: signRaw },
        "createExternalSigningKey: options.publicKey must be a public key this package created.",
      ],
      [{ publicKey }, "createExternalSigningKey: options.sign must be a function."],
      [
        { publicKey, sign: signRaw, signatureFormat: "pem" },
        'createExternalSigningKey: options.signatureFormat must be "raw" or "der".',
      ],
      [
        { publicKey, sign: signRaw, signatureFormat: "der" },
        'createExternalSigningKey: options.signatureFormat "der" needs an ES256, ES384 or ES512 key.',
      ],
      [{ publicKey, sign: signRaw, kid: "x" }, "createExternalSigningKey: options.kid is not an option."],
    ];
    for (const [options, message] of cases) {
      expect(() => createExternalSigningKey(options as never)).toThrow(new TypeError(message));
    }
  });
});
