import { runInNewContext } from "node:vm";

import { beforeAll, describe, expect, it } from "vitest";

import type { PrivateKey, PublicKey, SecretKey } from "../core/types";
import { decodeBase64Url } from "../encoding/base64url";
import { readHeader } from "../jws/read-header";
import { exportPublicJwk } from "../keys/export";
import { generateKeyPair, generateSecretKey } from "../keys/generate";
import { importPublicKey } from "../keys/import";
import { jwkThumbprint } from "../keys/thumbprint";
import { createKeySet } from "../keysets/local";
import { createVerifier } from "../verify/create-verifier";
import { sign, type SignHeader } from "./sign";

const textOf = (segment: string): string => new TextDecoder().decode(decodeBase64Url(segment));
const headerTextOf = (token: string): string => textOf(token.split(".")[0] as string);
const payloadTextOf = (token: string): string => textOf(token.split(".")[1] as string);

let secretKey: SecretKey;
let kidKey: SecretKey;
let privateKey: PrivateKey;
let publicKey: PublicKey;

beforeAll(async () => {
  secretKey = await generateSecretKey({ alg: "HS256" });
  kidKey = await generateSecretKey({ alg: "HS256", kid: "k1" });
  ({ privateKey, publicKey } = await generateKeyPair({ alg: "ES256" }));
});

describe("sign header", () => {
  it("should write only alg when neither the key nor the header has more", async () => {
    expect(headerTextOf(await sign({ payload: {}, key: secretKey }))).toBe('{"alg":"HS256"}');
  });

  it("should take the kid from the key", async () => {
    expect(headerTextOf(await sign({ payload: {}, key: kidKey }))).toBe('{"alg":"HS256","kid":"k1"}');
  });

  it("should let the header kid override the key's kid", async () => {
    const token = await sign({ payload: {}, key: kidKey, header: { kid: "k2" } });

    expect(headerTextOf(token)).toBe('{"alg":"HS256","kid":"k2"}');
  });

  it("should take alg from the key for an asymmetric key", async () => {
    expect(headerTextOf(await sign({ payload: {}, key: privateKey }))).toBe('{"alg":"ES256"}');
  });

  it("should accept a header alg equal to the key's", async () => {
    const token = await sign({ payload: {}, key: secretKey, header: { alg: "HS256" } });

    expect(headerTextOf(token)).toBe('{"alg":"HS256"}');
  });

  it("should order alg, kid, typ, cty, then the other parameters as given", async () => {
    const header: SignHeader = { custom: { nested: true }, cty: "json", "7": 7, typ: "JWT" };

    const token = await sign({ payload: {}, key: kidKey, header });

    expect(headerTextOf(token)).toBe(
      '{"alg":"HS256","kid":"k1","typ":"JWT","cty":"json","7":7,"custom":{"nested":true}}',
    );
  });
});

describe("sign payload", () => {
  it("should write the payload exactly as given", async () => {
    const payload = { sub: "user-1", aud: ["a", "b"], exp: 1.5, extra: { list: [null, true, "x"] } };

    expect(payloadTextOf(await sign({ payload, key: secretKey }))).toBe(JSON.stringify(payload));
  });

  it("should accept a payload nested exactly 32 levels deep", async () => {
    let payload: Record<string, unknown> = {};
    for (let depth = 1; depth < 32; depth += 1) {
      payload = { a: payload };
    }

    await expect(sign({ payload, key: secretKey })).resolves.toEqual(expect.any(String));
  });

  it("should accept an object without a prototype", async () => {
    const payload = Object.assign(Object.create(null) as Record<string, unknown>, { sub: "user-1" });

    expect(payloadTextOf(await sign({ payload, key: secretKey }))).toBe('{"sub":"user-1"}');
  });

  it("should accept claims typed by an interface", async () => {
    interface IdClaims {
      sub: string;
      tenant: string;
      roles: string[];
    }
    const claims: IdClaims = { sub: "user-1", tenant: "t1", roles: ["admin"] };

    expect(payloadTextOf(await sign({ payload: claims, key: secretKey }))).toBe(JSON.stringify(claims));
  });
});

describe("sign payload types", () => {
  // Each call below is a compile error that `pnpm typecheck` checks; at runtime each one still throws.
  it("should refuse a Date claim at compile time", async () => {
    const claims: { sub: string; when: Date } = { sub: "user-1", when: new Date(0) };

    // @ts-expect-error A Date is not a JSON value.
    await expect(sign({ payload: claims, key: secretKey })).rejects.toThrow(TypeError);
  });

  it("should refuse an ill-typed registered claim at compile time", async () => {
    // @ts-expect-error exp is a number of seconds.
    await expect(sign({ payload: { exp: "soon" }, key: secretKey })).rejects.toThrow(TypeError);
  });

  it("should refuse a function claim at compile time", async () => {
    // @ts-expect-error A function is not a JSON value.
    await expect(sign({ payload: { sub: "u", run: () => 1 }, key: secretKey })).rejects.toThrow(TypeError);
  });
});

const nestedDeeperThan32 = (): Record<string, unknown> => {
  let payload: Record<string, unknown> = {};
  for (let depth = 1; depth < 33; depth += 1) {
    payload = { a: payload };
  }
  return payload;
};

/** An array of length 1 whose only index was never assigned. */
const holey = (): unknown[] => {
  const list: unknown[] = [];
  list.length = 1;
  return list;
};

const cyclic = (): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  payload.self = payload;
  return payload;
};

const withAccessor = (): Record<string, unknown> =>
  Object.defineProperty({}, "sub", { enumerable: true, get: () => "user-1" }) as Record<string, unknown>;

describe("sign TypeError", () => {
  it.each([
    ["input is not an object", () => null],
    ["input is a string", () => "token"],
  ])("should throw when %s", async (_, input) => {
    await expect(sign(input() as never)).rejects.toThrow(TypeError);
  });

  it("should throw for a look-alike key", async () => {
    const key = { kind: "secret", alg: "HS256", extractable: false } as SecretKey;

    await expect(sign({ payload: {}, key })).rejects.toThrow(TypeError);
  });

  it("should throw for a public key", async () => {
    await expect(sign({ payload: {}, key: publicKey as never })).rejects.toThrow(
      "sign: input.key must be a private or secret key.",
    );
  });

  it.each([
    ["is an array", []],
    ["is null", null],
    ["is a Date", new Date(0)],
  ])("should throw when the header %s", async (_, header) => {
    await expect(sign({ payload: {}, key: secretKey, header: header as never })).rejects.toThrow(
      "sign: input.header must be a plain object.",
    );
  });

  it("should throw when the header alg differs from the key's", async () => {
    await expect(sign({ payload: {}, key: secretKey, header: { alg: "RS256" } })).rejects.toThrow(
      "sign: input.header.alg must equal the key's alg.",
    );
  });

  it("should throw when the header alg is none", async () => {
    await expect(sign({ payload: {}, key: secretKey, header: { alg: "none" as never } })).rejects.toThrow(
      "sign: input.header.alg must equal the key's alg.",
    );
  });

  it.each(["crit", "b64", "jwk", "jku", "x5u", "x5c"])("should throw when the header holds %s", async (name) => {
    await expect(sign({ payload: {}, key: secretKey, header: { [name]: "x" } })).rejects.toThrow(
      `sign: input.header.${name} is not supported.`,
    );
  });

  it.each(["kid", "typ", "cty"])("should throw when the header %s is not a string", async (name) => {
    await expect(sign({ payload: {}, key: secretKey, header: { [name]: 1 } })).rejects.toThrow(
      `sign: input.header.${name} must be a string.`,
    );
  });

  it("should throw when a header value is undefined", async () => {
    await expect(sign({ payload: {}, key: secretKey, header: { kid: undefined } })).rejects.toThrow(
      "sign: input.header must hold only JSON values, not undefined.",
    );
  });

  it.each([
    ["is an array", []],
    ["is null", null],
    ["is a Date", new Date(0)],
    ["is a Map", new Map()],
  ])("should throw when the payload %s", async (_, payload) => {
    await expect(sign({ payload: payload as never, key: secretKey })).rejects.toThrow(
      "sign: input.payload must be a plain object.",
    );
  });

  it.each([
    ["undefined", { sub: undefined }, "sign: input.payload must hold only JSON values, not undefined."],
    ["a function", { f: () => 1 }, "sign: input.payload must hold only JSON values, not function."],
    ["a symbol", { s: Symbol("s") }, "sign: input.payload must hold only JSON values, not symbol."],
    ["a bigint", { n: 1n }, "sign: input.payload must hold only JSON values, not bigint."],
    ["NaN", { n: Number.NaN }, "sign: input.payload must not hold a non-finite number."],
    ["Infinity", { n: Number.POSITIVE_INFINITY }, "sign: input.payload must not hold a non-finite number."],
    ["negative zero", { n: -0 }, "sign: input.payload must not hold negative zero."],
    ["negative zero in an array", { list: [-0] }, "sign: input.payload must not hold negative zero."],
    ["a nested Date", { d: new Date(0) }, "sign: input.payload must hold only plain objects and arrays."],
    [
      "an Array subclass",
      { aud: new (class extends Array {})() },
      "sign: input.payload must hold only plain objects and arrays.",
    ],
    [
      "an array with an inherited toJSON",
      { aud: Object.setPrototypeOf(["a"], { toJSON: () => 5 }) },
      "sign: input.payload must hold only plain objects and arrays.",
    ],
    ["an array hole", { list: holey() }, "sign: input.payload must not hold array holes."],
    ["undefined in an array", { list: [undefined] }, "sign: input.payload must hold only JSON values, not undefined."],
  ])("should throw when the payload holds %s", async (_, payload, message) => {
    // Values the payload type already refuses; the runtime must refuse them too for untyped callers.
    await expect(sign({ payload: payload as never, key: secretKey })).rejects.toThrow(message);
  });

  it.each([
    ["Array.prototype", Array.prototype, { aud: ["a"] }],
    ["Object.prototype", Object.prototype, { claims: { a: 1 } }],
  ])("should throw when %s has a polluting toJSON", async (_, prototype, payload) => {
    Object.defineProperty(prototype, "toJSON", { value: () => 5, configurable: true, writable: true });
    try {
      // The header is checked first, and it inherits the polluted prototype too.
      await expect(sign({ payload, key: secretKey })).rejects.toThrow("must not hold toJSON methods.");
    } finally {
      delete (prototype as { toJSON?: unknown }).toJSON;
    }
  });

  it("should throw when the header holds negative zero", async () => {
    await expect(sign({ payload: {}, key: secretKey, header: { extra: -0 } as SignHeader })).rejects.toThrow(
      "sign: input.header must not hold negative zero.",
    );
  });

  it("should throw when the payload has a symbol key", async () => {
    await expect(sign({ payload: { [Symbol("s")]: 1 }, key: secretKey })).rejects.toThrow(
      "sign: input.payload must not have symbol keys.",
    );
  });

  it("should throw when the payload has an accessor", async () => {
    await expect(sign({ payload: withAccessor(), key: secretKey })).rejects.toThrow(
      "sign: input.payload must not hold accessor properties.",
    );
  });

  it("should throw when the payload nests deeper than 32 levels", async () => {
    await expect(sign({ payload: nestedDeeperThan32(), key: secretKey })).rejects.toThrow(
      "sign: input.payload must not nest deeper than 32 levels.",
    );
  });

  it("should throw when the payload is cyclic", async () => {
    await expect(sign({ payload: cyclic(), key: secretKey })).rejects.toThrow(
      "sign: input.payload must not nest deeper than 32 levels.",
    );
  });

  it.each(["exp", "nbf", "iat"])("should throw when %s is not a number", async (name) => {
    await expect(sign({ payload: { [name]: "1" }, key: secretKey })).rejects.toThrow(
      `sign: input.payload.${name} must be a finite number of seconds.`,
    );
  });

  // `Date.now()` in place of seconds is the usual mistake, and it signs a token that never expires.
  it.each(["exp", "nbf", "iat"])("should throw when %s is in milliseconds", async (name) => {
    await expect(sign({ payload: { [name]: Date.now() + 300_000 }, key: secretKey })).rejects.toThrow(
      `sign: input.payload.${name} must be seconds since the Unix epoch, at most 253402300799; it looks like milliseconds.`,
    );
  });

  it.each(["exp", "nbf", "iat"])("should accept %s at the last second of year 9999", async (name) => {
    await expect(sign({ payload: { [name]: 253_402_300_799 }, key: secretKey })).resolves.toMatch(/\./);
  });

  it.each(["iss", "sub", "jti"])("should throw when %s is not a string", async (name) => {
    await expect(sign({ payload: { [name]: 1 }, key: secretKey })).rejects.toThrow(
      `sign: input.payload.${name} must be a string.`,
    );
  });

  it.each([
    ["a number", 1],
    ["an array holding a number", ["a", 1]],
    ["null", null],
    ["an array whose own every vouches for a number", Object.assign([1], { every: () => true })],
  ])("should throw when aud is %s", async (_, aud) => {
    await expect(sign({ payload: { aud } as never, key: secretKey })).rejects.toThrow(
      "sign: input.payload.aud must be a string or an array of strings.",
    );
  });

  it.each([
    ["an array", () => Object.defineProperty(["a"], "toJSON", { value: () => ["b"] })],
    ["an object, non-enumerable", () => Object.defineProperty({ a: 1 }, "toJSON", { value: () => ({ b: 2 }) })],
  ])("should throw when the payload holds %s with an own toJSON", async (_, make) => {
    await expect(sign({ payload: { claim: make() }, key: secretKey })).rejects.toThrow(
      "sign: input.payload must not hold toJSON methods.",
    );
  });
});

// RFC 9449 §4.2: a DPoP proof carries the public key that verifies it in its `jwk` header.
describe("sign embedKey", () => {
  it("should write the public key's material as jwk after alg, kid, typ and cty", async () => {
    const pair = await generateKeyPair({ alg: "ES256", kid: "client-key" });
    const token = await sign({
      payload: { htm: "POST" },
      key: pair.privateKey,
      embedKey: pair.publicKey,
      header: { typ: "dpop+jwt", nonce: "n1" },
    });

    const header = JSON.parse(headerTextOf(token)) as Record<string, unknown>;
    expect(Object.keys(header)).toEqual(["alg", "kid", "typ", "jwk", "nonce"]);
    // Only the material: no alg, use or kid on the embedded key, and never a private member.
    expect(Object.keys(header.jwk as object)).toEqual(["kty", "crv", "x", "y"]);
  });

  it.each(["ES256", "ES512", "EdDSA", "RS384", "PS256"] as const)(
    "should produce a %s proof a verifier accepts with the key read from its own header",
    async (alg) => {
      const pair = await generateKeyPair({ alg });
      const token = await sign({ payload: { jti: "j1" }, key: pair.privateKey, embedKey: pair.publicKey });

      const header = readHeader(token);
      if (!header.ok || header.value.jwk === undefined) {
        throw new Error("expected a header with jwk");
      }
      const embedded = await importPublicKey(header.value.jwk, { alg: header.value.alg as typeof alg });
      if (!embedded.ok) {
        throw new Error("expected the embedded key to import");
      }
      const verified = await createVerifier({ keys: createKeySet([embedded.value]), requireExpiration: false })(token);
      expect(verified.ok && verified.value.payload).toEqual({ jti: "j1" });
      expect(await jwkThumbprint(embedded.value)).toBe(await jwkThumbprint(pair.publicKey));
    },
  );

  it("should throw when embedKey is not the public half of key", async () => {
    const other = await generateKeyPair({ alg: "ES256" });

    await expect(sign({ payload: {}, key: privateKey, embedKey: other.publicKey })).rejects.toThrow(
      new TypeError("sign: input.embedKey must be the public key of input.key."),
    );
  });

  it("should throw when embedKey is bound to another algorithm", async () => {
    const rsa = await generateKeyPair({ alg: "RS256" });
    const material = { ...(await exportPublicJwk(rsa.publicKey)), alg: undefined };
    const pss = valueOrThrow(await importPublicKey(material, { alg: "PS256" }));

    await expect(sign({ payload: {}, key: rsa.privateKey, embedKey: pss })).rejects.toThrow(
      new TypeError("sign: input.embedKey must have the same alg as input.key."),
    );
  });

  it.each([
    ["a private key", () => privateKey],
    ["a look-alike", () => ({ kind: "public", alg: "ES256" })],
  ])("should throw when embedKey is %s", async (_, embedKey) => {
    await expect(sign({ payload: {}, key: privateKey, embedKey: embedKey() as never })).rejects.toThrow(
      new TypeError("sign: input.embedKey must be a public key this package created."),
    );
  });

  it("should throw when the signing key is a secret, which has no public key to embed", async () => {
    await expect(sign({ payload: {}, key: secretKey, embedKey: publicKey })).rejects.toThrow(
      new TypeError("sign: input.embedKey needs a private input.key."),
    );
  });

  it("should still refuse a jwk given in the header", async () => {
    await expect(
      sign({ payload: {}, key: privateKey, embedKey: publicKey, header: { jwk: {} } as never }),
    ).rejects.toThrow(new TypeError("sign: input.header.jwk is not supported."));
  });
});

const valueOrThrow = <T>(result: { ok: true; value: T } | { ok: false }): T => {
  if (!result.ok) {
    throw new Error("expected ok");
  }
  return result.value;
};

describe("sign values from another realm", () => {
  const foreign = <T>(source: string): T => runInNewContext(source) as T;

  it("should accept a payload, a header and nested containers created in another realm", async () => {
    const payload = foreign<Record<string, unknown>>(
      '({ sub: "user-1", aud: ["a", "b"], extra: { list: [1, { deep: true }] } })',
    );
    const header = foreign<SignHeader>('({ typ: "JWT", custom: { list: [null] } })');

    const token = await sign({ payload, key: secretKey, header });

    expect(headerTextOf(token)).toBe('{"alg":"HS256","typ":"JWT","custom":{"list":[null]}}');
    expect(payloadTextOf(token)).toBe('{"sub":"user-1","aud":["a","b"],"extra":{"list":[1,{"deep":true}]}}');
  });

  it.each([
    ["an Array subclass", "({ aud: new (class extends Array {})() })", "must hold only plain objects and arrays."],
    [
      "an array with a swapped prototype",
      '({ aud: Object.setPrototypeOf(["a"], { toJSON: () => 5 }) })',
      "must hold only plain objects and arrays.",
    ],
    [
      "an object with a swapped prototype",
      "({ claim: Object.setPrototypeOf({}, { toJSON: () => 5 }) })",
      "must hold only plain objects and arrays.",
    ],
    ["an object with an own toJSON", "({ claim: { toJSON: () => 5 } })", "must not hold toJSON methods."],
    [
      "an array with an own toJSON",
      '({ claim: Object.defineProperty(["a"], "toJSON", { value: () => 5 }) })',
      "must not hold toJSON methods.",
    ],
  ])("should throw for %s from another realm", async (_, source, message) => {
    await expect(sign({ payload: foreign<Record<string, unknown>>(source), key: secretKey })).rejects.toThrow(
      `sign: input.payload ${message}`,
    );
  });

  it.each([
    ["Object.prototype", "({ claim: { a: 1 } })"],
    ["Array.prototype", '({ claim: ["a"] })'],
  ])("should throw when the other realm's %s has a polluting toJSON", async (prototype, source) => {
    const payload = foreign<Record<string, unknown>>(`${prototype}.toJSON = () => 5; ${source}`);

    await expect(sign({ payload, key: secretKey })).rejects.toThrow(
      "sign: input.payload must not hold toJSON methods.",
    );
  });
});

describe("sign reads each value once", () => {
  it("should sign the exp a Proxy showed the checks, not a later read", async () => {
    let reads = 0;
    const later = (value: unknown): unknown => {
      reads += 1;
      return reads > 1 ? Date.now() : value;
    };
    const payload = new Proxy(
      { exp: 100 },
      {
        get: (target, name) => (name === "exp" ? later(target.exp) : Reflect.get(target, name)),
        getOwnPropertyDescriptor: (target, name) => {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, name);
          return name === "exp" && descriptor !== undefined ? { ...descriptor, value: later(target.exp) } : descriptor;
        },
      },
    );

    const token = await sign({ payload, key: secretKey });

    expect(payloadTextOf(token)).toBe('{"exp":100}');
    expect(reads).toBe(1);
  });

  it("should read each member's descriptor once", async () => {
    const seen: string[] = [];
    const trace = <T extends object>(target: T): T =>
      new Proxy(target, {
        getOwnPropertyDescriptor: (inner, name) => {
          seen.push(String(name));
          return Reflect.getOwnPropertyDescriptor(inner, name);
        },
      });

    await sign({ payload: trace({ sub: "u", list: trace(["a"]) }), key: secretKey, header: trace({ typ: "JWT" }) });

    expect(seen.toSorted()).toEqual(["0", "list", "sub", "typ"]);
  });
});

describe("sign header types", () => {
  // Each header below is a compile error that `pnpm typecheck` checks; at runtime each one still throws.
  it("should refuse each refused member at compile time", async () => {
    const refused: SignHeader[] = [
      // @ts-expect-error crit is refused.
      { crit: ["exp"] },
      // @ts-expect-error b64 is refused.
      { b64: false },
      // @ts-expect-error jwk is refused; embedKey writes it.
      { jwk: { kty: "EC" } },
      // @ts-expect-error jku is refused.
      { jku: "https://attacker.example/jwks" },
      // @ts-expect-error x5u is refused.
      { x5u: "https://attacker.example/cert" },
      // @ts-expect-error x5c is refused.
      { x5c: ["MII"] },
    ];

    await Promise.all(
      refused.map((header) =>
        expect(sign({ payload: {}, key: secretKey, header })).rejects.toThrow("is not supported."),
      ),
    );
  });
});
