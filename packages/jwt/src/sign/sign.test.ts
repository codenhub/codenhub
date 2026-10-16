import { beforeAll, describe, expect, it } from "vitest";

import type { PrivateKey, PublicKey, SecretKey } from "../core/types";
import { decodeBase64Url } from "../encoding/base64url";
import { generateKeyPair, generateSecretKey } from "../keys/generate";
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
    ["a nested Date", { d: new Date(0) }, "sign: input.payload must hold only plain objects and arrays."],
    ["an array hole", { list: holey() }, "sign: input.payload must not hold array holes."],
    ["undefined in an array", { list: [undefined] }, "sign: input.payload must hold only JSON values, not undefined."],
  ])("should throw when the payload holds %s", async (_, payload, message) => {
    await expect(sign({ payload, key: secretKey })).rejects.toThrow(message);
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
