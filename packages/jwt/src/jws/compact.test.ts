import { describe, expect, it } from "vitest";

import { encodeBase64Url } from "../encoding/base64url";
import { parseCompact, parsePayload } from "./compact";

const segment = (json: string): string => encodeBase64Url(new TextEncoder().encode(json));
const SIGNATURE = encodeBase64Url(new Uint8Array([1, 2, 3, 4]));
const PAYLOAD = segment('{"sub":"user-1"}');
const tokenWith = (header: string, payload = PAYLOAD): string => `${segment(header)}.${payload}.${SIGNATURE}`;

const failure = (issue: object) => ({ ok: false, error: { issues: [issue] } });

describe("parseCompact", () => {
  it("should return the header, payload segment, signing input and signature", () => {
    const token = tokenWith('{"alg":"ES256","kid":"k1"}');
    const [header, payload] = token.split(".");

    expect(parseCompact(token, 8192)).toEqual({
      ok: true,
      value: {
        header: { alg: "ES256", kid: "k1" },
        payloadSegment: PAYLOAD,
        signingInput: new TextEncoder().encode(`${header}.${payload}`),
        signature: new Uint8Array([1, 2, 3, 4]),
      },
    });
  });

  it("should not decode the payload", () => {
    const result = parseCompact(tokenWith('{"alg":"ES256"}', segment('{"a":1,"a":2}')), 8192);

    expect(result.ok).toBe(true);
  });

  it("should reject a value that is not a string", () => {
    expect(parseCompact(42, 8192)).toEqual(failure({ code: "malformed" }));
  });

  it("should reject a token over the maximum length before decoding anything", () => {
    // Neither valid base64url nor three segments: only the length can be reported.
    expect(parseCompact("%".repeat(101), 100)).toEqual(
      failure({ code: "too_large", params: { limit: "length", maximum: 100 } }),
    );
  });

  it("should accept a token exactly at the maximum length", () => {
    const token = tokenWith('{"alg":"ES256"}');

    expect(parseCompact(token, token.length).ok).toBe(true);
  });

  it.each([
    ["one segment", "abc"],
    ["two segments", "abc.def"],
    ["four segments", "abc.def.ghi.jkl"],
    ["five segments (JWE)", "abc.def.ghi.jkl.mno"],
  ])("should reject %s", (_, token) => {
    expect(parseCompact(token, 8192)).toEqual(failure({ code: "malformed" }));
  });

  it.each([
    ["header", `.${PAYLOAD}.${SIGNATURE}`],
    ["payload", `${segment('{"alg":"ES256"}')}..${SIGNATURE}`],
    ["signature", `${segment('{"alg":"ES256"}')}.${PAYLOAD}.`],
  ])("should reject an empty %s segment", (name, token) => {
    expect(parseCompact(token, 8192)).toEqual(failure({ code: "malformed", path: [name] }));
  });

  it.each([
    ["header", `${segment('{"alg":"ES256"}')}=.${PAYLOAD}.${SIGNATURE}`],
    ["payload", `${segment('{"alg":"ES256"}')}.${PAYLOAD}+.${SIGNATURE}`],
    ["signature", `${segment('{"alg":"ES256"}')}.${PAYLOAD}.AQ/`],
  ])("should reject a %s segment that is not base64url", (name, token) => {
    expect(parseCompact(token, 8192)).toEqual(failure({ code: "malformed", path: [name] }));
  });

  it("should reject a signature segment with non-zero spare bits", () => {
    // "AQ" is the byte 0x01; "AR" sets a spare bit.
    expect(parseCompact(`${segment('{"alg":"ES256"}')}.${PAYLOAD}.AR`, 8192)).toEqual(
      failure({ code: "malformed", path: ["signature"] }),
    );
  });

  it("should reject a header that is not a JSON object", () => {
    expect(parseCompact(tokenWith('["ES256"]'), 8192)).toEqual(failure({ code: "malformed", path: ["header"] }));
  });

  it("should reject a header with a repeated member", () => {
    expect(parseCompact(tokenWith('{"alg":"ES256","alg":"HS256"}'), 8192)).toEqual(
      failure({ code: "duplicate_key", path: ["header"] }),
    );
  });

  it("should reject a header nested past the depth limit", () => {
    const header = `{"alg":"ES256","x":${"[".repeat(32)}${"]".repeat(32)}}`;

    expect(parseCompact(tokenWith(header), 8192)).toEqual(
      failure({ code: "too_large", path: ["header"], params: { limit: "depth", maximum: 32 } }),
    );
  });

  it.each(["none", "NONE", "None", "nOnE"])("should reject alg %s as unsupported", (alg) => {
    expect(parseCompact(tokenWith(`{"alg":"${alg}"}`), 8192)).toEqual(
      failure({ code: "unsupported_alg", path: ["header", "alg"] }),
    );
  });

  it.each([
    ["an unknown algorithm", '{"alg":"HS512"}'],
    ["another casing of a supported algorithm", '{"alg":"es256"}'],
    ["a missing alg", '{"kid":"k1"}'],
    ["an alg that is not a string", '{"alg":["ES256"]}'],
    ["a null alg", '{"alg":null}'],
  ])("should reject %s as unsupported", (_, header) => {
    expect(parseCompact(tokenWith(header), 8192)).toEqual(
      failure({ code: "unsupported_alg", path: ["header", "alg"] }),
    );
  });

  it("should reject any crit header", () => {
    expect(parseCompact(tokenWith('{"alg":"ES256","crit":["exp"],"exp":1}'), 8192)).toEqual(
      failure({ code: "unsupported_crit", path: ["header", "crit"] }),
    );
  });

  it("should reject an empty crit header", () => {
    expect(parseCompact(tokenWith('{"alg":"ES256","crit":[]}'), 8192)).toEqual(
      failure({ code: "unsupported_crit", path: ["header", "crit"] }),
    );
  });

  it("should reject a b64 header, since unencoded payloads are not supported", () => {
    expect(parseCompact(tokenWith('{"alg":"ES256","b64":true}'), 8192)).toEqual(
      failure({ code: "malformed", path: ["header", "b64"] }),
    );
  });

  it.each([
    ["kid", '{"alg":"ES256","kid":1}'],
    ["typ", '{"alg":"ES256","typ":null}'],
    ["cty", '{"alg":"ES256","cty":{}}'],
  ])("should reject a %s that is not a string", (name, header) => {
    expect(parseCompact(tokenWith(header), 8192)).toEqual(failure({ code: "malformed", path: ["header", name] }));
  });

  it("should keep other header members without interpreting them", () => {
    const result = parseCompact(tokenWith('{"alg":"RS256","jku":"https://example.test","x5c":["a"],"custom":1}'), 8192);

    expect(result.ok && result.value.header).toEqual({
      alg: "RS256",
      jku: "https://example.test",
      x5c: ["a"],
      custom: 1,
    });
  });

  it("should not read alg inherited through a __proto__ header member", () => {
    expect(parseCompact(tokenWith('{"__proto__":{"alg":"ES256"}}'), 8192)).toEqual(
      failure({ code: "unsupported_alg", path: ["header", "alg"] }),
    );
  });

  it("should return a frozen header", () => {
    const result = parseCompact(tokenWith('{"alg":"ES256","x":{"y":[1]}}'), 8192);

    expect(result.ok && Object.isFrozen(result.value.header)).toBe(true);
    expect(result.ok && Object.isFrozen((result.value.header["x"] as { y: number[] }).y)).toBe(true);
  });

  it("should never echo the token in a failure", () => {
    const secret = "s3cr3tvalue";
    const tokens = [
      tokenWith(`{"alg":"${secret}"}`),
      tokenWith(`{"alg":"ES256","kid":["${secret}"]}`),
      tokenWith(`{"alg":"ES256","crit":["${secret}"]}`),
      tokenWith(`{"alg":"ES256","${secret}":1,"${secret}":2}`),
      `${secret}.${secret}`,
      `${segment('{"alg":"ES256"}')}.${PAYLOAD}.${secret}=`,
    ];

    for (const token of tokens) {
      const serialized = JSON.stringify(parseCompact(token, 8192));

      expect(serialized).toContain('"ok":false');
      expect(serialized).not.toContain(secret);
      for (const part of token.split(".")) {
        expect(serialized).not.toContain(part);
      }
    }
  });
});

describe("parsePayload", () => {
  const parsed = (payload: string) => {
    const result = parseCompact(tokenWith('{"alg":"ES256"}', payload), 8192);
    if (!result.ok) {
      throw new Error("the fixture must parse");
    }
    return result.value;
  };

  it("should decode the payload into a frozen object", () => {
    const result = parsePayload(parsed(segment('{"sub":"user-1","aud":["a"]}')));

    expect(result).toEqual({ ok: true, value: { sub: "user-1", aud: ["a"] } });
    expect(result.ok && Object.isFrozen(result.value["aud"])).toBe(true);
  });

  it("should reject a payload with a repeated claim", () => {
    expect(parsePayload(parsed(segment('{"sub":"a","sub":"b"}')))).toEqual(
      failure({ code: "duplicate_key", path: ["payload"] }),
    );
  });

  it("should reject a payload that is not a JSON object", () => {
    expect(parsePayload(parsed(segment('"sub"')))).toEqual(failure({ code: "malformed", path: ["payload"] }));
  });

  it("should reject a payload that is not UTF-8", () => {
    expect(parsePayload(parsed(encodeBase64Url(new Uint8Array([0x7b, 0xff, 0x7d]))))).toEqual(
      failure({ code: "malformed", path: ["payload"] }),
    );
  });
});
