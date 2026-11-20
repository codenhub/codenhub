import { runInNewContext } from "node:vm";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { fail, ok } from "../core/result";
import type { AsymmetricAlgorithm, KeySet, SecretKey, SigningKey, VerificationKey } from "../core/types";
import { encodeBase64Url } from "../encoding/base64url";
import { ALGORITHM_PARAMS } from "../keys/algorithms";
import { generateKeyPair, generateSecretKey } from "../keys/generate";
import { getKeyEntry } from "../keys/registry";
import { createKeySet } from "../keysets/local";
import { sign } from "../sign/sign";
import { signGeneralJws, signJws } from "../sign/sign-jws";
import { createJwsVerifier } from "./create-jws-verifier";
import { failure, keySetOf } from "./test-support";

const bytesOf = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const segmentOf = (text: string): string => encodeBase64Url(bytesOf(text));

/** Signs `<base64url(protectedText)>.<payloadPart>` with `key`, whatever the header says. */
async function forgeSignature(key: SigningKey, protectedText: string, payloadPart: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    ALGORITHM_PARAMS[key.alg].signParams,
    getKeyEntry(key).cryptoKey,
    bytesOf(`${segmentOf(protectedText)}.${payloadPart}`),
  );
  return encodeBase64Url(new Uint8Array(signature));
}

/** A compact JWS with any protected header text and payload part, validly signed by `key`. */
const forgeCompact = async (key: SigningKey, protectedText: string, payloadPart: string): Promise<string> =>
  `${segmentOf(protectedText)}.${payloadPart}.${await forgeSignature(key, protectedText, payloadPart)}`;

/** A flattened JWS JSON serialization with any members, signed over its `protected` and `payload`. */
async function forgeFlattened(
  key: SigningKey,
  protectedText: string,
  payloadPart: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const signature = await forgeSignature(key, protectedText, payloadPart);
  return JSON.stringify({ payload: payloadPart, protected: segmentOf(protectedText), ...extra, signature });
}

let secret: SecretKey;
let otherSecret: SecretKey;
const pairs = {} as Record<"ES256" | "EdDSA" | "RS256", { privateKey: SigningKey; publicKey: VerificationKey }>;

beforeAll(async () => {
  secret = await generateSecretKey({ alg: "HS256", kid: "s" });
  otherSecret = await generateSecretKey({ alg: "HS256", kid: "o" });
  [pairs.ES256, pairs.EdDSA, pairs.RS256] = await Promise.all(
    (["ES256", "EdDSA", "RS256"] as const satisfies readonly AsymmetricAlgorithm[]).map(async (alg) =>
      generateKeyPair({ alg, kid: alg }),
    ),
  );
});

const secretVerifier = (options: { crit?: readonly string[]; maxLength?: number } = {}) =>
  createJwsVerifier({ keys: createKeySet([secret]), ...options });

describe("createJwsVerifier round trips", () => {
  const cases = [
    ["ES256", "compact", true, false],
    ["EdDSA", "compact", false, true],
    ["RS256", "flattened", true, true],
    ["HS256", "flattened", false, false],
    ["ES256", "flattened", false, true],
    ["RS256", "compact", false, false],
  ] as const;

  it.each(cases)("should verify %s %s with b64 %s, detached %s", async (alg, serialization, b64, detached) => {
    const signingKey = alg === "HS256" ? secret : pairs[alg].privateKey;
    const verificationKey = alg === "HS256" ? secret : pairs[alg].publicKey;
    const payload = "a_b-c~1";
    const jws = await signJws({ payload, key: signingKey, b64, detached, serialization });
    const verify = createJwsVerifier({ keys: createKeySet([verificationKey]) });

    const result = await verify(jws, detached ? { payload } : undefined);

    expect(result).toEqual({
      ok: true,
      value: {
        payload: bytesOf(payload),
        header: b64 ? { alg, kid: signingKey.kid } : { alg, kid: signingKey.kid, b64: false, crit: ["b64"] },
        key: verificationKey,
        signatureIndex: 0,
      },
    });
  });

  it("should verify a general JWS with ES256, EdDSA, RS256 and HS256 signers by its last signature", async () => {
    const jws = await signGeneralJws({
      payload: new Uint8Array([1, 2, 3]),
      signers: [
        { key: pairs.ES256.privateKey },
        { key: pairs.EdDSA.privateKey },
        { key: pairs.RS256.privateKey },
        { key: secret },
      ],
    });

    const result = await secretVerifier()(jws);

    expect(result.ok && result.value.signatureIndex).toBe(3);
    expect(result.ok && result.value.payload).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("should verify a JWT as a JWS and return its payload's bytes", async () => {
    const token = await sign({ payload: { sub: "u" }, key: secret });

    const result = await secretVerifier()(token);

    expect(result.ok && new TextDecoder().decode(result.value.payload)).toBe('{"sub":"u"}');
  });

  it("should return the unprotected header of a flattened JWS", async () => {
    const jws = await signJws({
      payload: "x",
      key: secret,
      serialization: "flattened",
      unprotectedHeader: { kid: "s" },
    });

    const result = await secretVerifier()(jws);

    expect(result.ok && result.value.unprotectedHeader).toEqual({ kid: "s" });
    expect(result.ok && result.value.header).toEqual({ alg: "HS256" });
  });

  it("should freeze the result and give each result its own payload bytes", async () => {
    const jws = await signJws({ payload: "x", key: secret, serialization: "flattened", unprotectedHeader: { a: [1] } });
    const verify = secretVerifier();

    const first = await verify(jws);
    const second = await verify(jws);
    const value = first.ok ? first.value : undefined;

    expect(first.ok && second.ok).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value?.header)).toBe(true);
    expect(Object.isFrozen(value?.unprotectedHeader?.a)).toBe(true);
    expect(value?.payload).not.toBe(second.ok && second.value.payload);
  });

  it("should verify a key bound to an issuer whatever the payload holds", async () => {
    const jws = await signJws({ payload: '{"iss":"other"}', key: secret });
    const verify = createJwsVerifier({ keys: createKeySet([secret], { issuer: "https://issuer.example" }) });

    expect((await verify(jws)).ok).toBe(true);
  });
});

describe("createJwsVerifier payloads", () => {
  it("should read an empty compact payload segment as an empty payload", async () => {
    const result = await secretVerifier()(await signJws({ payload: "", key: secret }));

    expect(result.ok && result.value.payload).toEqual(new Uint8Array());
  });

  it("should verify a detached payload given as bytes from another realm", async () => {
    const jws = await signJws({ payload: new Uint8Array([9, 8]), key: secret, detached: true });
    const bytes = runInNewContext("new Uint8Array([9, 8])") as Uint8Array;

    expect((await secretVerifier()(jws, { payload: bytes })).ok).toBe(true);
  });

  it("should fail a detached JWS given another payload", async () => {
    const jws = await signJws({ payload: "a", key: secret, detached: true });

    expect(await secretVerifier()(jws, { payload: "b" })).toEqual(failure({ code: "bad_signature" }));
  });

  it("should refuse a payload given for a compact JWS that carries one", async () => {
    const jws = await signJws({ payload: "a", key: secret });

    expect(await secretVerifier()(jws, { payload: "a" })).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should refuse a payload given for a JSON JWS that carries one", async () => {
    const jws = await signJws({ payload: "a", key: secret, serialization: "flattened" });

    expect(await secretVerifier()(jws, { payload: "a" })).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should report a JSON JWS without payload as missing_payload when none is given", async () => {
    const jws = await signJws({ payload: "a", key: secret, serialization: "flattened", detached: true });

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "missing_payload", path: ["payload"] }));
  });

  it("should refuse a detached payload string with a lone surrogate", async () => {
    const jws = await signJws({ payload: "a", key: secret, detached: true });

    expect(await secretVerifier()(jws, { payload: "\udc00" })).toEqual(
      failure({ code: "malformed", path: ["payload"] }),
    );
  });

  it("should verify an unencoded compact payload", async () => {
    const jws = await forgeCompact(secret, '{"alg":"HS256","b64":false,"crit":["b64"]}', "a b~");

    const result = await secretVerifier()(jws);

    expect(result.ok && result.value.payload).toEqual(bytesOf("a b~"));
  });

  it.each([["é"], ["\t"], ["\u007f"]])("should refuse an unencoded compact payload holding %j", async (text) => {
    const jws = await forgeCompact(secret, '{"alg":"HS256","b64":false,"crit":["b64"]}', text);

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should refuse an encoded compact payload that is not canonical base64url", async () => {
    const jws = await forgeCompact(secret, '{"alg":"HS256"}', "ab+c");

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should refuse an unencoded JSON payload with an escaped lone surrogate", async () => {
    const protectedText = '{"alg":"HS256","b64":false,"crit":["b64"]}';
    const jws = `{"payload":"\\ud800","protected":"${segmentOf(protectedText)}","signature":"${await forgeSignature(secret, protectedText, "x")}"}`;

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should verify an unencoded JSON payload holding quotes and periods", async () => {
    const protectedText = '{"alg":"HS256","b64":false,"crit":["b64"]}';
    const jws = await forgeFlattened(secret, protectedText, '"$.02"');

    const result = await secretVerifier()(jws);

    expect(result.ok && result.value.payload).toEqual(bytesOf('"$.02"'));
  });

  it("should refuse a JSON payload that is not a string", async () => {
    const jws = JSON.stringify({ payload: 1, protected: segmentOf('{"alg":"HS256"}'), signature: "AAAA" });

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });
});

describe("createJwsVerifier headers", () => {
  it.each([
    ["b64 outside crit", '{"alg":"HS256","b64":false}', ["header", "b64"]],
    ["b64 true outside crit", '{"alg":"HS256","b64":true}', ["header", "b64"]],
    ["a b64 that is not a boolean", '{"alg":"HS256","b64":"false","crit":["b64"]}', ["header", "b64"]],
    ["an empty crit", '{"alg":"HS256","crit":[]}', ["header", "crit"]],
    ["a crit that is not an array", '{"alg":"HS256","crit":"b64","b64":false}', ["header", "crit"]],
    ["a crit with a repeated name", '{"alg":"HS256","b64":false,"crit":["b64","b64"]}', ["header", "crit"]],
    ["a crit naming a registered parameter", '{"alg":"HS256","crit":["kid"],"kid":"s"}', ["header", "crit"]],
    ["a crit naming an absent parameter", '{"alg":"HS256","crit":["b64"]}', ["header", "crit"]],
    ["a crit holding a non-string", '{"alg":"HS256","crit":[1]}', ["header", "crit"]],
    ["a kid that is not text", '{"alg":"HS256","kid":1}', ["header", "kid"]],
  ])("should refuse %s as malformed", async (_, protectedText, path) => {
    const jws = await forgeCompact(secret, protectedText, "YQ");

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "malformed", path }));
  });

  it("should refuse an extension the verifier does not list in crit", async () => {
    const jws = await forgeCompact(secret, '{"alg":"HS256","crit":["ext"],"ext":1}', "YQ");

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "unsupported_crit", path: ["header", "crit"] }));
  });

  it("should accept an extension the verifier lists in crit", async () => {
    const jws = await forgeCompact(secret, '{"alg":"HS256","b64":false,"crit":["b64","ext"],"ext":1}', "a");

    const result = await secretVerifier({ crit: ["ext"] })(jws);

    expect(result.ok && result.value.header).toEqual({ alg: "HS256", b64: false, crit: ["b64", "ext"], ext: 1 });
  });

  it.each(["none", "NONE", "HS257"])("should refuse alg %s", async (alg) => {
    const jws = `${segmentOf(`{"alg":"${alg}"}`)}.YQ.AAAA`;

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "unsupported_alg", path: ["header", "alg"] }));
  });

  it("should fail with alg_mismatch when a key set returns a key of another alg", async () => {
    const jws = await signJws({ payload: "a", key: secret });
    const verify = createJwsVerifier({ keys: keySetOf(pairs.ES256.publicKey) });

    expect(await verify(jws)).toEqual(failure({ code: "alg_mismatch", path: ["header", "alg"] }));
  });

  it("should fail a signature of the wrong length before Web Crypto", async () => {
    const jws = `${segmentOf('{"alg":"HS256"}')}.YQ.AAAA`;

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "bad_signature" }));
  });
});

describe("createJwsVerifier JSON structure", () => {
  const protectedHs = '{"alg":"HS256"}';

  it("should refuse alg in the unprotected header only", async () => {
    const jws = await forgeFlattened(secret, '{"kid":"s"}', "YQ", { header: { alg: "HS256" } });

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "malformed", path: ["header", "alg"] }));
  });

  it.each([
    ["alg", { alg: "HS256" }],
    ["kid", { kid: "s" }],
  ])("should refuse %s in both headers", async (name, header) => {
    const jws = await forgeFlattened(secret, '{"alg":"HS256","kid":"s"}', "YQ", { header });

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "malformed", path: ["header", name] }));
  });

  it.each([
    ["crit", { crit: ["ext"], ext: 1 }],
    ["b64", { b64: true }],
  ])("should refuse %s in the unprotected header", async (name, header) => {
    const jws = await forgeFlattened(secret, protectedHs, "YQ", { header });

    expect(await secretVerifier({ crit: ["ext"] })(jws)).toEqual(
      failure({ code: "malformed", path: ["header", name] }),
    );
  });

  it("should refuse a kid in the unprotected header that is not text", async () => {
    const jws = await forgeFlattened(secret, protectedHs, "YQ", { header: { kid: 1 } });

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "malformed", path: ["header", "kid"] }));
  });

  it("should select the key by an unprotected kid", async () => {
    const jws = await forgeFlattened(otherSecret, protectedHs, "YQ", { header: { kid: "o" } });
    const verify = createJwsVerifier({ keys: createKeySet([secret, otherSecret]) });

    const result = await verify(jws);

    expect(result.ok && result.value.key).toBe(otherSecret);
  });

  it.each([
    ["no protected member", { payload: "YQ", signature: "AAAA" }, ["protected"]],
    ["an empty protected member", { payload: "YQ", protected: "", signature: "AAAA" }, ["protected"]],
    [
      "a protected member that is not base64url",
      { payload: "YQ", protected: "e30=", signature: "AAAA" },
      ["protected"],
    ],
    [
      "a protected header that is not an object",
      { payload: "YQ", protected: segmentOf("[]"), signature: "AAAA" },
      ["protected"],
    ],
    [
      "an unprotected header that is an array",
      { payload: "YQ", protected: segmentOf(protectedHs), header: [], signature: "AAAA" },
      ["header"],
    ],
    [
      "an unprotected header that is text",
      { payload: "YQ", protected: segmentOf(protectedHs), header: "x", signature: "AAAA" },
      ["header"],
    ],
    ["no signature", { payload: "YQ", protected: segmentOf(protectedHs) }, ["signature"]],
    ["an empty signature", { payload: "YQ", protected: segmentOf(protectedHs), signature: "" }, ["signature"]],
    [
      "signatures beside protected",
      { protected: segmentOf(protectedHs), signature: "AAAA", signatures: [] },
      ["signatures"],
    ],
    ["signatures that is not an array", { signatures: {} }, ["signatures"]],
    ["no signatures", { signatures: [] }, ["signatures"]],
    ["a signature entry that is not an object", { signatures: [1] }, ["signatures", 0]],
  ])("should refuse %s as malformed", async (_, value, path) => {
    expect(await secretVerifier()(JSON.stringify(value))).toEqual(failure({ code: "malformed", path }));
  });

  it("should refuse a protected header with a repeated member", async () => {
    const jws = JSON.stringify({
      payload: "YQ",
      protected: segmentOf('{"alg":"HS256","alg":"HS256"}'),
      signature: "AAAA",
    });

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "duplicate_key", path: ["protected"] }));
  });

  it("should refuse a JWS JSON object with a repeated member", async () => {
    const jws = `{"payload":"YQ","payload":"Yg","protected":"${segmentOf(protectedHs)}","signature":"AAAA"}`;

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "duplicate_key" }));
  });

  it("should refuse an unprotected header nested deeper than 32 levels", async () => {
    const deep = `${"[".repeat(31)}${"]".repeat(31)}`;
    const jws = `{"payload":"YQ","protected":"${segmentOf(protectedHs)}","header":{"x":${deep}},"signature":"AAAA"}`;

    expect(await secretVerifier()(jws)).toEqual(
      failure({ code: "too_large", params: { limit: "depth", maximum: 32 } }),
    );
  });

  it("should refuse JSON that does not parse", async () => {
    expect(await secretVerifier()('{"payload":')).toEqual(failure({ code: "malformed" }));
  });

  it("should ignore a member RFC 7515 does not define, and accept whitespace around the object", async () => {
    const jws = await forgeFlattened(secret, protectedHs, "YQ", { extension: { any: true } });

    expect((await secretVerifier()(` \n${jws}\t`)).ok).toBe(true);
  });
});

describe("createJwsVerifier general serialization", () => {
  it("should accept the first signature that verifies and report its index", async () => {
    const jws = await signGeneralJws({
      payload: "p",
      signers: [{ key: otherSecret }, { key: secret }, { key: secret, header: { typ: "late" } }],
    });

    const result = await secretVerifier()(jws);

    expect(result.ok && result.value.signatureIndex).toBe(1);
    expect(result.ok && result.value.header).toEqual({ alg: "HS256", kid: "s" });
  });

  it("should skip a signature with an unsupported alg or crit", async () => {
    const good = JSON.parse(await signJws({ payload: "p", key: secret, serialization: "flattened" })) as Record<
      string,
      string
    >;
    const jws = JSON.stringify({
      payload: good.payload,
      signatures: [
        { protected: segmentOf('{"alg":"ES256K"}'), signature: "AAAA" },
        { protected: segmentOf('{"alg":"HS256","crit":["ext"],"ext":1}'), signature: "AAAA" },
        { protected: good.protected, signature: good.signature },
      ],
    });

    const result = await secretVerifier()(jws);

    expect(result.ok && result.value.signatureIndex).toBe(2);
  });

  it("should list every signature's issue under its index when none verifies", async () => {
    const jws = await signGeneralJws({
      payload: "p",
      signers: [{ key: otherSecret }, { key: pairs.ES256.privateKey }, { key: secret, header: { kid: "s" } }],
    });
    const tampered = jws.replace(/"signature":"[\w-]{3}/g, '"signature":"AAA');

    expect(await secretVerifier()(tampered)).toEqual(
      failure(
        { code: "unknown_kid", path: ["signatures", 0, "header", "kid"] },
        { code: "unknown_kid", path: ["signatures", 1, "header", "kid"] },
        { code: "bad_signature", path: ["signatures", 2] },
      ),
    );
  });

  it("should refuse more than 8 signatures before selecting any key", async () => {
    const select = vi.fn<KeySet["select"]>(async () => ok(secret));
    const entry = { protected: segmentOf('{"alg":"HS256"}'), signature: "AAAA" };
    const jws = JSON.stringify({ payload: "YQ", signatures: Array.from({ length: 9 }, () => entry) });

    expect(await createJwsVerifier({ keys: { select } })(jws)).toEqual(
      failure({ code: "too_large", path: ["signatures"], params: { limit: "signatures", maximum: 8 } }),
    );
    expect(select).not.toHaveBeenCalled();
  });

  it("should refuse signatures that disagree about b64", async () => {
    const jws = JSON.stringify({
      payload: "YQ",
      signatures: [
        { protected: segmentOf('{"alg":"HS256"}'), signature: "AAAA" },
        { protected: segmentOf('{"alg":"HS256","b64":false,"crit":["b64"]}'), signature: "AAAA" },
      ],
    });

    expect(await secretVerifier()(jws)).toEqual(
      failure({ code: "malformed", path: ["signatures", 1, "header", "b64"] }),
    );
  });

  it("should refuse the whole JWS when one signature is malformed", async () => {
    const good = JSON.parse(await signJws({ payload: "p", key: secret, serialization: "flattened" })) as Record<
      string,
      string
    >;
    const jws = JSON.stringify({
      payload: good.payload,
      signatures: [
        { protected: good.protected, signature: good.signature },
        { protected: segmentOf('{"alg":"HS256"}'), header: { alg: "HS256" }, signature: "AAAA" },
      ],
    });

    expect(await secretVerifier()(jws)).toEqual(
      failure({ code: "malformed", path: ["signatures", 1, "header", "alg"] }),
    );
  });

  it("should pass a key set's failure on under the signature's index and report what it threw", async () => {
    const onKeySetError = vi.fn();
    const keys: KeySet = {
      select: async () => {
        throw new Error("down");
      },
    };
    const jws = await signGeneralJws({ payload: "p", signers: [{ key: secret }] });

    expect(await createJwsVerifier({ keys, onKeySetError })(jws)).toEqual(
      failure({ code: "key_fetch_failed", path: ["signatures", 0], params: { reason: "key_set_error" } }),
    );
    expect(onKeySetError).toHaveBeenCalledWith(new Error("down"));
  });

  it("should prefix a key set's own issue that has no path", async () => {
    const keys: KeySet = { select: async () => fail({ code: "no_matching_key" }) };
    const jws = await signGeneralJws({ payload: "p", signers: [{ key: secret }] });

    expect(await createJwsVerifier({ keys })(jws)).toEqual(
      failure({ code: "no_matching_key", path: ["signatures", 0] }),
    );
  });
});

describe("createJwsVerifier input", () => {
  it.each([[undefined], [null], [1], [{}], [bytesOf("a.b.c")]])("should refuse %j as malformed", async (input) => {
    expect(await secretVerifier()(input)).toEqual(failure({ code: "malformed" }));
  });

  it("should check the length before anything else", async () => {
    expect(await secretVerifier({ maxLength: 10 })("x".repeat(11))).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 10 } }),
    );
  });

  it("should refuse a JWS holding a lone surrogate", async () => {
    const jws = `{"payload":"\ud800","protected":"${segmentOf('{"alg":"HS256"}')}","signature":"AAAA"}`;

    expect(await secretVerifier()(jws)).toEqual(failure({ code: "malformed" }));
  });

  it.each([["a.b"], ["a.b.c.d"], [".YQ.AAAA"], ["e30.YQ."]])("should refuse compact %j as malformed", async (jws) => {
    const result = await secretVerifier()(jws);

    expect(result.ok === false && result.error.issues[0]?.code).toBe("malformed");
  });
});

describe("createJwsVerifier options", () => {
  const keys = { select: async () => ok(secret) } as KeySet;

  it.each([
    ["an unknown member", { keys, algorithms: ["HS256"] }, "createJwsVerifier: options.algorithms is not an option."],
    [
      "a keys function",
      { keys: () => keys },
      "createJwsVerifier: options.keys must be a key set (an object with a select function).",
    ],
    [
      "crit b64",
      { keys, crit: ["b64"] },
      "createJwsVerifier: options.crit must list distinct extension parameter names, none defined by RFC 7515 or RFC 7518 and not b64.",
    ],
    [
      "a registered crit name",
      { keys, crit: ["kid"] },
      "createJwsVerifier: options.crit must list distinct extension parameter names, none defined by RFC 7515 or RFC 7518 and not b64.",
    ],
    [
      "a repeated crit name",
      { keys, crit: ["a", "a"] },
      "createJwsVerifier: options.crit must list distinct extension parameter names, none defined by RFC 7515 or RFC 7518 and not b64.",
    ],
    [
      "an empty crit name",
      { keys, crit: [""] },
      "createJwsVerifier: options.crit must list distinct extension parameter names, none defined by RFC 7515 or RFC 7518 and not b64.",
    ],
    [
      "a crit that is not an array",
      { keys, crit: "ext" },
      "createJwsVerifier: options.crit must list distinct extension parameter names, none defined by RFC 7515 or RFC 7518 and not b64.",
    ],
    [
      "a maxLength of 0",
      { keys, maxLength: 0 },
      "createJwsVerifier: options.maxLength must be an integer from 1 through 65536.",
    ],
    [
      "a maxLength above the ceiling",
      { keys, maxLength: 65_537 },
      "createJwsVerifier: options.maxLength must be an integer from 1 through 65536.",
    ],
    [
      "an onKeySetError that is not a function",
      { keys, onKeySetError: 1 },
      "createJwsVerifier: options.onKeySetError must be a function.",
    ],
  ])("should throw for %s", (_, options, message) => {
    expect(() => createJwsVerifier(options as never)).toThrow(new TypeError(message));
  });

  it("should throw for options that are not an object", () => {
    expect(() => createJwsVerifier(null as never)).toThrow(
      new TypeError("createJwsVerifier: options must be an object."),
    );
  });

  it.each([
    ["an unknown member", { payloads: "a" }, "JWS verifier: options.payloads is not an option."],
    ["a payload that is a number", { payload: 1 }, "JWS verifier: options.payload must be a string or a Uint8Array."],
    ["options that are not an object", "a", "JWS verifier: options must be an object."],
  ])("should reject a verification for %s", async (_, options, message) => {
    await expect(secretVerifier()("a.b.c", options as never)).rejects.toThrow(new TypeError(message));
  });
});
