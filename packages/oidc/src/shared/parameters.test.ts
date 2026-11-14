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
      lists: new Map(),
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
    expect(parseParameters("")).toEqual({ ok: true, parameters: new Map(), lists: new Map() });
  });

  it("shouldNotThrowOnMalformedPercentEncoding", () => {
    expect(() => parseParameters("a=%E0%A4%A&b=%")).not.toThrow();
  });

  it.each(["a=%E9", "a=%FF", "a=%C3", "a=%ED%A0%80", "a=%C3x", "%E9=1"])("shouldRejectInvalidUtf8Escape_%s", (text) => {
    expect(parseParameters(text)).toEqual({ ok: false, reason: "malformed" });
  });

  it("shouldAcceptEncodedReplacementCharacterAsTheClientSentIt", () => {
    const result = parseParameters("a=%EF%BF%BD");
    expect(result.ok && result.parameters.get("a")).toBe("�");
  });

  it("shouldAcceptValidMultiByteUtf8Escape", () => {
    const result = parseParameters("a=%C3%A9");
    expect(result.ok && result.parameters.get("a")).toBe("é");
  });

  it("shouldKeepMalformedEscapeLiterally", () => {
    const result = parseParameters("a=%zz");
    expect(result.ok && result.parameters.get("a")).toBe("%zz");
  });

  it("shouldDecodePlusAloneAsSpace", () => {
    const result = parseParameters("a=+");
    expect(result.ok && result.parameters.get("a")).toBe(" ");
  });

  it("shouldCollectEveryValueOfARepeatableName", () => {
    const result = parseParameters("resource=https%3A%2F%2Fa.test&scope=openid&resource=https%3A%2F%2Fb.test", [
      "resource",
    ]);
    expect(result).toEqual({
      ok: true,
      parameters: new Map([["scope", "openid"]]),
      lists: new Map([["resource", ["https://a.test", "https://b.test"]]]),
    });
  });

  it("shouldKeepARepeatedValueOfARepeatableNameOnce", () => {
    const result = parseParameters("resource=x&resource=x", ["resource"]);
    expect(result.ok && result.lists.get("resource")).toEqual(["x"]);
  });

  it("shouldDropEmptyValuesOfARepeatableName", () => {
    const result = parseParameters("resource=&resource=", ["resource"]);
    expect(result).toEqual({ ok: true, parameters: new Map(), lists: new Map() });
  });

  it("shouldStillRejectRepeatsOfOtherNamesWhenOneIsRepeatable", () => {
    expect(parseParameters("resource=x&resource=y&scope=a&scope=b", ["resource"])).toEqual({
      ok: false,
      reason: "duplicate",
    });
  });

  it("shouldCountRepeatsOfARepeatableNameTowardTheCap", () => {
    const text = Array.from({ length: MAX_PARAMETERS + 1 }, (_, index) => `resource=r${index}`).join("&");
    expect(parseParameters(text, ["resource"])).toEqual({ ok: false, reason: "too_many" });
  });

  it("shouldRejectAnOverlongValueOfARepeatableName", () => {
    const text = `resource=${"a".repeat(MAX_PARAMETER_LENGTH + 1)}`;
    expect(parseParameters(text, ["resource"])).toEqual({ ok: false, reason: "too_long" });
  });
});
