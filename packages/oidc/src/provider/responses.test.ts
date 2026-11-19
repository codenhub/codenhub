import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { bearerErrorResponse, FORM_POST_SCRIPT, formPostResponse, jsonResponse, redirectResponse } from "./responses";

const ISSUER = "https://op.example";

function locationOf(redirectUri: string, parameters: Record<string, string | undefined>): string | null {
  return redirectResponse(redirectUri, parameters).headers.get("location");
}

describe("bearerErrorResponse", () => {
  it("shouldExposeWwwAuthenticateWhenItCarriesAChallenge", () => {
    const response = bearerErrorResponse("invalid_token");
    expect(response.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
  });
});

describe("jsonResponse", () => {
  it("shouldExposeWwwAuthenticateWhenACallerSendsOne", () => {
    const response = jsonResponse(
      { error: "invalid_client" },
      {
        status: 401,
        caching: "no-store",
        headers: { "www-authenticate": 'Basic realm="token"' },
      },
    );
    expect(response.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
  });

  it("shouldNotExposeAnythingWhenThereIsNoChallenge", () => {
    const response = jsonResponse({}, { caching: "no-store" });
    expect(response.headers.get("access-control-expose-headers")).toBeNull();
  });
});

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

/** The hidden inputs of a form post page, as name and value, decoded as a browser would read them. */
function inputsOf(html: string): [string, string][] {
  const decode = (text: string): string =>
    text
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
  return [...html.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)">/g)].map((match) => [
    decode(match[1] ?? ""),
    decode(match[2] ?? ""),
  ]);
}

const policyHash = (): string => createHash("sha256").update(FORM_POST_SCRIPT).digest("base64");

describe("formPostResponse", () => {
  it("answers 200 with an HTML page that posts the parameters to the redirect URI", async () => {
    const response = formPostResponse("https://app.example/cb", { code: "c0de", state: "s", iss: ISSUER });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain('<form method="post" action="https://app.example/cb">');
    expect(inputsOf(html)).toEqual([
      ["code", "c0de"],
      ["state", "s"],
      ["iss", ISSUER],
    ]);
    expect(html).toContain("<noscript>");
    expect(html).toContain(`<script>${FORM_POST_SCRIPT}</script>`);
  });

  it("skips undefined parameters", async () => {
    const html = await formPostResponse("https://app.example/cb", { error: "access_denied", state: undefined }).text();

    expect(inputsOf(html)).toEqual([["error", "access_denied"]]);
  });

  it("keeps the redirect URI's own query in the form's action", async () => {
    const html = await formPostResponse("https://app.example/cb?tenant=a&b=1", { code: "c" }).text();

    expect(html).toContain('action="https://app.example/cb?tenant=a&amp;b=1"');
  });

  it.each([
    ["markup that closes the attribute", '"><script>alert(1)</script>'],
    ["single quotes", "' onmouseover='alert(1)"],
    ["an ampersand entity", "&lt;&amp;&#x3c;"],
    ["a closing tag", "</form></body><img src=x onerror=alert(1)>"],
    ["unicode", "é中\u{1f600}‮"],
  ])("escapes a state holding %s so it reaches the client unchanged", async (_label, state) => {
    const html = await formPostResponse("https://app.example/cb", { state }).text();

    expect(inputsOf(html)).toEqual([["state", state]]);
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).not.toMatch(/<img|onmouseover='/);
  });

  it("allows only its own script, by hash, and refuses framing, caching and referrers", () => {
    const response = formPostResponse("https://app.example/cb", { code: "c" });

    expect(response.headers.get("content-security-policy")).toBe(
      `default-src 'none'; script-src 'sha256-${policyHash()}'; form-action https://app.example; frame-ancestors 'none'; base-uri 'none'`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([
    ["a port", "https://app.example:8443/cb", "https://app.example:8443"],
    ["a custom scheme", "com.example.app:/callback", "com.example.app:"],
    ["a loopback address", "http://127.0.0.1:8000/cb", "http://127.0.0.1:8000"],
  ])("restricts form-action to the redirect URI's origin for %s", (_label, uri, source) => {
    const policy = formPostResponse(uri, { code: "c" }).headers.get("content-security-policy");

    expect(policy).toContain(`; form-action ${source};`);
  });

  it("leaves form-action out rather than write a host the policy syntax cannot hold", () => {
    const policy = formPostResponse("https://a;script-src*.example/cb", { code: "c" }).headers.get(
      "content-security-policy",
    );

    expect(policy).toBe(
      `default-src 'none'; script-src 'sha256-${policyHash()}'; frame-ancestors 'none'; base-uri 'none'`,
    );
  });
});
