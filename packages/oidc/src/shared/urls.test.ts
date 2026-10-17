import { describe, expect, it } from "vitest";

import { isHttpsUrl, isRedirectUri } from "./urls";

describe("isHttpsUrl", () => {
  it.each(["https://example。com/cb", "https://​example.com/cb", "https://op.example/café"])(
    "refuses non-ASCII characters, which the URL parser would rewrite: %s",
    (value) => {
      expect(isHttpsUrl(value)).toBe(false);
    },
  );

  it("accepts a punycode host", () => {
    expect(isHttpsUrl("https://xn--caf-dma.example/cb")).toBe(true);
  });

  it("shouldAcceptAbsoluteHttpsUrl", () => {
    expect(isHttpsUrl("https://provider.test/authorize")).toBe(true);
  });

  it("shouldRejectHttpUrl", () => {
    expect(isHttpsUrl("http://provider.test/authorize")).toBe(false);
  });

  it("shouldRejectUrlWithUsernameAndPassword", () => {
    expect(isHttpsUrl("https://user:pw@x")).toBe(false);
  });

  it("shouldRejectUrlWithUsernameOnly", () => {
    expect(isHttpsUrl("https://user@x")).toBe(false);
  });

  it("shouldRejectUrlWithFragment", () => {
    expect(isHttpsUrl("https://x/cb#token")).toBe(false);
  });

  it("shouldRejectUrlWithEmptyFragment", () => {
    expect(isHttpsUrl("https://x/#")).toBe(false);
  });

  it("shouldRejectRelativeUrl", () => {
    expect(isHttpsUrl("/authorize")).toBe(false);
  });

  it("shouldRejectNonStrings", () => {
    expect(isHttpsUrl(new URL("https://x/"))).toBe(false);
    expect(isHttpsUrl(undefined)).toBe(false);
  });
});

describe("isRedirectUri", () => {
  it("refuses a non-ASCII host character the parser would map to a dot", () => {
    expect(isRedirectUri("https://app。example/cb")).toBe(false);
  });

  it("shouldAcceptHttpsRedirectUri", () => {
    expect(isRedirectUri("https://app.test/callback")).toBe(true);
  });

  it("shouldAcceptCustomSchemeForNativeApps", () => {
    expect(isRedirectUri("com.example.app:/oauth2redirect")).toBe(true);
  });

  it("shouldAcceptHttpLoopbackRedirectUri", () => {
    expect(isRedirectUri("http://127.0.0.1:8080/callback")).toBe(true);
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "vbscript:msgbox", "file:///etc/passwd"])(
    "shouldRejectDangerousScheme_%s",
    (value) => {
      expect(isRedirectUri(value)).toBe(false);
    },
  );

  it("shouldRejectUriWithFragment", () => {
    expect(isRedirectUri("https://app.test/cb#")).toBe(false);
  });

  it("shouldRejectUriWithCredentials", () => {
    expect(isRedirectUri("https://user:pw@app.test/cb")).toBe(false);
  });

  it("shouldRejectRelativeUri", () => {
    expect(isRedirectUri("/callback")).toBe(false);
  });

  it("shouldRejectNonStrings", () => {
    expect(isRedirectUri(42)).toBe(false);
  });
});

describe("whitespace and control characters", () => {
  it.each([
    " https://x/cb",
    "https://x/cb ",
    "https://x/\tcb",
    "https://x/c\nb",
    "https://x/c\x00b",
    "https://x/c\x7Fb",
  ])("shouldRejectHttpsUrlWithControlOrSpace_%j", (value) => {
    expect(isHttpsUrl(value)).toBe(false);
    expect(isRedirectUri(value)).toBe(false);
  });

  it("shouldAcceptHttpsUrlWithoutControlOrSpace", () => {
    expect(isHttpsUrl("https://x/cb")).toBe(true);
    expect(isRedirectUri("https://app.test/callback")).toBe(true);
  });
});
