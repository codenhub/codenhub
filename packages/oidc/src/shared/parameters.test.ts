import { describe, expect, it } from "vitest";

import { MAX_PARAMETER_LENGTH, MAX_PARAMETERS } from "./limits";
import { parseParameters } from "./parameters";

describe("parseParameters", () => {
  it("shouldParseDistinctParameters", () => {
    expect(parseParameters("client_id=abc&scope=openid")).toEqual({
      ok: true,
      parameters: new Map([
        ["client_id", "abc"],
        ["scope", "openid"],
      ]),
    });
  });

  it("shouldDecodePlusAsSpace", () => {
    const result = parseParameters("scope=openid+profile");
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.parameters.get("scope")).toBe("openid profile");
  });

  it("shouldPercentDecodeNamesAndValues", () => {
    const result = parseParameters("redirect%5Furi=https%3A%2F%2Fexample.test%2Fcb%3Fa%3D1");
    expect(result.ok && result.parameters.get("redirect_uri")).toBe("https://example.test/cb?a=1");
  });

  it("shouldRejectRepeatedName", () => {
    expect(parseParameters("a=1&a=2")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("shouldRejectRepeatedNameWhenSecondCopyIsEmpty", () => {
    expect(parseParameters("a=1&a=")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("shouldRejectRepeatedNameWhenFirstCopyIsEmpty", () => {
    expect(parseParameters("a=&a=1")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("shouldRejectMoreThanMaxParameters", () => {
    const text = Array.from({ length: MAX_PARAMETERS + 1 }, (_, index) => `p${index}=v`).join("&");
    expect(parseParameters(text)).toEqual({ ok: false, reason: "too_many" });
  });

  it("shouldAcceptExactlyMaxParameters", () => {
    const text = Array.from({ length: MAX_PARAMETERS }, (_, index) => `p${index}=v`).join("&");
    const result = parseParameters(text);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.parameters.size).toBe(MAX_PARAMETERS);
  });

  it("shouldRejectValueLongerThanMaxParameterLength", () => {
    const text = `code=${"a".repeat(MAX_PARAMETER_LENGTH + 1)}`;
    expect(parseParameters(text)).toEqual({ ok: false, reason: "too_long" });
  });

  it("shouldRejectNameLongerThanMaxParameterLength", () => {
    const text = `${"n".repeat(MAX_PARAMETER_LENGTH + 1)}=v`;
    expect(parseParameters(text)).toEqual({ ok: false, reason: "too_long" });
  });

  it("shouldAcceptValueOfExactlyMaxParameterLength", () => {
    const text = `code=${"a".repeat(MAX_PARAMETER_LENGTH)}`;
    expect(parseParameters(text)).toMatchObject({ ok: true });
  });

  it("shouldOmitParameterWithEmptyValue", () => {
    const result = parseParameters("state=&code=xyz");
    expect(result.ok && result.parameters.has("state")).toBe(false);
    expect(result.ok && result.parameters.get("code")).toBe("xyz");
  });

  it("shouldReturnEmptyMapForEmptyString", () => {
    expect(parseParameters("")).toEqual({ ok: true, parameters: new Map() });
  });

  it("shouldNotThrowOnMalformedPercentEncoding", () => {
    expect(() => parseParameters("a=%E0%A4%A&b=%")).not.toThrow();
  });
});
