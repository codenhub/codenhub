import { afterEach, describe, expect, it, vi } from "vitest";

import type { OidcResult } from "../shared/types";
import { discover } from "./discover";
import type { DiscoverOptions } from "./types";

const ISSUER = "https://login.example.com";
const DISCOVERY_PATH = "/.well-known/openid-configuration";

const validDocument = (issuer = ISSUER): Record<string, unknown> => ({
  issuer,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A stub `fetch` whose calls can be inspected, answering each call with a fresh response. */
const stubFetch = (respond: () => Response | Promise<Response>) =>
  vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => respond());

const requestedUrl = (stub: ReturnType<typeof stubFetch>): string => String(stub.mock.calls[0]?.[0]);

const issuesOf = (result: OidcResult<unknown>) => {
  if (result.ok) {
    throw new Error("expected a failed result");
  }
  return result.error.issues;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("discover", () => {
  it("requests the well-known path under the issuer", async () => {
    const stub = stubFetch(() => jsonResponse(validDocument()));

    await discover(ISSUER, { fetch: stub });

    expect(requestedUrl(stub)).toBe(`${ISSUER}${DISCOVERY_PATH}`);
  });

  it("removes a trailing slash from the issuer before adding the path", async () => {
    const issuer = `${ISSUER}/`;
    const stub = stubFetch(() => jsonResponse(validDocument(issuer)));

    const result = await discover(issuer, { fetch: stub });

    expect(result.ok).toBe(true);
    expect(requestedUrl(stub)).toBe(`${ISSUER}${DISCOVERY_PATH}`);
  });

  it("keeps the path of an issuer that has one", async () => {
    const issuer = `${ISSUER}/tenants/acme`;
    const stub = stubFetch(() => jsonResponse(validDocument(issuer)));

    await discover(issuer, { fetch: stub });

    expect(requestedUrl(stub)).toBe(`${issuer}${DISCOVERY_PATH}`);
  });

  it("does not follow redirects", async () => {
    const stub = stubFetch(() => jsonResponse(validDocument()));

    await discover(ISSUER, { fetch: stub });

    expect(stub.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "manual" });
  });

  it("returns the metadata when the document is valid", async () => {
    const result = await discover(ISSUER, { fetch: stubFetch(() => jsonResponse(validDocument())) });

    expect(result).toEqual({ ok: true, value: expect.objectContaining({ token_endpoint: `${ISSUER}/token` }) });
  });

  it("returns request_failed with the status for a 404", async () => {
    const result = await discover(ISSUER, { fetch: stubFetch(() => jsonResponse({}, 404)) });

    expect(issuesOf(result)).toEqual([
      { code: "request_failed", params: { endpoint: "discovery", reason: "status", status: 404 } },
    ]);
  });

  it("returns request_failed with the status for a redirect", async () => {
    const redirect = new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } });

    const result = await discover(ISSUER, { fetch: stubFetch(() => redirect) });

    expect(issuesOf(result)).toEqual([
      { code: "request_failed", params: { endpoint: "discovery", reason: "status", status: 302 } },
    ]);
  });

  it("returns request_failed for a 200 that is not JSON", async () => {
    const html = new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });

    const result = await discover(ISSUER, { fetch: stubFetch(() => html) });

    expect(issuesOf(result)).toEqual([
      { code: "request_failed", params: { endpoint: "discovery", reason: "content_type" } },
    ]);
  });

  it("returns request_failed for a body larger than 64 KiB", async () => {
    const oversized = jsonResponse({ ...validDocument(), padding: "x".repeat(70_000) });

    const result = await discover(ISSUER, { fetch: stubFetch(() => oversized) });

    expect(issuesOf(result)).toEqual([
      { code: "request_failed", params: { endpoint: "discovery", reason: "too_large" } },
    ]);
  });

  it("returns request_failed for a body that is not valid JSON", async () => {
    const broken = new Response("{not json", { status: 200, headers: { "content-type": "application/json" } });

    const result = await discover(ISSUER, { fetch: stubFetch(() => broken) });

    expect(issuesOf(result)).toEqual([
      { code: "request_failed", params: { endpoint: "discovery", reason: "malformed" } },
    ]);
  });

  it("accepts a discovery document that starts with a byte order mark", async () => {
    const bytes = new TextEncoder().encode(`﻿${JSON.stringify(validDocument())}`);
    const withBom = new Response(bytes, { status: 200, headers: { "content-type": "application/json" } });

    const result = await discover(ISSUER, { fetch: stubFetch(() => withBom) });

    expect(result.ok).toBe(true);
  });

  it("accepts a JSON content type with a charset parameter", async () => {
    const withCharset = new Response(JSON.stringify(validDocument()), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });

    const result = await discover(ISSUER, { fetch: stubFetch(() => withCharset) });

    expect(result.ok).toBe(true);
  });

  it("returns request_failed for a body over 64 KiB whose Content-Length understates it", async () => {
    const oversized = new Response(JSON.stringify({ ...validDocument(), padding: "x".repeat(70_000) }), {
      status: 200,
      headers: { "content-type": "application/json", "content-length": "100" },
    });

    const result = await discover(ISSUER, { fetch: stubFetch(() => oversized) });

    expect(issuesOf(result)).toEqual([
      { code: "request_failed", params: { endpoint: "discovery", reason: "too_large" } },
    ]);
  });

  it("returns request_failed with reason timeout when the body stalls after its first chunk", async () => {
    vi.useFakeTimers();
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"issuer":'));
      },
    });
    const pending = discover(ISSUER, {
      fetch: stubFetch(() => new Response(stalled, { status: 200, headers: { "content-type": "application/json" } })),
      timeout: 1,
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(issuesOf(await pending)).toEqual([
      { code: "request_failed", params: { endpoint: "discovery", reason: "timeout" } },
    ]);
  });

  it("returns request_failed with reason timeout when the response never arrives", async () => {
    vi.useFakeTimers();
    const pending = discover(ISSUER, { fetch: stubFetch(() => new Promise<Response>(() => {})), timeout: 1 });

    await vi.advanceTimersByTimeAsync(1000);

    expect(issuesOf(await pending)).toEqual([
      { code: "request_failed", params: { endpoint: "discovery", reason: "timeout" } },
    ]);
  });

  it("returns request_failed with reason network when fetch rejects", async () => {
    const rejecting = stubFetch(async () => {
      throw new TypeError("fetch failed");
    });

    const result = await discover(ISSUER, { fetch: rejecting });

    expect(issuesOf(result)).toEqual([
      { code: "request_failed", params: { endpoint: "discovery", reason: "network" } },
    ]);
  });

  it("returns issuer_mismatch when the document names another issuer", async () => {
    const result = await discover(ISSUER, {
      fetch: stubFetch(() => jsonResponse(validDocument("https://other.example.com"))),
    });

    expect(issuesOf(result)).toEqual([{ code: "issuer_mismatch", path: ["metadata", "issuer"] }]);
  });

  it("returns invalid_metadata with the path of a bad member", async () => {
    const document = { ...validDocument(), jwks_uri: "http://login.example.com/jwks" };

    const result = await discover(ISSUER, { fetch: stubFetch(() => jsonResponse(document)) });

    expect(issuesOf(result)).toEqual([{ code: "invalid_metadata", path: ["metadata", "jwks_uri"] }]);
  });

  it("keeps response values out of every issue", async () => {
    const document = {
      ...validDocument("secret-issuer-456"),
      token_endpoint: "http://secret-value-123.example/token",
    };

    const result = await discover(ISSUER, { fetch: stubFetch(() => jsonResponse(document)) });

    const serialized = JSON.stringify(issuesOf(result));
    expect(serialized).not.toContain("secret-issuer-456");
    expect(serialized).not.toContain("secret-value-123");
  });

  it("throws TypeError for an issuer that is not an https URL", async () => {
    await expect(discover("http://login.example.com")).rejects.toThrow(TypeError);
  });

  it("throws TypeError for an issuer with a query", async () => {
    await expect(discover(`${ISSUER}/?tenant=acme`)).rejects.toThrow(TypeError);
  });

  it("throws TypeError for an issuer with an empty query", async () => {
    await expect(discover(`${ISSUER}/?`)).rejects.toThrow(TypeError);
  });

  it("throws TypeError when options is not an object", async () => {
    await expect(discover(ISSUER, "fast" as unknown as DiscoverOptions)).rejects.toThrow(TypeError);
  });

  it("throws TypeError when fetch is not a function", async () => {
    await expect(discover(ISSUER, { fetch: "fetch" as unknown as typeof fetch })).rejects.toThrow(TypeError);
  });

  it.each([0, 61, 1.5, Number.NaN])("throws TypeError for timeout %s", async (timeout) => {
    await expect(discover(ISSUER, { timeout })).rejects.toThrow(TypeError);
  });

  it("names the option in the TypeError message but not its value", async () => {
    const error = await discover(ISSUER, { timeout: 99 }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toContain("timeout");
    expect((error as Error).message).not.toContain("99");
  });
});
