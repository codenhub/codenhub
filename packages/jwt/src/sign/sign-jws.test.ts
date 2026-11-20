import { runInNewContext } from "node:vm";

import { beforeAll, describe, expect, it } from "vitest";

import type { PrivateKey, PublicKey, SecretKey } from "../core/types";
import { decodeBase64Url, encodeBase64Url } from "../encoding/base64url";
import { generateKeyPair, generateSecretKey } from "../keys/generate";
import { signGeneralJws, signJws } from "./sign-jws";

const textOf = (segment: string): string => new TextDecoder().decode(decodeBase64Url(segment));
const segmentOf = (text: string): string => encodeBase64Url(new TextEncoder().encode(text));
const headerTextOf = (jws: string): string => textOf(jws.split(".")[0] as string);

let secretKey: SecretKey;
let kidKey: SecretKey;
let privateKey: PrivateKey;
let publicKey: PublicKey;

beforeAll(async () => {
  secretKey = await generateSecretKey({ alg: "HS256" });
  kidKey = await generateSecretKey({ alg: "HS256", kid: "k1" });
  ({ privateKey, publicKey } = await generateKeyPair({ alg: "ES256", kid: "ec" }));
});

describe("signJws compact", () => {
  it("should base64url-encode a string payload as its UTF-8 bytes", async () => {
    const jws = await signJws({ payload: "héllo", key: secretKey });
    const [header, payload, signature] = jws.split(".");

    expect(textOf(header as string)).toBe('{"alg":"HS256"}');
    expect(payload).toBe(segmentOf("héllo"));
    expect(signature).toMatch(/^[\w-]{43}$/);
  });

  it("should sign the bytes of a Uint8Array payload", async () => {
    const jws = await signJws({ payload: new Uint8Array([0, 255, 46]), key: secretKey });

    expect(jws.split(".")[1]).toBe("AP8u");
  });

  it("should take a Uint8Array from another realm", async () => {
    const bytes = runInNewContext("new Uint8Array([1, 2, 3])") as Uint8Array;

    expect((await signJws({ payload: bytes, key: secretKey })).split(".")[1]).toBe("AQID");
  });

  it("should write the key's kid, then typ and cty, then other members in order", async () => {
    const jws = await signJws({ payload: "", key: kidKey, header: { ext: 1, cty: "text/plain", typ: "x" } });

    expect(headerTextOf(jws)).toBe('{"alg":"HS256","kid":"k1","typ":"x","cty":"text/plain","ext":1}');
  });

  it("should leave the payload segment empty for a detached payload", async () => {
    const jws = await signJws({ payload: "abc", key: secretKey, detached: true });

    expect(jws.split(".")[1]).toBe("");
    expect(jws.split(".")).toHaveLength(3);
  });

  it("should write b64 false and crit b64 for an unencoded payload", async () => {
    const jws = await signJws({ payload: "abc", key: secretKey, b64: false });

    expect(headerTextOf(jws)).toBe('{"alg":"HS256","b64":false,"crit":["b64"]}');
    expect(jws.split(".")[1]).toBe("abc");
  });

  it("should write no b64 member for b64 true", async () => {
    expect(headerTextOf(await signJws({ payload: "a", key: secretKey, b64: true }))).toBe('{"alg":"HS256"}');
  });

  it("should refuse an unencoded compact payload holding a period", async () => {
    await expect(signJws({ payload: "$.02", key: secretKey, b64: false })).rejects.toThrow(
      "signJws: input.payload must hold only printable ASCII other than '.' for an unencoded compact JWS; detach it or use the JSON serialization.",
    );
  });

  it.each([["é"], ["\n"], ["\u007f"]])("should refuse an unencoded compact payload holding %j", async (text) => {
    await expect(signJws({ payload: text, key: secretKey, b64: false })).rejects.toThrow(TypeError);
  });

  it("should accept an unencoded detached payload of any bytes", async () => {
    const jws = await signJws({ payload: new Uint8Array([0x2e, 0xff]), key: secretKey, b64: false, detached: true });

    expect(jws.split(".")[1]).toBe("");
  });

  it("should refuse an unprotected header", async () => {
    await expect(signJws({ payload: "", key: secretKey, unprotectedHeader: { kid: "a" } })).rejects.toThrow(
      "signJws: input.unprotectedHeader needs the flattened serialization.",
    );
  });
});

describe("signJws flattened", () => {
  it("should write payload, protected, header and signature in RFC 7515 order", async () => {
    const jws = await signJws({
      payload: "abc",
      key: privateKey,
      unprotectedHeader: { kid: "u" },
      serialization: "flattened",
    });
    const parsed = JSON.parse(jws) as Record<string, unknown>;

    expect(Object.keys(parsed)).toEqual(["payload", "protected", "header", "signature"]);
    expect(parsed.payload).toBe(segmentOf("abc"));
    expect(textOf(parsed.protected as string)).toBe('{"alg":"ES256"}');
    expect(parsed.header).toEqual({ kid: "u" });
  });

  it("should take the key's kid into the protected header when the unprotected header has none", async () => {
    const jws = JSON.parse(await signJws({ payload: "", key: privateKey, serialization: "flattened" })) as {
      protected: string;
      header?: unknown;
    };

    expect(textOf(jws.protected)).toBe('{"alg":"ES256","kid":"ec"}');
    expect(jws.header).toBeUndefined();
  });

  it("should omit payload for a detached payload", async () => {
    const jws = JSON.parse(
      await signJws({ payload: "abc", key: secretKey, serialization: "flattened", detached: true }),
    ) as object;

    expect(Object.keys(jws)).toEqual(["protected", "signature"]);
  });

  it("should carry an unencoded payload as a JSON string", async () => {
    const jws = JSON.parse(
      await signJws({ payload: '$.02 "é"', key: secretKey, serialization: "flattened", b64: false }),
    ) as { payload: string };

    expect(jws.payload).toBe('$.02 "é"');
  });

  it("should refuse unencoded bytes that are not UTF-8", async () => {
    await expect(
      signJws({ payload: new Uint8Array([0xff]), key: secretKey, serialization: "flattened", b64: false }),
    ).rejects.toThrow("signJws: input.payload must be UTF-8 text for an unencoded JSON JWS; detach it instead.");
  });

  it("should omit an empty unprotected header", async () => {
    const jws = JSON.parse(
      await signJws({ payload: "", key: secretKey, serialization: "flattened", unprotectedHeader: {} }),
    ) as object;

    expect(Object.keys(jws)).toEqual(["payload", "protected", "signature"]);
  });

  it.each(["alg", "crit", "b64", "jwk", "jku", "x5u", "x5c"])(
    "should refuse %s in the unprotected header",
    async (name) => {
      await expect(
        signJws({ payload: "", key: secretKey, serialization: "flattened", unprotectedHeader: { [name]: "x" } }),
      ).rejects.toThrow(`signJws: input.unprotectedHeader.${name} is not supported.`);
    },
  );

  it("should refuse a member in both headers", async () => {
    await expect(
      signJws({
        payload: "",
        key: secretKey,
        serialization: "flattened",
        header: { typ: "a" },
        unprotectedHeader: { typ: "b" },
      }),
    ).rejects.toThrow("signJws: input.unprotectedHeader.typ is in the protected header too.");
  });

  it("should refuse a header kid alongside an unprotected kid", async () => {
    await expect(
      signJws({
        payload: "",
        key: secretKey,
        serialization: "flattened",
        header: { kid: "a" },
        unprotectedHeader: { kid: "b" },
      }),
    ).rejects.toThrow(TypeError);
  });

  it("should refuse an unprotected kid that is not text", async () => {
    await expect(
      signJws({ payload: "", key: secretKey, serialization: "flattened", unprotectedHeader: { kid: 1 } }),
    ).rejects.toThrow("signJws: input.unprotectedHeader.kid must be a string.");
  });
});

describe("signJws crit", () => {
  it("should write a crit the caller gives for a member of the header", async () => {
    const jws = await signJws({ payload: "", key: secretKey, header: { crit: ["ext"], ext: true } });

    expect(headerTextOf(jws)).toBe('{"alg":"HS256","crit":["ext"],"ext":true}');
  });

  it("should put b64 first in a crit the caller gives", async () => {
    const jws = await signJws({ payload: "a", key: secretKey, b64: false, header: { ext: 1, crit: ["ext"] } });

    expect(headerTextOf(jws)).toBe('{"alg":"HS256","b64":false,"crit":["b64","ext"],"ext":1}');
  });

  it.each([
    ["an empty list", []],
    ["a list naming an absent member", ["ext2"]],
    ["a repeated name", ["ext", "ext"]],
    ["a registered name", ["kid"]],
    ["b64", ["b64"]],
    ["an empty name", [""]],
    ["a value that is not a list", "ext"],
    ["a list of non-strings", [1]],
  ])("should refuse %s", async (_, crit) => {
    await expect(
      signJws({ payload: "", key: secretKey, header: { crit, ext: 1 } as never, unprotectedHeader: undefined }),
    ).rejects.toThrow(TypeError);
  });
});

describe("signJws input", () => {
  it("should refuse a header b64", async () => {
    await expect(signJws({ payload: "", key: secretKey, header: { b64: false } as never })).rejects.toThrow(
      "signJws: input.header.b64 is not supported.",
    );
  });

  it.each(["jwk", "jku", "x5u", "x5c"])("should refuse a header %s", async (name) => {
    await expect(signJws({ payload: "", key: secretKey, header: { [name]: "x" } })).rejects.toThrow(
      `signJws: input.header.${name} is not supported.`,
    );
  });

  it("should refuse a header alg other than the key's", async () => {
    await expect(signJws({ payload: "", key: secretKey, header: { alg: "HS384" } })).rejects.toThrow(
      "signJws: input.header.alg must equal the key's alg.",
    );
  });

  it.each([
    ["a number", 1],
    ["an array", [1]],
    ["an object", {}],
    ["an ArrayBuffer", new ArrayBuffer(1)],
    ["a DataView", new DataView(new ArrayBuffer(1))],
  ])("should refuse %s as payload", async (_, payload) => {
    await expect(signJws({ payload: payload as never, key: secretKey })).rejects.toThrow(
      "signJws: input.payload must be a string or a Uint8Array.",
    );
  });

  it("should refuse a string payload with a lone surrogate", async () => {
    await expect(signJws({ payload: "\ud800", key: secretKey })).rejects.toThrow(
      "signJws: input.payload must not hold lone surrogates.",
    );
  });

  it("should refuse a public key", async () => {
    await expect(signJws({ payload: "", key: publicKey as never })).rejects.toThrow(
      "signJws: input.key must be a private or secret key.",
    );
  });

  it("should refuse a forged key", async () => {
    await expect(signJws({ payload: "", key: { kind: "secret", alg: "HS256" } as never })).rejects.toThrow(TypeError);
  });

  it("should refuse an unknown member", async () => {
    await expect(signJws({ payload: "", key: secretKey, detach: true } as never)).rejects.toThrow(
      "signJws: input.detach is not an option.",
    );
  });

  it.each([
    ["b64", { b64: "false" }],
    ["detached", { detached: 1 }],
  ])("should refuse a %s that is not a boolean", async (name, extra) => {
    await expect(signJws({ payload: "", key: secretKey, ...(extra as object) })).rejects.toThrow(
      `signJws: input.${name} must be a boolean.`,
    );
  });

  it.each(["general", "json", 1])("should refuse serialization %j", async (serialization) => {
    await expect(signJws({ payload: "", key: secretKey, serialization: serialization as never })).rejects.toThrow(
      'signJws: input.serialization must be "compact" or "flattened".',
    );
  });

  it("should refuse an input that is not an object", async () => {
    await expect(signJws(null as never)).rejects.toThrow("signJws: input must be an object.");
  });
});

describe("signGeneralJws", () => {
  it("should write one entry per signer, in order", async () => {
    const jws = JSON.parse(
      await signGeneralJws({
        payload: "abc",
        signers: [
          { key: privateKey, unprotectedHeader: { kid: "first" } },
          { key: secretKey, header: { typ: "t" } },
        ],
      }),
    ) as { payload: string; signatures: { protected: string; header?: object; signature: string }[] };

    expect(Object.keys(jws)).toEqual(["payload", "signatures"]);
    expect(jws.payload).toBe(segmentOf("abc"));
    expect(jws.signatures.map((entry) => Object.keys(entry))).toEqual([
      ["protected", "header", "signature"],
      ["protected", "signature"],
    ]);
    expect(textOf(jws.signatures[0]?.protected as string)).toBe('{"alg":"ES256"}');
    expect(textOf(jws.signatures[1]?.protected as string)).toBe('{"alg":"HS256","typ":"t"}');
  });

  it("should write b64 false into every protected header", async () => {
    const jws = JSON.parse(
      await signGeneralJws({ payload: "a.b", b64: false, signers: [{ key: privateKey }, { key: secretKey }] }),
    ) as { payload: string; signatures: { protected: string }[] };

    expect(jws.payload).toBe("a.b");
    expect(jws.signatures.map((entry) => textOf(entry.protected))).toEqual([
      '{"alg":"ES256","kid":"ec","b64":false,"crit":["b64"]}',
      '{"alg":"HS256","b64":false,"crit":["b64"]}',
    ]);
  });

  it("should omit payload when detached", async () => {
    const jws = JSON.parse(
      await signGeneralJws({ payload: "a", detached: true, signers: [{ key: secretKey }] }),
    ) as object;

    expect(Object.keys(jws)).toEqual(["signatures"]);
  });

  it.each([
    ["no signers", []],
    ["nine signers", Array.from({ length: 9 }, () => ({}))],
  ])("should refuse %s", async (_, signers) => {
    const list = signers.map(() => ({ key: secretKey }));

    await expect(signGeneralJws({ payload: "", signers: list })).rejects.toThrow(
      "signGeneralJws: input.signers must list 1 to 8 signers.",
    );
  });

  it("should refuse signers that are not an array", async () => {
    await expect(signGeneralJws({ payload: "", signers: { 0: { key: secretKey } } as never })).rejects.toThrow(
      "signGeneralJws: input.signers must list 1 to 8 signers.",
    );
  });

  it("should name the signer whose header is wrong", async () => {
    await expect(
      signGeneralJws({ payload: "", signers: [{ key: secretKey }, { key: secretKey, header: { jku: "x" } as never }] }),
    ).rejects.toThrow("signGeneralJws: input.signers[1].header.jku is not supported.");
  });

  it("should refuse an unknown signer member", async () => {
    await expect(
      signGeneralJws({ payload: "", signers: [{ key: secretKey, unprotected: {} } as never] }),
    ).rejects.toThrow("signGeneralJws: input.signers[0].unprotected is not an option.");
  });

  it("should refuse a signer that is not a plain object", async () => {
    await expect(signGeneralJws({ payload: "", signers: [null as never] })).rejects.toThrow(
      "signGeneralJws: input.signers[0] must be an object.",
    );
  });

  it("should refuse an unknown member", async () => {
    await expect(
      signGeneralJws({ payload: "", signers: [{ key: secretKey }], serialization: "general" } as never),
    ).rejects.toThrow("signGeneralJws: input.serialization is not an option.");
  });
});
