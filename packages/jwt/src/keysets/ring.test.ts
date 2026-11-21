import { beforeAll, describe, expect, it } from "vitest";

import type { PrivateKey } from "../core/types";
import { createDecrypter } from "../jwe/decrypt";
import { encrypt } from "../jwe/encrypt";
import { exportJwePublicJwk, generateJweKeyPair, generateJweSecretKey, getJwePublicKey } from "../jwe/keys";
import { importEncryptionKeySet } from "../jwe/keyset";
import type { JwePrivateKey, JwePublicKey } from "../jwe/types";
import { createExternalSigningKey, exportPublicJwk, generateKeyPair, getPublicKey } from "../keys";
import { sign } from "../sign/sign";
import { createVerifier } from "../verify/create-verifier";
import { createEncryptionKeyRing, createKeyRing, type EncryptionKeyRingOptions, type KeyRingOptions } from "./ring";

const DAY = 86_400;
const T0 = 1_800_000_000;

let keyA: PrivateKey;
let keyB: PrivateKey;
let keyC: PrivateKey;
let keyEd: PrivateKey;
let noKid: PrivateKey;

beforeAll(async () => {
  [keyA, keyB, keyC, keyEd, noKid] = await Promise.all([
    generateKeyPair({ alg: "ES256", kid: "a" }).then((pair) => pair.privateKey),
    generateKeyPair({ alg: "ES256", kid: "b" }).then((pair) => pair.privateKey),
    generateKeyPair({ alg: "ES256", kid: "c" }).then((pair) => pair.privateKey),
    generateKeyPair({ alg: "Ed25519", kid: "ed" }).then((pair) => pair.privateKey),
    generateKeyPair({ alg: "ES256" }).then((pair) => pair.privateKey),
  ]);
});

/** A clock fixed at `seconds`, in the milliseconds `now` returns. */
const at = (seconds: number) => () => seconds * 1000;

/** A ring of keys `a` (from T0) and `b` (from T0 + 30 days), with one day ahead and two days after. */
const ring = (seconds: number, overrides: Partial<KeyRingOptions> = {}) =>
  createKeyRing({
    keys: [
      { key: keyA, activeFrom: T0 },
      { key: keyB, activeFrom: T0 + 30 * DAY },
    ],
    publishAhead: DAY,
    publishAfter: 2 * DAY,
    now: at(seconds),
    ...overrides,
  });

const kids = async (keyRing: ReturnType<typeof createKeyRing>) => (await keyRing.jwks()).keys.map((jwk) => jwk.kid);

const PAYLOAD = { iss: "https://issuer.example", exp: T0 + 400 * DAY };

describe("createKeyRing signingKey", () => {
  it("should return the key with the latest activeFrom at or before now", () => {
    expect(ring(T0).signingKey()).toBe(keyA);
    expect(ring(T0 + 30 * DAY - 1).signingKey()).toBe(keyA);
    expect(ring(T0 + 30 * DAY).signingKey()).toBe(keyB);
    expect(ring(T0 + 300 * DAY).signingKey()).toBe(keyB);
  });

  it("should read whole seconds from a clock in milliseconds", () => {
    const keyRing = ring(0, { now: () => (T0 + 30 * DAY) * 1000 - 1 });
    expect(keyRing.signingKey()).toBe(keyA);
  });

  it("should not depend on the order keys are listed in", () => {
    const keyRing = ring(T0 + 30 * DAY, {
      keys: [
        { key: keyB, activeFrom: T0 + 30 * DAY },
        { key: keyA, activeFrom: T0 },
      ],
    });
    expect(keyRing.signingKey()).toBe(keyB);
  });

  it("should throw when no key is active yet", () => {
    expect(() => ring(T0 - 1).signingKey()).toThrow(
      new TypeError("createKeyRing: no key is active for signing now; every key's activeFrom is later."),
    );
  });

  it("should throw from retiredAt of the newest active key, without falling back to the key it superseded", () => {
    const keys = [
      { key: keyA, activeFrom: T0 },
      { key: keyB, activeFrom: T0 + 30 * DAY, retiredAt: T0 + 40 * DAY },
    ];
    expect(ring(T0 + 40 * DAY - 1, { keys }).signingKey()).toBe(keyB);
    expect(() => ring(T0 + 40 * DAY, { keys }).signingKey()).toThrow(
      new TypeError("createKeyRing: no key is active for signing now; the newest active key is retired."),
    );
  });

  it("should switch to a key whose activeFrom comes after another key's retiredAt", () => {
    const keys = [
      { key: keyA, activeFrom: T0, retiredAt: T0 + 10 * DAY },
      { key: keyB, activeFrom: T0 + 20 * DAY },
    ];
    expect(() => ring(T0 + 15 * DAY, { keys }).signingKey()).toThrow(TypeError);
    expect(ring(T0 + 20 * DAY, { keys }).signingKey()).toBe(keyB);
  });

  it("should accept an external signing key", async () => {
    const external = createExternalSigningKey({
      publicKey: getPublicKey(keyC),
      sign: async () => new Uint8Array(64),
    });
    const keyRing = ring(T0, { keys: [{ key: external, activeFrom: T0 }] });
    expect(keyRing.signingKey()).toBe(external);
    expect(await kids(keyRing)).toEqual(["c"]);
  });
});

describe("createKeyRing jwks", () => {
  it("should publish a key publishAhead seconds before its activeFrom, and not earlier", async () => {
    expect(await kids(ring(T0 + 29 * DAY - 1))).toEqual(["a"]);
    expect(await kids(ring(T0 + 29 * DAY))).toEqual(["a", "b"]);
  });

  it("should publish a superseded key until publishAfter seconds after the next key's activeFrom", async () => {
    expect(await kids(ring(T0 + 32 * DAY - 1))).toEqual(["a", "b"]);
    expect(await kids(ring(T0 + 32 * DAY))).toEqual(["b"]);
  });

  it("should publish a retired key until publishAfter seconds after its retiredAt", async () => {
    const keys = [{ key: keyA, activeFrom: T0, retiredAt: T0 + 10 * DAY }];
    expect(await kids(ring(T0 + 12 * DAY - 1, { keys }))).toEqual(["a"]);
    expect(await kids(ring(T0 + 12 * DAY, { keys }))).toEqual([]);
  });

  it("should end a key's publication at the earlier of its retiredAt and the next key's activeFrom", async () => {
    const keys = [
      { key: keyA, activeFrom: T0, retiredAt: T0 + 40 * DAY },
      { key: keyB, activeFrom: T0 + 30 * DAY },
    ];
    expect(await kids(ring(T0 + 32 * DAY, { keys }))).toEqual(["b"]);
  });

  it("should list keys by activeFrom and export each as exportPublicJwk does", async () => {
    const keyRing = ring(T0 + 30 * DAY, {
      keys: [
        { key: keyB, activeFrom: T0 + 30 * DAY },
        { key: keyA, activeFrom: T0 },
      ],
    });
    const jwks = await keyRing.jwks();
    expect(jwks).toEqual({
      keys: [await exportPublicJwk(getPublicKey(keyA)), await exportPublicJwk(getPublicKey(keyB))],
    });
    expect(Object.isFrozen(jwks)).toBe(true);
    expect(Object.isFrozen(jwks.keys)).toBe(true);
    expect(Object.isFrozen(jwks.keys[0])).toBe(true);
  });

  it("should never carry private members", async () => {
    const jwks = await ring(T0).jwks();
    expect(jwks.keys[0]).not.toHaveProperty("d");
  });
});

describe("createKeyRing select", () => {
  it("should verify tokens of the signing key and of a superseded key still published", async () => {
    const keyRing = ring(T0 + 31 * DAY);
    const verify = createVerifier({ keys: keyRing, issuer: PAYLOAD.iss, now: at(T0 + 31 * DAY) });
    const current = await sign({ payload: PAYLOAD, key: keyRing.signingKey() });
    const previous = await sign({ payload: PAYLOAD, key: keyA });
    expect((await verify(current)).ok).toBe(true);
    expect((await verify(previous)).ok).toBe(true);
  });

  it("should stop selecting a key once it is no longer published", async () => {
    const keyRing = ring(T0 + 32 * DAY);
    const result = await keyRing.select({ alg: "ES256", kid: "a" });
    expect(result.ok ? undefined : result.error.issues.map((issue) => issue.code)).toEqual(["unknown_kid"]);
  });

  it("should select a key published ahead of its activeFrom", async () => {
    const result = await ring(T0 + 29 * DAY).select({ alg: "ES256", kid: "b" });
    expect(result.ok && result.value).toBe(getPublicKey(keyB));
  });

  it("should bind selected keys to the issuer option", async () => {
    const keyRing = ring(T0, { issuer: "https://issuer.example" });
    const result = await keyRing.select({ alg: "ES256", kid: "a" });
    expect(result.ok && result.value.issuer).toBe("https://issuer.example");
    const verify = createVerifier({ keys: keyRing, now: at(T0) });
    const other = await sign({ payload: { ...PAYLOAD, iss: "https://other.example" }, key: keyA });
    const failed = await verify(other);
    expect(failed.ok ? undefined : failed.error.issues.map((issue) => issue.code)).toEqual(["wrong_issuer"]);
  });

  it("should read the clock at every call", async () => {
    let seconds = T0;
    const keyRing = ring(0, { now: () => seconds * 1000 });
    expect(keyRing.signingKey()).toBe(keyA);
    expect(await kids(keyRing)).toEqual(["a"]);
    seconds = T0 + 30 * DAY;
    expect(keyRing.signingKey()).toBe(keyB);
    expect(await kids(keyRing)).toEqual(["a", "b"]);
    expect((await keyRing.select({ alg: "ES256", kid: "b" })).ok).toBe(true);
  });
});

describe("createKeyRing clock", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, "1800000000000"])(
    "should throw when now returns %s",
    async (value) => {
      const keyRing = ring(0, { now: () => value as number });
      const message = "createKeyRing: options.now must return a finite number of milliseconds.";
      expect(() => keyRing.signingKey()).toThrow(new TypeError(message));
      await expect(keyRing.jwks()).rejects.toThrow(new TypeError(message));
      await expect(keyRing.select({ alg: "ES256", kid: "a" })).rejects.toThrow(new TypeError(message));
    },
  );

  it("should default to Date.now", () => {
    const keyRing = createKeyRing({
      keys: [{ key: keyA, activeFrom: Math.floor(Date.now() / 1000) - 10 }],
      publishAhead: 0,
      publishAfter: 0,
    });
    expect(keyRing.signingKey()).toBe(keyA);
  });
});

describe("createKeyRing options", () => {
  it("should return a frozen ring holding a copy of the keys", () => {
    const keys = [{ key: keyA, activeFrom: T0 }];
    const keyRing = ring(T0, { keys });
    keys[0] = { key: keyB, activeFrom: T0 };
    expect(Object.isFrozen(keyRing)).toBe(true);
    expect(keyRing.signingKey()).toBe(keyA);
  });

  const invalid: readonly [string, () => unknown, string][] = [
    ["options is not an object", () => createKeyRing(null as never), "createKeyRing: options must be an object."],
    [
      "an option is unknown",
      () => ring(T0, { publishahead: 1 } as never),
      "createKeyRing: options.publishahead is not an option.",
    ],
    [
      "keys is not an array",
      () => ring(T0, { keys: {} as never }),
      "createKeyRing: options.keys must be a non-empty array of at most 100 entries.",
    ],
    [
      "keys is empty",
      () => ring(T0, { keys: [] }),
      "createKeyRing: options.keys must be a non-empty array of at most 100 entries.",
    ],
    [
      "keys has more than 100 entries",
      () => ring(T0, { keys: Array.from({ length: 101 }, (_, index) => ({ key: keyA, activeFrom: T0 + index })) }),
      "createKeyRing: options.keys must be a non-empty array of at most 100 entries.",
    ],
    [
      "an entry is not an object",
      () => ring(T0, { keys: [null as never] }),
      "createKeyRing: options.keys[0] must be an object.",
    ],
    [
      "an entry has an unknown member",
      () => ring(T0, { keys: [{ key: keyA, activeFrom: T0, retiredat: T0 + 1 } as never] }),
      "createKeyRing: options.keys[0].retiredat is not an option.",
    ],
    [
      "a key is a public key",
      () => ring(T0, { keys: [{ key: getPublicKey(keyA) as never, activeFrom: T0 }] }),
      "createKeyRing: options.keys[0].key must be a private key created by this package.",
    ],
    [
      "a key is a look-alike",
      () => ring(T0, { keys: [{ key: { ...keyA }, activeFrom: T0 }] }),
      "createKeyRing: options.keys[0].key must be a private key created by this package.",
    ],
    [
      "a key has no kid",
      () => ring(T0, { keys: [{ key: noKid, activeFrom: T0 }] }),
      "createKeyRing: options.keys[0].key must have a kid.",
    ],
    [
      "two keys share a kid",
      () =>
        ring(T0, {
          keys: [
            { key: keyA, activeFrom: T0 },
            { key: keyA, activeFrom: T0 + 1 },
          ],
        }),
      "createKeyRing: two keys share the kid of options.keys[1].",
    ],
    [
      "two keys share an activeFrom",
      () =>
        ring(T0, {
          keys: [
            { key: keyA, activeFrom: T0 },
            { key: keyB, activeFrom: T0 },
          ],
        }),
      "createKeyRing: two keys share the activeFrom of options.keys[1].",
    ],
    [
      "activeFrom is milliseconds",
      () => ring(T0, { keys: [{ key: keyA, activeFrom: T0 * 1000 }] }),
      "createKeyRing: options.keys[0].activeFrom must be a whole number of seconds since the Unix epoch, from 0 to 253402300799.",
    ],
    [
      "activeFrom is a fraction",
      () => ring(T0, { keys: [{ key: keyA, activeFrom: T0 + 0.5 }] }),
      "createKeyRing: options.keys[0].activeFrom must be a whole number of seconds since the Unix epoch, from 0 to 253402300799.",
    ],
    [
      "activeFrom is a Date",
      () => ring(T0, { keys: [{ key: keyA, activeFrom: new Date() as never }] }),
      "createKeyRing: options.keys[0].activeFrom must be a whole number of seconds since the Unix epoch, from 0 to 253402300799.",
    ],
    [
      "retiredAt is negative",
      () => ring(T0, { keys: [{ key: keyA, activeFrom: T0, retiredAt: -1 }] }),
      "createKeyRing: options.keys[0].retiredAt must be a whole number of seconds since the Unix epoch, from 0 to 253402300799.",
    ],
    [
      "retiredAt is not after activeFrom",
      () => ring(T0, { keys: [{ key: keyA, activeFrom: T0, retiredAt: T0 }] }),
      "createKeyRing: options.keys[0].retiredAt must be later than its activeFrom.",
    ],
    [
      "publishAhead is missing",
      () => ring(T0, { publishAhead: undefined as never }),
      "createKeyRing: options.publishAhead must be a whole number of seconds from 0 to 315360000.",
    ],
    [
      "publishAfter is negative",
      () => ring(T0, { publishAfter: -1 }),
      "createKeyRing: options.publishAfter must be a whole number of seconds from 0 to 315360000.",
    ],
    [
      "publishAfter is in milliseconds",
      () => ring(T0, { publishAfter: 400 * DAY * 1000 }),
      "createKeyRing: options.publishAfter must be a whole number of seconds from 0 to 315360000.",
    ],
    ["now is not a function", () => ring(T0, { now: 1 as never }), "createKeyRing: options.now must be a function."],
    ["issuer is empty", () => ring(T0, { issuer: "" }), "createKeyRing: options.issuer must be a non-empty string."],
  ];

  it.each(invalid)("should throw a TypeError when %s", (_, create, message) => {
    expect(create).toThrow(new TypeError(message));
  });

  it("should accept keys of different algorithms", async () => {
    const keyRing = ring(T0 + 30 * DAY, {
      keys: [
        { key: keyA, activeFrom: T0 },
        { key: keyEd, activeFrom: T0 + 30 * DAY },
      ],
    });
    expect(keyRing.signingKey()).toBe(keyEd);
    expect((await keyRing.jwks()).keys.map((jwk) => jwk.alg)).toEqual(["ES256", "Ed25519"]);
  });
});

describe("createKeyRing with an encryption key", () => {
  it("should refuse a JWE private key, naming createEncryptionKeyRing", async () => {
    const { privateKey } = await generateJweKeyPair({ alg: "ECDH-ES", kid: "e" });
    expect(() => ring(T0, { keys: [{ key: privateKey as never, activeFrom: T0 }] })).toThrow(
      new TypeError(
        "createKeyRing: options.keys[0].key is an encryption (JWE) key; rotate encryption keys with createEncryptionKeyRing.",
      ),
    );
  });
});

describe("createEncryptionKeyRing", () => {
  let encA: JwePrivateKey;
  let encB: JwePrivateKey;
  let encRsa: JwePrivateKey;

  beforeAll(async () => {
    [encA, encB, encRsa] = await Promise.all([
      generateJweKeyPair({ alg: "ECDH-ES+A256KW", kid: "ea" }).then((pair) => pair.privateKey),
      generateJweKeyPair({ alg: "ECDH-ES+A256KW", kid: "eb" }).then((pair) => pair.privateKey),
      generateJweKeyPair({ alg: "RSA-OAEP-256", kid: "er" }).then((pair) => pair.privateKey),
    ]);
  });

  /** A ring of keys `ea` (from T0) and `eb` (from T0 + 30 days), decrypting two days after each is replaced. */
  const encryptionRing = (seconds: number, overrides: Partial<EncryptionKeyRingOptions> = {}) =>
    createEncryptionKeyRing({
      keys: [
        { key: encA, activeFrom: T0 },
        { key: encB, activeFrom: T0 + 30 * DAY },
      ],
      publishAfter: 2 * DAY,
      now: at(seconds),
      ...overrides,
    });

  const published = async (keyRing: ReturnType<typeof createEncryptionKeyRing>) =>
    (await keyRing.jwks()).keys.map((jwk) => jwk.kid);

  /** Whether a token encrypted to `key` decrypts with the ring. */
  const decrypts = async (keyRing: ReturnType<typeof createEncryptionKeyRing>, key: JwePublicKey) => {
    const token = await encrypt({ plaintext: "secret", key, enc: "A256GCM" });
    return (await createDecrypter({ keys: keyRing })(token)).ok;
  };

  it("should give the public half of the newest active key as the key to encrypt to", () => {
    const keyRing = encryptionRing(T0 + 30 * DAY - 1);
    expect(keyRing.encryptionKey()).toMatchObject({ kind: "jwe-public", alg: "ECDH-ES+A256KW", kid: "ea" });
    expect(keyRing.encryptionKey()).toBe(keyRing.encryptionKey());
    expect(encryptionRing(T0 + 30 * DAY).encryptionKey().kid).toBe("eb");
  });

  it("should throw when no key is active yet, or the newest active key is retired", () => {
    expect(() => encryptionRing(T0 - 1).encryptionKey()).toThrow(
      new TypeError("createEncryptionKeyRing: no key is active for encryption now; every key's activeFrom is later."),
    );
    const keys = [{ key: encA, activeFrom: T0, retiredAt: T0 + DAY }];
    expect(encryptionRing(T0 + DAY - 1, { keys }).encryptionKey().kid).toBe("ea");
    expect(() => encryptionRing(T0 + DAY, { keys }).encryptionKey()).toThrow(
      new TypeError("createEncryptionKeyRing: no key is active for encryption now; the newest active key is retired."),
    );
  });

  it("should publish only the current key, switching at the next key's activeFrom", async () => {
    expect(await published(encryptionRing(T0 - 1))).toEqual([]);
    expect(await published(encryptionRing(T0))).toEqual(["ea"]);
    expect(await published(encryptionRing(T0 + 30 * DAY - 1))).toEqual(["ea"]);
    expect(await published(encryptionRing(T0 + 30 * DAY))).toEqual(["eb"]);
  });

  it("should stop publishing a key at its retiredAt, with no key to take over", async () => {
    const keys = [{ key: encA, activeFrom: T0, retiredAt: T0 + 10 * DAY }];
    expect(await published(encryptionRing(T0 + 10 * DAY - 1, { keys }))).toEqual(["ea"]);
    expect(await published(encryptionRing(T0 + 10 * DAY, { keys }))).toEqual([]);
  });

  it("should never publish two keys of one algorithm, so a sender selecting by alg finds one", async () => {
    const jwks = await encryptionRing(T0 + 31 * DAY).jwks();
    const senderKeys = await importEncryptionKeySet(jwks);
    const selected = senderKeys.ok ? await senderKeys.value.select({ alg: "ECDH-ES+A256KW" }) : senderKeys;
    expect(selected.ok && selected.value.kid).toBe("eb");
  });

  it("should export the key as exportJwePublicJwk does, with use enc and no private member", async () => {
    const jwks = await encryptionRing(T0 + 30 * DAY).jwks();
    expect(jwks.keys).toEqual([await exportJwePublicJwk(getJwePublicKey(encB))]);
    expect(jwks.keys[0]?.use).toBe("enc");
    expect(jwks.keys.some((jwk) => "d" in jwk)).toBe(false);
    expect(Object.isFrozen(jwks.keys[0])).toBe(true);
  });

  it("should not decrypt for a key before its activeFrom", async () => {
    expect(await decrypts(encryptionRing(T0 + 30 * DAY - 1), getJwePublicKey(encB))).toBe(false);
    expect(await decrypts(encryptionRing(T0 + 30 * DAY), getJwePublicKey(encB))).toBe(true);
  });

  it("should keep decrypting for a superseded key until publishAfter seconds after the next key's activeFrom", async () => {
    expect(await decrypts(encryptionRing(T0 + 32 * DAY - 1), getJwePublicKey(encA))).toBe(true);
    expect(await decrypts(encryptionRing(T0 + 32 * DAY), getJwePublicKey(encA))).toBe(false);
  });

  it("should keep decrypting for a retired key until publishAfter seconds after its retiredAt", async () => {
    const keys = [{ key: encA, activeFrom: T0, retiredAt: T0 + 10 * DAY }];
    expect(await decrypts(encryptionRing(T0 + 12 * DAY - 1, { keys }), getJwePublicKey(encA))).toBe(true);
    expect(await decrypts(encryptionRing(T0 + 12 * DAY, { keys }), getJwePublicKey(encA))).toBe(false);
  });

  it("should read the clock at every call", async () => {
    let seconds = T0;
    const keyRing = encryptionRing(0, { now: () => seconds * 1000 });
    const token = await encrypt({ plaintext: "secret", key: getJwePublicKey(encA), enc: "A256GCM" });
    expect((await createDecrypter({ keys: keyRing })(token)).ok).toBe(true);
    seconds = T0 + 32 * DAY;
    expect((await createDecrypter({ keys: keyRing })(token)).ok).toBe(false);
    expect(keyRing.encryptionKey().kid).toBe("eb");
  });

  it("should accept keys of different algorithms and return a frozen ring", async () => {
    const keyRing = encryptionRing(T0 + 30 * DAY, {
      keys: [
        { key: encA, activeFrom: T0 },
        { key: encRsa, activeFrom: T0 + 30 * DAY },
      ],
    });
    expect(Object.isFrozen(keyRing)).toBe(true);
    expect(keyRing.encryptionKey().alg).toBe("RSA-OAEP-256");
    expect((await keyRing.jwks()).keys.map((jwk) => jwk.alg)).toEqual(["RSA-OAEP-256"]);
  });

  it("should refuse a signing key, even beside encryption keys, naming createKeyRing", () => {
    const signing = (index: number) =>
      new TypeError(
        `createEncryptionKeyRing: options.keys[${index}].key is a signing (JWS) key; rotate signing keys with createKeyRing.`,
      );
    expect(() => encryptionRing(T0, { keys: [{ key: keyA as never, activeFrom: T0 }] })).toThrow(signing(0));
    expect(() =>
      encryptionRing(T0, {
        keys: [
          { key: encA, activeFrom: T0 },
          { key: keyA as never, activeFrom: T0 + 1 },
        ],
      }),
    ).toThrow(signing(1));
  });

  it("should throw a TypeError for a key that is not a JWE private key with a kid, and for issuer", async () => {
    const noKidKey = (await generateJweKeyPair({ alg: "ECDH-ES" })).privateKey;
    const secret = await generateJweSecretKey({ alg: "A256KW", kid: "s" });
    const notPrivate = new TypeError(
      "createEncryptionKeyRing: options.keys[0].key must be a JWE private key created by this package.",
    );

    expect(() => encryptionRing(T0, { keys: [{ key: getJwePublicKey(encA) as never, activeFrom: T0 }] })).toThrow(
      notPrivate,
    );
    expect(() => encryptionRing(T0, { keys: [{ key: secret as never, activeFrom: T0 }] })).toThrow(notPrivate);
    expect(() => encryptionRing(T0, { keys: [{ key: { ...encA }, activeFrom: T0 }] })).toThrow(notPrivate);
    expect(() => encryptionRing(T0, { keys: [{ key: noKidKey, activeFrom: T0 }] })).toThrow(
      new TypeError("createEncryptionKeyRing: options.keys[0].key must have a kid."),
    );
    expect(() => encryptionRing(T0, { issuer: "https://issuer.example" } as never)).toThrow(
      new TypeError("createEncryptionKeyRing: options.issuer is not an option."),
    );
    expect(() => encryptionRing(T0, { publishAhead: DAY } as never)).toThrow(
      new TypeError("createEncryptionKeyRing: options.publishAhead is not an option."),
    );
    expect(() => encryptionRing(T0, { publishAfter: -1 })).toThrow(
      new TypeError(
        "createEncryptionKeyRing: options.publishAfter must be a whole number of seconds from 0 to 315360000.",
      ),
    );
  });
});
