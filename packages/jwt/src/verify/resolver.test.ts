import { beforeAll, describe, expect, it, vi } from "vitest";

import type { KeySet, KeySetResolver } from "../core/types";
import { generateKeyPair, type KeyPair } from "../keys/generate";
import { createKeySet } from "../keysets/local";
import { sign } from "../sign/sign";
import { createVerifier } from "./create-verifier";
import { clockAt, failure, NOW_SECONDS, signRaw } from "./test-support";

const ISSUER_A = "https://a.issuer.example";
const ISSUER_B = "https://b.issuer.example";

let pairA: KeyPair;
let pairB: KeyPair;
let sets: Map<string, KeySet>;

beforeAll(async () => {
  [pairA, pairB] = await Promise.all([
    generateKeyPair({ alg: "ES256", kid: "same-kid" }),
    generateKeyPair({ alg: "ES256", kid: "same-kid" }),
  ]);
  sets = new Map([
    [ISSUER_A, createKeySet([pairA.publicKey])],
    [ISSUER_B, createKeySet([pairB.publicKey])],
  ]);
});

const verifierWith = (keys: KeySetResolver, issuer?: string | readonly string[]) =>
  createVerifier({ keys, now: clockAt(), ...(issuer === undefined ? {} : { issuer }) });

const tokenFor = (pair: KeyPair, payload: object) =>
  sign({ payload: { exp: NOW_SECONDS + 60, ...payload }, key: pair.privateKey });

describe("createVerifier with a key set resolver", () => {
  it("should verify each issuer's token with that issuer's keys", async () => {
    const verify = verifierWith((issuer) => sets.get(issuer));

    const a = await verify(await tokenFor(pairA, { iss: ISSUER_A }));
    const b = await verify(await tokenFor(pairB, { iss: ISSUER_B }));

    expect(a.ok && a.value.payload.iss).toBe(ISSUER_A);
    expect(b.ok && b.value.payload.iss).toBe(ISSUER_B);
  });

  it("should refuse a token signed with one issuer's key that claims another issuer", async () => {
    const verify = verifierWith((issuer) => sets.get(issuer));

    expect(await verify(await tokenFor(pairA, { iss: ISSUER_B }))).toEqual(failure({ code: "bad_signature" }));
  });

  it("should pass the claimed issuer and the header to the resolver", async () => {
    const resolver = vi.fn<KeySetResolver>((issuer) => sets.get(issuer));

    await verifierWith(resolver)(await tokenFor(pairA, { iss: ISSUER_A }));

    expect(resolver).toHaveBeenCalledWith(ISSUER_A, { alg: "ES256", kid: "same-kid" });
  });

  it("should accept a resolver that returns a promise", async () => {
    const verify = verifierWith(async (issuer) => sets.get(issuer));

    expect((await verify(await tokenFor(pairA, { iss: ISSUER_A }))).ok).toBe(true);
  });

  it("should fail with wrong_issuer when the resolver knows no such issuer", async () => {
    const verify = verifierWith((issuer) => sets.get(issuer));

    expect(await verify(await tokenFor(pairA, { iss: "https://unknown.example" }))).toEqual(
      failure({ code: "wrong_issuer", path: ["payload", "iss"] }),
    );
  });

  it("should not call the resolver for an issuer the verifier refuses", async () => {
    const resolver = vi.fn<KeySetResolver>((issuer) => sets.get(issuer));

    const result = await verifierWith(resolver, ISSUER_A)(await tokenFor(pairB, { iss: ISSUER_B }));

    expect(result).toEqual(failure({ code: "wrong_issuer", path: ["payload", "iss"] }));
    expect(resolver).not.toHaveBeenCalled();
  });

  it("should fail with missing_claim when the token has no iss", async () => {
    const resolver = vi.fn<KeySetResolver>((issuer) => sets.get(issuer));

    expect(await verifierWith(resolver)(await tokenFor(pairA, {}))).toEqual(
      failure({ code: "missing_claim", path: ["payload", "iss"], params: { claim: "iss" } }),
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it("should fail with invalid_claim when iss is not a string", async () => {
    const token = await signRaw(pairA.privateKey, '{"alg":"ES256"}', `{"iss":1,"exp":${NOW_SECONDS + 60}}`);

    expect(await verifierWith((issuer) => sets.get(issuer))(token)).toEqual(
      failure({ code: "invalid_claim", path: ["payload", "iss"] }),
    );
  });

  it("should fail with malformed for an unparseable payload without calling the resolver", async () => {
    const resolver = vi.fn<KeySetResolver>((issuer) => sets.get(issuer));
    const token = await signRaw(pairA.privateKey, '{"alg":"ES256"}', '{"iss":');

    expect(await verifierWith(resolver)(token)).toEqual(failure({ code: "malformed", path: ["payload"] }));
    expect(resolver).not.toHaveBeenCalled();
  });

  it("should fail with duplicate_key for a payload that repeats iss", async () => {
    const token = await signRaw(pairA.privateKey, '{"alg":"ES256"}', `{"iss":"${ISSUER_B}","iss":"${ISSUER_A}"}`);

    expect(await verifierWith((issuer) => sets.get(issuer))(token)).toEqual(
      failure({ code: "duplicate_key", path: ["payload"] }),
    );
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("boom");
      },
    ],
    ["rejects", async () => Promise.reject(new Error("boom"))],
    ["returns a non-object", () => "keys" as unknown as KeySet],
    ["returns an object without select", () => ({}) as KeySet],
  ])("should fail with key_set_error when the resolver %s", async (_, resolver) => {
    expect(await verifierWith(resolver)(await tokenFor(pairA, { iss: ISSUER_A }))).toEqual(
      failure({ code: "key_fetch_failed", params: { reason: "key_set_error" } }),
    );
  });

  it("should leave the key set the resolver returns unfrozen", async () => {
    const counted = {
      calls: { count: 0 },
      select: (header: Parameters<KeySet["select"]>[0]) => {
        counted.calls.count += 1;
        return (sets.get(ISSUER_A) as KeySet).select(header);
      },
    };
    const verify = verifierWith(() => counted);

    const first = await verify(await tokenFor(pairA, { iss: ISSUER_A }));
    const second = await verify(await tokenFor(pairA, { iss: ISSUER_A }));

    expect([first.ok, second.ok]).toEqual([true, true]);
    expect(Object.isFrozen(counted) || Object.isFrozen(counted.calls)).toBe(false);
    expect(counted.calls.count).toBe(2);
  });

  it("should still run the claim checks on the routed token", async () => {
    const token = await sign({ payload: { iss: ISSUER_A, exp: NOW_SECONDS - 1 }, key: pairA.privateKey });

    expect(await verifierWith((issuer) => sets.get(issuer))(token)).toEqual(
      failure({ code: "expired", path: ["payload", "exp"] }),
    );
  });

  it("should throw when keys is neither a key set nor a function", () => {
    expect(() => createVerifier({ keys: 1 as unknown as KeySet })).toThrow(
      "createVerifier: options.keys must be a key set (an object with a select function) or a function returning one.",
    );
  });
});

describe("createVerifier with a resolver that returns a route", () => {
  const routeVerifier = (route: object, options: { audience?: string; type?: string } = {}) =>
    createVerifier({ keys: () => route as never, now: clockAt(), ...options });

  it("should check the route's audience instead of the verifier's", async () => {
    const route = { keys: sets.get(ISSUER_A), audience: "tenant-a" };
    const verify = routeVerifier(route, { audience: "verifier-wide" });
    const accepted = await verify(await tokenFor(pairA, { iss: ISSUER_A, aud: "tenant-a" }));
    const refused = await verify(await tokenFor(pairA, { iss: ISSUER_A, aud: "verifier-wide" }));
    expect([accepted.ok, refused]).toEqual([true, failure({ code: "wrong_audience", path: ["payload", "aud"] })]);
  });

  it("should check the route's type instead of the verifier's", async () => {
    const verify = routeVerifier({ keys: sets.get(ISSUER_A), type: "at+jwt" }, { type: "JWT" });
    const token = await sign({
      header: { typ: "at+jwt" },
      payload: { exp: NOW_SECONDS + 60, iss: ISSUER_A },
      key: pairA.privateKey,
    });
    expect((await verify(token)).ok).toBe(true);
  });

  it("should keep the verifier's audience when the route sets none", async () => {
    const verify = routeVerifier({ keys: sets.get(ISSUER_A) }, { audience: "verifier-wide" });
    expect((await verify(await tokenFor(pairA, { iss: ISSUER_A, aud: "verifier-wide" }))).ok).toBe(true);
  });

  it.each([
    ["keys that is not a key set", { keys: {} }],
    ["an invalid audience", { audience: "" }],
    ["an invalid type", { type: ["application/"] }],
  ])("should fail with key_set_error and report a TypeError for a route with %s", async (_name, overrides) => {
    const errors: unknown[] = [];
    const verify = createVerifier({
      keys: () => ({ keys: sets.get(ISSUER_A), ...overrides }) as never,
      now: clockAt(),
      onKeySetError: (error) => errors.push(error),
    });
    expect(await verify(await tokenFor(pairA, { iss: ISSUER_A }))).toEqual(
      failure({ code: "key_fetch_failed", params: { reason: "key_set_error" } }),
    );
    expect(errors.map((error) => error instanceof TypeError)).toEqual([true]);
  });
});
