import { beforeAll, describe, expect, it } from "vitest";

import type { JwtHeader, PublicKey, SecretKey } from "../core/types";
import { generateKeyPair, generateSecretKey } from "../keys";
import { selectKey } from "./select";

let ecA: PublicKey;
let ecB: PublicKey;
let edA: PublicKey;
let ecNoKid: PublicKey;
let ecNoKidOther: PublicKey;
let secretA: SecretKey;

beforeAll(async () => {
  [ecA, ecB, edA, ecNoKid, ecNoKidOther, secretA] = await Promise.all([
    generateKeyPair({ alg: "ES256", kid: "a" }).then((pair) => pair.publicKey),
    generateKeyPair({ alg: "ES256", kid: "b" }).then((pair) => pair.publicKey),
    generateKeyPair({ alg: "EdDSA", kid: "a" }).then((pair) => pair.publicKey),
    generateKeyPair({ alg: "ES256" }).then((pair) => pair.publicKey),
    generateKeyPair({ alg: "ES256" }).then((pair) => pair.publicKey),
    generateSecretKey({ alg: "HS256", kid: "a" }),
  ]);
});

const header = (fields: Partial<JwtHeader> & Pick<JwtHeader, "alg">): JwtHeader => fields;

describe("selectKey with a kid", () => {
  it("should return the key with that kid and alg", () => {
    expect(selectKey([ecA, ecB], header({ alg: "ES256", kid: "b" }))).toEqual({ ok: true, value: ecB });
  });

  it("should report unknown_kid at header.kid when no key has the kid", () => {
    expect(selectKey([ecA, ecB], header({ alg: "ES256", kid: "c" }))).toEqual({
      ok: false,
      error: { issues: [{ code: "unknown_kid", path: ["header", "kid"] }] },
    });
  });

  it("should report alg_mismatch at header.alg when the keys with the kid have another alg", () => {
    expect(selectKey([ecA, ecB], header({ alg: "RS256", kid: "a" }))).toEqual({
      ok: false,
      error: { issues: [{ code: "alg_mismatch", path: ["header", "alg"] }] },
    });
  });

  it("should not fall back to a key without the kid when the kid matches nothing", () => {
    expect(selectKey([ecNoKid], header({ alg: "ES256", kid: "a" }))).toEqual({
      ok: false,
      error: { issues: [{ code: "unknown_kid", path: ["header", "kid"] }] },
    });
  });

  it("should report ambiguous_key when two keys share the kid and alg", () => {
    expect(selectKey([ecA, ecA], header({ alg: "ES256", kid: "a" }))).toEqual({
      ok: false,
      error: { issues: [{ code: "ambiguous_key" }] },
    });
  });

  it("should select the secret key for an HS256 header when a public key shares its kid", () => {
    expect(selectKey([ecA, secretA], header({ alg: "HS256", kid: "a" }))).toEqual({ ok: true, value: secretA });
  });

  it("should select the public key for an ES256 header when a secret key shares its kid", () => {
    expect(selectKey([secretA, ecA], header({ alg: "ES256", kid: "a" }))).toEqual({ ok: true, value: ecA });
  });

  it("should select by alg among keys sharing a kid", () => {
    expect(selectKey([ecA, edA], header({ alg: "EdDSA", kid: "a" }))).toEqual({ ok: true, value: edA });
  });
});

describe("selectKey without a kid", () => {
  it("should return the one key with the header alg", () => {
    expect(selectKey([ecA, edA], header({ alg: "EdDSA" }))).toEqual({ ok: true, value: edA });
  });

  it("should report no_matching_key when no key has the header alg", () => {
    expect(selectKey([ecA, edA], header({ alg: "RS256" }))).toEqual({
      ok: false,
      error: { issues: [{ code: "no_matching_key" }] },
    });
  });

  it("should report ambiguous_key when several keys have the header alg", () => {
    expect(selectKey([ecNoKid, ecNoKidOther], header({ alg: "ES256" }))).toEqual({
      ok: false,
      error: { issues: [{ code: "ambiguous_key" }] },
    });
  });

  it("should report ambiguous_key when keys with a kid also have the header alg", () => {
    expect(selectKey([ecA, ecB], header({ alg: "ES256" }))).toEqual({
      ok: false,
      error: { issues: [{ code: "ambiguous_key" }] },
    });
  });

  it("should never select a secret key for an asymmetric alg", () => {
    expect(selectKey([secretA], header({ alg: "ES256" }))).toEqual({
      ok: false,
      error: { issues: [{ code: "no_matching_key" }] },
    });
  });

  it("should report no_matching_key for a header that is not an object", () => {
    expect(selectKey([ecA], null as unknown as JwtHeader)).toEqual({
      ok: false,
      error: { issues: [{ code: "no_matching_key" }] },
    });
  });
});
