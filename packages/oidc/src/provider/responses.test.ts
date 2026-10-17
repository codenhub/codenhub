import { describe, expect, it } from "vitest";

import { redirectResponse } from "./responses";

const ISSUER = "https://op.example";

function locationOf(redirectUri: string, parameters: Record<string, string | undefined>): string | null {
  return redirectResponse(redirectUri, parameters).headers.get("location");
}

describe("redirectResponse", () => {
  it("shouldKeepRegisteredQueryByteForByteAndAppendParameters", () => {
    const location = locationOf("https://app.example/cb?a&team=a%20b&v=~1", {
      code: "c0de",
      state: "s",
      iss: ISSUER,
    });
    expect(location).toBe("https://app.example/cb?a&team=a%20b&v=~1&code=c0de&state=s&iss=https%3A%2F%2Fop.example");
  });

  it("shouldAddNoSeparatorWhenRegisteredUriEndsWithQuestionMark", () => {
    expect(locationOf("https://app.example/cb?", { code: "c0de" })).toBe("https://app.example/cb?code=c0de");
  });

  it("shouldAppendWithAmpersandWhenRegisteredUriEndsWithDoubleQuestionMark", () => {
    expect(locationOf("https://app.example/cb??", { code: "c0de" })).toBe("https://app.example/cb??&code=c0de");
  });

  it("shouldAddNoSeparatorWhenRegisteredQueryEndsWithAmpersand", () => {
    expect(locationOf("https://app.example/cb?a=1&", { code: "c0de" })).toBe("https://app.example/cb?a=1&code=c0de");
  });

  it("shouldStartQueryWhenRegisteredUriHasNoQuery", () => {
    expect(locationOf("https://app.example/cb", { code: "c0de" })).toBe("https://app.example/cb?code=c0de");
  });

  it("shouldFormEncodeParameterValues", () => {
    expect(locationOf("https://app.example/cb", { state: "a b&c#d" })).toBe("https://app.example/cb?state=a+b%26c%23d");
  });

  it("shouldSkipUndefinedParameters", () => {
    expect(locationOf("https://app.example/cb", { code: "c0de", error: undefined })).toBe(
      "https://app.example/cb?code=c0de",
    );
  });

  it("shouldReturnRegisteredUriUnchangedWhenNoParameterIsDefined", () => {
    expect(locationOf("https://app.example/cb?a=%20b", { error: undefined })).toBe("https://app.example/cb?a=%20b");
    expect(locationOf("https://app.example/cb", {})).toBe("https://app.example/cb");
  });
});
