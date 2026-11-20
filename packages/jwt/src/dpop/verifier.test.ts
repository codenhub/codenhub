import { runInNewContext } from "node:vm";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { JwtIssue, KeyPair, PrivateKey } from "../core/types";
import { encodeBase64Url } from "../encoding/base64url";
import { exportPrivateJwk, exportPublicJwk } from "../keys/export";
import { generateKeyPair, generateSecretKey } from "../keys/generate";
import { issuesOf, valueOf } from "../keys/test-fixtures";
import { jwkThumbprint } from "../keys/thumbprint";
import { signRaw } from "../verify/test-support";
import { createDpopProof } from "./create-proof";
import { createDpopVerifier, type DpopRequest } from "./verifier";

/** The proofs' `iat`, in seconds. */
const IAT = 1_800_000_000;
const clockAt =
  (offsetSeconds = 0): (() => number) =>
  () =>
    (IAT + offsetSeconds) * 1000;

const URL_ = "https://rs.example/orders";
const REQUEST: DpopRequest = { method: "GET", url: URL_ };
const ACCESS_TOKEN = "Kz~8mXK1EalYznwH-LC-1fBAo.4Ljp~zsPE_NeO.gxU";
const ATH = "fUHyO2r2Z3DZ53EsNrWBb0xWXoaNy59IiKCAqksmQEo";

let pair: KeyPair;
let jwk: Record<string, string>;

beforeAll(async () => {
  pair = await generateKeyPair({ alg: "ES256" });
  const { kty, crv, x, y } = await exportPublicJwk(pair.publicKey);
  jwk = { kty, crv, x, y } as Record<string, string>;
});

const proofOf = (input: Partial<Parameters<typeof createDpopProof>[0]> = {}): Promise<string> =>
  createDpopProof({ key: pair.privateKey, method: "GET", url: URL_, jti: "j1", now: clockAt(), ...input });

/** Signs any header and payload with `key`, as a client holding it could, `typ` and `jwk` included. */
const rawProof = (header: object, payload: object, key: PrivateKey = pair.privateKey): Promise<string> =>
  signRaw(key, JSON.stringify({ alg: key.alg, typ: "dpop+jwt", jwk, ...header }), JSON.stringify(payload));

const CLAIMS = { jti: "j1", htm: "GET", htu: URL_, iat: IAT };

const failure = (...issues: JwtIssue[]) => ({ ok: false, error: { issues } });

describe("createDpopVerifier", () => {
  it("should return the header, payload, key and thumbprint of a valid proof", async () => {
    const verify = createDpopVerifier({ now: clockAt() });

    const result = valueOf(await verify(await proofOf(), REQUEST));

    expect(result.header).toEqual({ alg: "ES256", typ: "dpop+jwt", jwk });
    expect(result.payload).toEqual(CLAIMS);
    expect(result.key).toMatchObject({ kind: "public", alg: "ES256" });
    expect(result.thumbprint).toBe(await jwkThumbprint(pair.publicKey));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.payload)).toBe(true);
    expect(Object.isFrozen(result.header.jwk)).toBe(true);
  });

  // RFC 9449 §4.1, Figure 4: the example proof, verified at its own iat.
  it("should verify the example proof of RFC 9449", async () => {
    const proof =
      "eyJ0eXAiOiJkcG9wK2p3dCIsImFsZyI6IkVTMjU2IiwiandrIjp7Imt0eSI6IkVDIiwieCI6Imw4dEZyaHgtMzR0VjNoUklDUkRZOXpDa0Rs" +
      "cEJoRjQyVVFVZldWQVdCRnMiLCJ5IjoiOVZFNGpmX09rX282NHpiVFRsY3VOSmFqSG10NnY5VERWclUwQ2R2R1JEQSIsImNydiI6IlAtMjU2" +
      "In19.eyJqdGkiOiItQndDM0VTYzZhY2MybFRjIiwiaHRtIjoiUE9TVCIsImh0dSI6Imh0dHBzOi8vc2VydmVyLmV4YW1wbGUuY29tL3Rva2Vu" +
      "IiwiaWF0IjoxNTYyMjYyNjE2fQ.2-GxA6T8lP4vfrg8v-FdWP0A0zdrj8igiMLvqRMUvwnQg4PtFLbdLXiOSsX0x7NVY-FNyJK70nfbV37xRZT3Lg";
    const verify = createDpopVerifier({ now: () => 1_562_262_616_000 });

    const result = await verify(proof, { method: "POST", url: "https://server.example.com/token" });

    expect(valueOf(result).payload).toEqual({
      jti: "-BwC3ESc6acc2lTc",
      htm: "POST",
      htu: "https://server.example.com/token",
      iat: 1_562_262_616,
    });
  });

  it.each(["ES256", "EdDSA", "RS256"] as const)("should verify a %s proof createDpopProof signed", async (alg) => {
    const keys = await generateKeyPair({ alg });
    const proof = await createDpopProof({ key: keys.privateKey, method: "POST", url: URL_, now: clockAt() });

    const result = await createDpopVerifier({ now: clockAt() })(proof, { method: "POST", url: URL_ });

    expect(valueOf(result).thumbprint).toBe(await jwkThumbprint(keys.publicKey));
    expect(valueOf(result).key.alg).toBe(alg);
  });

  describe("structure and key", () => {
    it.each([
      ["a non-string", 42, { code: "malformed" }],
      ["two segments", "a.b", { code: "malformed" }],
    ])("should refuse %s", async (_, proof, issue) => {
      expect(await createDpopVerifier()(proof, REQUEST)).toEqual(failure(issue as JwtIssue));
    });

    it("should refuse a proof longer than maxLength before decoding it", async () => {
      const proof = await proofOf();

      expect(await createDpopVerifier({ maxLength: 100 })(proof, REQUEST)).toEqual(
        failure({ code: "too_large", params: { limit: "length", maximum: 100 } }),
      );
      expect(await createDpopVerifier()(`${proof}${"A".repeat(8192)}`, REQUEST)).toEqual(
        failure({ code: "too_large", params: { limit: "length", maximum: 8192 } }),
      );
    });

    it.each([
      ["no typ", { typ: undefined }],
      ["typ JWT", { typ: "JWT" }],
      ["typ in other casing", { typ: "DPoP+JWT" }],
      ["typ with the application/ prefix", { typ: "application/dpop+jwt" }],
    ])("should refuse %s as wrong_type", async (_, header) => {
      const proof = await rawProof(header, CLAIMS);

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure({ code: "wrong_type", path: ["header", "typ"] }),
      );
    });

    it("should refuse an alg the verifier does not allow", async () => {
      const proof = await proofOf();

      expect(await createDpopVerifier({ algorithms: ["EdDSA"], now: clockAt() })(proof, REQUEST)).toEqual(
        failure({ code: "unsupported_alg", path: ["header", "alg"] }),
      );
    });

    it("should refuse an HMAC proof, whose key would be a secret", async () => {
      const secret = await generateSecretKey({ alg: "HS256", extractable: true });
      const proof = await signRaw(
        secret,
        JSON.stringify({ alg: "HS256", typ: "dpop+jwt", jwk: { kty: "oct", k: encodeBase64Url(new Uint8Array(32)) } }),
        JSON.stringify(CLAIMS),
      );

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure({ code: "unsupported_alg", path: ["header", "alg"] }),
      );
    });

    it.each([
      ["no jwk", { jwk: undefined }],
      ["a jwk that is a string", { jwk: "-----BEGIN PUBLIC KEY-----" }],
      ["a jwk that is an array", { jwk: [] }],
    ])("should refuse %s as malformed", async (_, header) => {
      const proof = await rawProof(header, CLAIMS);

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure({ code: "malformed", path: ["header", "jwk"] }),
      );
    });

    it("should refuse a jwk that holds the private key", async () => {
      const privateJwk = await exportPrivateJwk(
        (await generateKeyPair({ alg: "ES256", extractable: true })).privateKey,
      );
      const proof = await rawProof({ jwk: privateJwk }, CLAIMS);

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure({ code: "unexpected_private_key", path: ["header", "jwk", "d"] }),
      );
    });

    it("should refuse a jwk of a secret under an asymmetric alg", async () => {
      const proof = await rawProof({ jwk: { kty: "oct", k: encodeBase64Url(new Uint8Array(32)) } }, CLAIMS);

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure({ code: "unsupported_key", path: ["header", "jwk", "kty"] }),
      );
    });

    it("should refuse a jwk whose type does not fit the header's alg", async () => {
      const rsa = await generateKeyPair({ alg: "RS256" });
      const proof = await rawProof({ alg: "ES256", jwk: await exportPublicJwk(rsa.publicKey) }, CLAIMS);

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure({ code: "unsupported_key", path: ["header", "jwk", "kty"] }),
      );
    });

    it("should refuse a jwk whose own alg names another algorithm", async () => {
      const proof = await rawProof({ jwk: { ...jwk, alg: "ES384" } }, CLAIMS);

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure({ code: "alg_mismatch", path: ["header", "jwk", "alg"] }),
      );
    });

    it("should refuse a proof signed by another key than its jwk", async () => {
      const other = await generateKeyPair({ alg: "ES256" });
      const proof = await rawProof({}, CLAIMS, other.privateKey);

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(failure({ code: "bad_signature" }));
    });

    it("should refuse a proof whose payload was changed", async () => {
      const [header, , signature] = (await proofOf()).split(".");
      const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({ ...CLAIMS, htm: "POST" })));

      expect(
        await createDpopVerifier({ now: clockAt() })(`${header}.${payload}.${signature}`, {
          ...REQUEST,
          method: "POST",
        }),
      ).toEqual(failure({ code: "bad_signature" }));
    });
  });

  describe("claims", () => {
    it("should report every missing claim", async () => {
      const proof = await rawProof({}, {});

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure(
          { code: "missing_claim", path: ["payload", "iat"], params: { claim: "iat" } },
          { code: "missing_claim", path: ["payload", "jti"], params: { claim: "jti" } },
          { code: "missing_claim", path: ["payload", "htm"], params: { claim: "htm" } },
          { code: "missing_claim", path: ["payload", "htu"], params: { claim: "htu" } },
        ),
      );
    });

    it("should report claims of the wrong type once each", async () => {
      const proof = await rawProof({}, { jti: 1, htm: ["GET"], htu: {}, iat: "now" });

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure(
          { code: "invalid_claim", path: ["payload", "iat"] },
          { code: "invalid_claim", path: ["payload", "jti"] },
          { code: "invalid_claim", path: ["payload", "htm"] },
          { code: "invalid_claim", path: ["payload", "htu"] },
        ),
      );
    });

    it("should refuse an htu that is not an absolute http(s) URL as invalid_claim", async () => {
      const proof = await rawProof({}, { ...CLAIMS, htu: "/orders" });

      expect(await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).toEqual(
        failure({ code: "invalid_claim", path: ["payload", "htu"] }),
      );
    });

    it.each([
      ["a lowercase method", "get"],
      ["another method", "POST"],
    ])("should refuse %s as wrong_method", async (_, method) => {
      expect(await createDpopVerifier({ now: clockAt() })(await proofOf(), { ...REQUEST, method })).toEqual(
        failure({ code: "wrong_method", path: ["payload", "htm"] }),
      );
    });

    it.each([
      ["another path", "https://rs.example/other"],
      ["another host", "https://evil.example/orders"],
      ["another scheme", "http://rs.example/orders"],
      ["another port", "https://rs.example:8443/orders"],
      ["a trailing slash", "https://rs.example/orders/"],
    ])("should refuse %s as wrong_url", async (_, url) => {
      expect(await createDpopVerifier({ now: clockAt() })(await proofOf(), { ...REQUEST, url })).toEqual(
        failure({ code: "wrong_url", path: ["payload", "htu"] }),
      );
    });

    // RFC 9449 §4.3: the comparison ignores query and fragment, after syntax- and scheme-based normalization.
    it.each([
      ["a query and fragment on the request", "https://rs.example/orders?page=2#top"],
      ["scheme and host case", "HTTPS://RS.EXAMPLE/orders"],
      ["the default port", "https://rs.example:443/orders"],
      ["a dot segment", "https://rs.example/a/../orders"],
      ["a URL object", new URL("https://rs.example/orders?x")],
    ])("should accept %s", async (_, url) => {
      expect((await createDpopVerifier({ now: clockAt() })(await proofOf(), { ...REQUEST, url })).ok).toBe(true);
    });

    it("should accept an htu with a query, which the comparison ignores", async () => {
      const proof = await rawProof({}, { ...CLAIMS, htu: "https://RS.example:443/orders?a=1#f" });

      expect((await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).ok).toBe(true);
    });

    describe("iat window", () => {
      it("should accept a proof up to maxAge old, 60 seconds by default", async () => {
        const proof = await proofOf();

        expect((await createDpopVerifier({ now: clockAt(60) })(proof, REQUEST)).ok).toBe(true);
        expect(await createDpopVerifier({ now: clockAt(61) })(proof, REQUEST)).toEqual(
          failure({ code: "too_old", path: ["payload", "iat"], params: { maxAge: 60 } }),
        );
      });

      it("should take maxAge and clockTolerance", async () => {
        const proof = await proofOf();
        const verify = createDpopVerifier({ maxAge: 10, clockTolerance: 5, now: clockAt(15) });

        expect((await verify(proof, REQUEST)).ok).toBe(true);
        expect((await createDpopVerifier({ maxAge: 10, clockTolerance: 5, now: clockAt(16) })(proof, REQUEST)).ok).toBe(
          false,
        );
      });

      it("should refuse a proof issued more than 60 seconds in the future", async () => {
        const proof = await proofOf();

        expect((await createDpopVerifier({ now: clockAt(-60) })(proof, REQUEST)).ok).toBe(true);
        expect(await createDpopVerifier({ now: clockAt(-61) })(proof, REQUEST)).toEqual(
          failure({ code: "issued_in_future", path: ["payload", "iat"] }),
        );
      });

      it("should check exp when a proof carries one", async () => {
        const proof = await rawProof({}, { ...CLAIMS, exp: IAT + 1 });

        expect(await createDpopVerifier({ now: clockAt(1) })(proof, REQUEST)).toEqual(
          failure({ code: "expired", path: ["payload", "exp"] }),
        );
      });
    });

    describe("ath", () => {
      it("should accept the hash of the access token", async () => {
        const proof = await proofOf({ accessToken: ACCESS_TOKEN });

        const result = await createDpopVerifier({ now: clockAt() })(proof, { ...REQUEST, accessToken: ACCESS_TOKEN });

        expect(valueOf(result).payload.ath).toBe(ATH);
      });

      it("should require ath when an access token is given", async () => {
        expect(
          await createDpopVerifier({ now: clockAt() })(await proofOf(), { ...REQUEST, accessToken: ACCESS_TOKEN }),
        ).toEqual(failure({ code: "missing_claim", path: ["payload", "ath"], params: { claim: "ath" } }));
      });

      it("should refuse the hash of another access token", async () => {
        const proof = await proofOf({ accessToken: "another-token" });

        expect(await createDpopVerifier({ now: clockAt() })(proof, { ...REQUEST, accessToken: ACCESS_TOKEN })).toEqual(
          failure({ code: "wrong_access_token_hash", path: ["payload", "ath"] }),
        );
      });

      it("should refuse an ath that is not a string", async () => {
        const proof = await rawProof({}, { ...CLAIMS, ath: 1 });

        expect(await createDpopVerifier({ now: clockAt() })(proof, { ...REQUEST, accessToken: ACCESS_TOKEN })).toEqual(
          failure({ code: "invalid_claim", path: ["payload", "ath"] }),
        );
      });

      it("should ignore ath when no access token is given, as at the token endpoint", async () => {
        const proof = await proofOf({ accessToken: ACCESS_TOKEN });

        expect((await createDpopVerifier({ now: clockAt() })(proof, REQUEST)).ok).toBe(true);
      });
    });

    describe("nonce", () => {
      const WRONG_NONCE = failure({ code: "wrong_nonce", path: ["payload", "nonce"] });

      it.each([
        ["one value", "n1"],
        ["a list", ["n0", "n1"]],
        ["a function", (nonce: string) => nonce === "n1"],
        ["an async function", async (nonce: string) => Promise.resolve(nonce === "n1")],
      ])("should accept a nonce matching %s", async (_, nonce) => {
        const proof = await proofOf({ nonce: "n1" });

        expect((await createDpopVerifier({ nonce, now: clockAt() })(proof, REQUEST)).ok).toBe(true);
      });

      it.each([
        ["one value", "n2"],
        ["a list", ["n2", "n3"]],
        ["a function", () => false],
      ])("should refuse a nonce not matching %s", async (_, nonce) => {
        const proof = await proofOf({ nonce: "n1" });

        expect(await createDpopVerifier({ nonce, now: clockAt() })(proof, REQUEST)).toEqual(WRONG_NONCE);
      });

      // RFC 9449 §8: a missing or invalid nonce both get use_dpop_nonce, so both are one code.
      it("should refuse a missing nonce with the same code", async () => {
        const isCurrent = vi.fn(() => true);

        expect(await createDpopVerifier({ nonce: isCurrent, now: clockAt() })(await proofOf(), REQUEST)).toEqual(
          WRONG_NONCE,
        );
        expect(isCurrent).not.toHaveBeenCalled();
      });

      it("should refuse a nonce that is not a string with the same code", async () => {
        const proof = await rawProof({}, { ...CLAIMS, nonce: 1 });

        expect(await createDpopVerifier({ nonce: "n1", now: clockAt() })(proof, REQUEST)).toEqual(WRONG_NONCE);
      });

      it("should hand the function the nonce and the proof's thumbprint and keepUntil", async () => {
        const isCurrent = vi.fn(() => true);
        const proof = await proofOf({ nonce: "n1" });

        await createDpopVerifier({ nonce: isCurrent, now: clockAt() })(proof, REQUEST);

        expect(isCurrent).toHaveBeenCalledWith("n1", {
          thumbprint: await jwkThumbprint(pair.publicKey),
          keepUntil: IAT + 60,
        });
      });

      it("should not call the function for a proof that failed another check", async () => {
        const isCurrent = vi.fn(() => true);
        const proof = await proofOf({ nonce: "n1" });

        await createDpopVerifier({ nonce: isCurrent, now: clockAt() })(proof, { ...REQUEST, method: "POST" });

        expect(isCurrent).not.toHaveBeenCalled();
      });

      it("should ignore a nonce when the verifier has no nonce option", async () => {
        expect((await createDpopVerifier({ now: clockAt() })(await proofOf({ nonce: "n1" }), REQUEST)).ok).toBe(true);
      });
    });

    describe("key binding", () => {
      it("should accept a proof whose key the access token is bound to", async () => {
        const accessTokenClaims = { cnf: { jkt: await jwkThumbprint(pair.publicKey) } };

        expect(
          (await createDpopVerifier({ now: clockAt() })(await proofOf(), { ...REQUEST, accessTokenClaims })).ok,
        ).toBe(true);
      });

      it.each([
        ["another key's thumbprint", { cnf: { jkt: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } }],
        ["no cnf", {}],
        ["a cnf without jkt", { cnf: { "x5t#S256": "abc" } }],
        ["a jkt that is not a string", { cnf: { jkt: 1 } }],
        ["a cnf that is a string", { cnf: "jkt" }],
      ])("should refuse an access token with %s as wrong_key", async (_, accessTokenClaims) => {
        expect(
          await createDpopVerifier({ now: clockAt() })(await proofOf(), { ...REQUEST, accessTokenClaims }),
        ).toEqual(failure({ code: "wrong_key", path: ["header", "jwk"] }));
      });

      it("should not run a getter on the access token's claims", async () => {
        const accessTokenClaims = {
          get cnf() {
            throw new Error("getter ran");
          },
        };

        expect(
          await createDpopVerifier({ now: clockAt() })(await proofOf(), { ...REQUEST, accessTokenClaims }),
        ).toEqual(failure({ code: "wrong_key", path: ["header", "jwk"] }));
      });
    });

    describe("jti replay", () => {
      it("should hand acceptJti the jti, thumbprint and keepUntil, and accept when it returns true", async () => {
        const acceptJti = vi.fn(async () => Promise.resolve(true));

        const result = await createDpopVerifier({ acceptJti, maxAge: 30, clockTolerance: 5, now: clockAt() })(
          await proofOf(),
          REQUEST,
        );

        expect(result.ok).toBe(true);
        expect(acceptJti).toHaveBeenCalledWith("j1", {
          thumbprint: await jwkThumbprint(pair.publicKey),
          keepUntil: IAT + 35,
        });
      });

      it("should refuse a jti acceptJti does not accept as replayed", async () => {
        expect(await createDpopVerifier({ acceptJti: () => false, now: clockAt() })(await proofOf(), REQUEST)).toEqual(
          failure({ code: "replayed", path: ["payload", "jti"] }),
        );
      });

      it("should not call acceptJti for a proof that failed another check, so it records no jti", async () => {
        const acceptJti = vi.fn(() => true);

        await createDpopVerifier({ acceptJti, now: clockAt(120) })(await proofOf(), REQUEST);
        await createDpopVerifier({ acceptJti, nonce: "n2", now: clockAt() })(await proofOf({ nonce: "n1" }), REQUEST);

        expect(acceptJti).not.toHaveBeenCalled();
      });

      it.each([
        [
          "throws",
          () => {
            throw new Error("store down");
          },
        ],
        ["rejects", () => Promise.reject(new Error("store down"))],
        ["returns something other than a boolean", () => "yes"],
      ])(
        "should report callback_failed when acceptJti %s, and hand the error to onCallbackError",
        async (_, acceptJti) => {
          const onCallbackError = vi.fn();

          const result = await createDpopVerifier({ acceptJti: acceptJti as never, onCallbackError, now: clockAt() })(
            await proofOf(),
            REQUEST,
          );

          expect(result).toEqual(failure({ code: "callback_failed", params: { option: "acceptJti" } }));
          expect(onCallbackError).toHaveBeenCalledOnce();
          expect(onCallbackError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
        },
      );

      it("should report callback_failed for a nonce function that throws", async () => {
        const result = await createDpopVerifier({
          nonce: () => {
            throw new Error("store down");
          },
          now: clockAt(),
        })(await proofOf({ nonce: "n1" }), REQUEST);

        expect(result).toEqual(failure({ code: "callback_failed", params: { option: "nonce" } }));
      });

      it("should swallow an onCallbackError that throws or rejects", async () => {
        const verify = (onCallbackError: () => unknown) =>
          createDpopVerifier({ acceptJti: () => Promise.reject(new Error("x")), onCallbackError, now: clockAt() });

        expect(
          (
            await verify(() => {
              throw new Error("logger down");
            })(await proofOf(), REQUEST)
          ).ok,
        ).toBe(false);
        expect((await verify(() => Promise.reject(new Error("logger down")))(await proofOf(), REQUEST)).ok).toBe(false);
      });
    });
  });

  describe("issues carry no input", () => {
    it("should not echo claim, header or key values", async () => {
      const marker = "MARKER-3f9a";
      const proof = await rawProof(
        { kid: marker, jwk: { ...jwk, x: marker } },
        { jti: marker, htm: marker, htu: `https://${marker}.example/`, iat: IAT },
      );
      const verify = createDpopVerifier({ nonce: "n", now: clockAt() });

      const results = [
        await verify(proof, REQUEST),
        await verify(
          await rawProof(
            {},
            { jti: marker, htm: marker, htu: `https://${marker}.example/`, iat: IAT, nonce: marker, ath: marker },
          ),
          {
            ...REQUEST,
            accessToken: marker,
            accessTokenClaims: { cnf: { jkt: marker } },
          },
        ),
      ];

      for (const result of results) {
        expect(result.ok).toBe(false);
        expect(JSON.stringify(result)).not.toContain(marker);
      }
      expect(issuesOf(results[1] as never).map((issue) => issue.code)).toEqual([
        "wrong_method",
        "wrong_url",
        "wrong_access_token_hash",
        "wrong_nonce",
        "wrong_key",
      ]);
    });
  });

  describe("programmer errors", () => {
    it.each([
      ["options that are not an object", 1, "createDpopVerifier: options must be an object."],
      ["an unknown option", { maxage: 60 }, "createDpopVerifier: options.maxage is not an option."],
      [
        "algorithms with a symmetric one",
        { algorithms: ["HS256"] },
        "createDpopVerifier: options.algorithms must be a non-empty array of asymmetric algorithms.",
      ],
      [
        "empty algorithms",
        { algorithms: [] },
        "createDpopVerifier: options.algorithms must be a non-empty array of asymmetric algorithms.",
      ],
      [
        "a maxAge of 0",
        { maxAge: 0 },
        "createDpopVerifier: options.maxAge must be a positive integer number of seconds.",
      ],
      [
        "a clockTolerance over 300",
        { clockTolerance: 301 },
        "createDpopVerifier: options.clockTolerance must be an integer number of seconds from 0 through 300.",
      ],
      [
        "a maxLength over 65536",
        { maxLength: 65_537 },
        "createDpopVerifier: options.maxLength must be an integer from 1 through 65536.",
      ],
      [
        "an empty nonce",
        { nonce: "" },
        "createDpopVerifier: options.nonce must be a non-empty string, a non-empty array of them, or a function.",
      ],
      [
        "an empty nonce list",
        { nonce: [] },
        "createDpopVerifier: options.nonce must be a non-empty string, a non-empty array of them, or a function.",
      ],
      [
        "an acceptJti that is not a function",
        { acceptJti: true },
        "createDpopVerifier: options.acceptJti must be a function.",
      ],
      [
        "a now that is not a function",
        { now: 1 },
        "createDpopVerifier: options.now must be a function returning milliseconds.",
      ],
      [
        "an onCallbackError that is not a function",
        { onCallbackError: 1 },
        "createDpopVerifier: options.onCallbackError must be a function.",
      ],
    ])("should throw for %s", (_, options, message) => {
      expect(() => createDpopVerifier(options as never)).toThrow(new TypeError(message));
    });

    it("should take option arrays from another realm", async () => {
      const options = runInNewContext('({ algorithms: ["ES256"], nonce: ["n1"] })') as object;

      expect(
        (await createDpopVerifier({ ...options, now: clockAt() })(await proofOf({ nonce: "n1" }), REQUEST)).ok,
      ).toBe(true);
    });

    it("should take a request from another realm", async () => {
      const request = runInNewContext(`({ method: "GET", url: { href: "${URL_}" } })`) as DpopRequest;

      expect((await createDpopVerifier({ now: clockAt() })(await proofOf(), request)).ok).toBe(true);
    });

    it.each([
      ["a request that is not an object", undefined, "createDpopVerifier: request must be an object."],
      ["an unknown request member", { ...REQUEST, jkt: "x" }, "createDpopVerifier: request.jkt is not an option."],
      [
        "a method that is not a token",
        { ...REQUEST, method: "" },
        "createDpopVerifier: request.method must be an HTTP method token.",
      ],
      [
        "a relative url",
        { ...REQUEST, url: "/orders" },
        "createDpopVerifier: request.url must be an absolute http: or https: URL.",
      ],
      [
        "an empty accessToken",
        { ...REQUEST, accessToken: "" },
        "createDpopVerifier: request.accessToken must be a non-empty string.",
      ],
      [
        "accessTokenClaims that are not an object",
        { ...REQUEST, accessTokenClaims: "jkt" },
        "createDpopVerifier: request.accessTokenClaims must be an object.",
      ],
    ])("should reject for %s", async (_, request, message) => {
      await expect(createDpopVerifier()(await proofOf(), request as never)).rejects.toThrow(new TypeError(message));
    });

    it("should reject when now returns something other than a finite number", async () => {
      await expect(createDpopVerifier({ now: () => Number.NaN })(await proofOf(), REQUEST)).rejects.toThrow(TypeError);
    });
  });
});
