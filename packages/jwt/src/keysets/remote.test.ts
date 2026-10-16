import { afterEach, describe, expect, it, vi } from "vitest";

import type { JwtHeader, JwtResult, KeySet, VerificationKey } from "../core/types";
import { EC_P256_PUBLIC_JWK, ED25519_PUBLIC_JWK } from "../keys/test-fixtures";
import { createRemoteKeySet, type RemoteKeySetOptions } from "./remote";

const URL_STRING = "https://issuer.example/jwks.json";
const EC_JWK = { ...EC_P256_PUBLIC_JWK, kid: "ec", alg: "ES256" };
const ED_JWK = { ...ED25519_PUBLIC_JWK, kid: "ed", alg: "EdDSA" };
const EC_HEADER: JwtHeader = { alg: "ES256", kid: "ec" };
const ED_HEADER: JwtHeader = { alg: "EdDSA", kid: "ed" };
const SECRET_MARKER = "do-not-echo-7f3a";

const jwksResponse = (...keys: object[]): Response => new Response(JSON.stringify({ keys }), { status: 200 });

const failure = (params: Record<string, string | number>): JwtResult<never> => ({
  ok: false,
  error: { issues: [{ code: "key_fetch_failed", params }] },
});

/** A fetch stub that answers each call with the next response factory, repeating the last. */
const fetchSequence = (...responders: (() => Response | Promise<Response>)[]) => {
  let calls = 0;
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const responder = responders[Math.min(calls, responders.length - 1)] as () => Response | Promise<Response>;
    calls += 1;
    return responder();
  });
};

/** A clock the test moves, in seconds. */
const createClock = () => {
  let seconds = 0;
  return {
    now: () => seconds * 1000,
    set: (value: number) => {
      seconds = value;
    },
  };
};

const createSet = (options: Partial<RemoteKeySetOptions>): KeySet =>
  createRemoteKeySet({ url: URL_STRING, ...options });

/** The `alg` and `kid` of the selected key, or the failure. */
const describeSelection = (result: JwtResult<VerificationKey>) =>
  result.ok ? { alg: result.value.alg, kid: result.value.kid } : result;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createRemoteKeySet options", () => {
  it.each([
    "http://issuer.example/jwks.json",
    "data:application/json,{}",
    "/jwks.json",
    "https://user:pass@issuer.example/",
  ])("should throw TypeError for url %s", (url) => {
    expect(() => createRemoteKeySet({ url })).toThrow(
      new TypeError("createRemoteKeySet: options.url must be an absolute https: URL without credentials."),
    );
  });

  it("should accept a URL object", () => {
    expect(() => createRemoteKeySet({ url: new URL(URL_STRING) })).not.toThrow();
  });

  it("should throw TypeError when options is not an object", () => {
    expect(() => createRemoteKeySet(undefined as never)).toThrow(
      new TypeError("createRemoteKeySet: options must be an object."),
    );
  });

  it.each<[string, Partial<Record<keyof RemoteKeySetOptions, unknown>>]>([
    ["cacheTtl 0", { cacheTtl: 0 }],
    ["cacheTtl 1.5", { cacheTtl: 1.5 }],
    ["cooldown -1", { cooldown: -1 }],
    ["cooldown over cacheTtl", { cacheTtl: 10, cooldown: 11 }],
    ["maxStale -1", { maxStale: -1 }],
    ["maxStale as a string", { maxStale: "60" }],
    ["maxStale null", { maxStale: null }],
    ["cacheTtl null", { cacheTtl: null }],
    ["timeout null", { timeout: null }],
    ["timeout 0", { timeout: 0 }],
    ["timeout 61", { timeout: 61 }],
    ["timeout NaN", { timeout: Number.NaN }],
    ["maxResponseBytes 0", { maxResponseBytes: 0 }],
    ["maxResponseBytes over 1 MiB", { maxResponseBytes: 1_048_577 }],
    ["fetch that is not a function", { fetch: "fetch" }],
    ["now that is not a function", { now: 0 }],
    ["empty algorithms", { algorithms: [] }],
    ["algorithms with HS256", { algorithms: ["HS256"] }],
  ])("should throw TypeError for %s", (_name, options) => {
    expect(() => createSet(options as Partial<RemoteKeySetOptions>)).toThrow(TypeError);
  });

  it("should default cooldown to cacheTtl when cacheTtl is under 30 seconds", async () => {
    const clock = createClock();
    const fetch = fetchSequence(() => new Response(null, { status: 503 }));
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 10 });
    await keys.select(EC_HEADER);
    clock.set(9);
    await keys.select(EC_HEADER);
    const callsBeforeCooldown = fetch.mock.calls.length;
    clock.set(10);
    await keys.select(EC_HEADER);
    expect([callsBeforeCooldown, fetch.mock.calls.length]).toEqual([1, 2]);
  });

  it("should return a frozen key set", () => {
    expect(Object.isFrozen(createSet({ fetch: fetchSequence(() => jwksResponse()) }))).toBe(true);
  });
});

describe("createRemoteKeySet fetching", () => {
  it("should not fetch before the first select", () => {
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    createSet({ fetch });
    expect(fetch).toHaveBeenCalledTimes(0);
  });

  it("should select a key from the fetched JWKS", async () => {
    const keys = createSet({ fetch: fetchSequence(() => jwksResponse(EC_JWK)) });
    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({ alg: "ES256", kid: "ec" });
  });

  it("should send a GET for JSON that does not follow redirects", async () => {
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    await createSet({ fetch }).select(EC_HEADER);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect({ url, init: { ...init, signal: init.signal instanceof AbortSignal } }).toEqual({
      url: URL_STRING,
      init: { method: "GET", headers: { accept: "application/json" }, redirect: "manual", signal: true },
    });
  });

  it("should pass no credentials or cache option", async () => {
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    await createSet({ fetch }).select(EC_HEADER);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(Object.keys(init).sort()).toEqual(["headers", "method", "redirect", "signal"]);
  });

  it("should use globalThis.fetch as it is when select runs", async () => {
    const keys = createSet({});
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    vi.stubGlobal("fetch", fetch);
    await keys.select(EC_HEADER);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("should share one fetch among concurrent first selects", async () => {
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    const keys = createSet({ fetch });
    await Promise.all(Array.from({ length: 50 }, () => keys.select(EC_HEADER)));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("should not refetch within cacheTtl", async () => {
    const clock = createClock();
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600 });
    await keys.select(EC_HEADER);
    clock.set(599);
    await keys.select(EC_HEADER);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("should refetch once cacheTtl has passed", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => jwksResponse(ED_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600 });
    await keys.select(EC_HEADER);
    clock.set(600);
    expect(describeSelection(await keys.select(ED_HEADER))).toEqual({ alg: "EdDSA", kid: "ed" });
  });
});

describe("createRemoteKeySet unknown kid", () => {
  it("should refetch once and select a rotated-in key", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => jwksResponse(EC_JWK, ED_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(30);
    expect(describeSelection(await keys.select(ED_HEADER))).toEqual({ alg: "EdDSA", kid: "ed" });
  });

  it("should report unknown_kid without fetching during the cooldown", async () => {
    const clock = createClock();
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(29);
    expect([await keys.select(ED_HEADER), fetch.mock.calls.length]).toEqual([
      { ok: false, error: { issues: [{ code: "unknown_kid", path: ["header", "kid"] }] } },
      1,
    ]);
  });

  it("should fetch once for a flood of concurrent unknown kids", async () => {
    const clock = createClock();
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(30);
    await Promise.all(Array.from({ length: 1000 }, (_, index) => keys.select({ alg: "ES256", kid: `x${index}` })));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("should not refetch for an unknown kid in the same select that loaded the JWKS", async () => {
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    await createSet({ fetch }).select(ED_HEADER);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("should not refetch for a header without kid that matches no key", async () => {
    const clock = createClock();
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    const keys = createSet({ fetch, now: clock.now });
    await keys.select(EC_HEADER);
    clock.set(300);
    await keys.select({ alg: "EdDSA" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("should report the failure of a refetch for an unknown kid", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Response(null, { status: 503 }),
    );
    const keys = createSet({ fetch, now: clock.now });
    await keys.select(EC_HEADER);
    clock.set(30);
    expect(await keys.select(ED_HEADER)).toEqual(failure({ reason: "status", status: 503 }));
  });
});

describe("createRemoteKeySet failures", () => {
  it("should report timeout for an endpoint that does not answer", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((): Promise<Response> => new Promise(() => undefined));
    const pending = createSet({ fetch, timeout: 2 }).select(EC_HEADER);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toEqual(failure({ reason: "timeout" }));
  });

  it("should abort the request signal on timeout", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const pending = createSet({ fetch, timeout: 2 }).select(EC_HEADER);
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("should report timeout for a body that stalls", async () => {
    vi.useFakeTimers();
    const stalled = new ReadableStream<Uint8Array>({
      start: (controller) => controller.enqueue(new Uint8Array([123])),
    });
    const keys = createSet({ fetch: fetchSequence(() => new Response(stalled, { status: 200 })), timeout: 2 });
    const pending = keys.select(EC_HEADER);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toEqual(failure({ reason: "timeout" }));
  });

  it("should report too_large for a Content-Length over the cap", async () => {
    const response = () => new Response("{}", { status: 200, headers: { "content-length": "1000" } });
    const keys = createSet({ fetch: fetchSequence(response), maxResponseBytes: 999 });
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "too_large" }));
  });

  it("should report too_large and cancel a streamed body that grows past the cap", async () => {
    const cancel = vi.fn();
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(new Uint8Array(1024).fill(32)),
      cancel,
    });
    const keys = createSet({
      fetch: fetchSequence(() => new Response(endless, { status: 200 })),
      maxResponseBytes: 4096,
    });
    expect([await keys.select(EC_HEADER), cancel.mock.calls.length]).toEqual([failure({ reason: "too_large" }), 1]);
  });

  it("should accept a body of exactly the cap", async () => {
    const body = JSON.stringify({ keys: [EC_JWK] });
    const keys = createSet({
      fetch: fetchSequence(() => new Response(body, { status: 200 })),
      maxResponseBytes: new TextEncoder().encode(body).byteLength,
    });
    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({ alg: "ES256", kid: "ec" });
  });

  it("should report status with the status code for a non-200 response", async () => {
    const keys = createSet({ fetch: fetchSequence(() => new Response(SECRET_MARKER, { status: 500 })) });
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "status", status: 500 }));
  });

  it("should report status for a redirect instead of following it", async () => {
    const redirect = () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } });
    const keys = createSet({ fetch: fetchSequence(redirect) });
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "status", status: 302 }));
  });

  it("should report status for a 204 without body", async () => {
    const keys = createSet({ fetch: fetchSequence(() => new Response(null, { status: 204 })) });
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "status", status: 204 }));
  });

  it("should report invalid_response for a body that is not JSON", async () => {
    const keys = createSet({ fetch: fetchSequence(() => new Response(`<html>${SECRET_MARKER}`, { status: 200 })) });
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "invalid_response" }));
  });

  it("should report invalid_response for duplicate member names", async () => {
    const body = `{"keys":[],"keys":[${JSON.stringify(EC_JWK)}]}`;
    const keys = createSet({ fetch: fetchSequence(() => new Response(body, { status: 200 })) });
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "invalid_response" }));
  });

  it("should report invalid_response for JSON that is not a JWKS", async () => {
    const keys = createSet({ fetch: fetchSequence(() => new Response('{"keys":"x"}', { status: 200 })) });
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "invalid_response" }));
  });

  it("should report network when fetch rejects", async () => {
    const fetch = vi.fn(async (): Promise<Response> => {
      throw new TypeError(`connect failed ${SECRET_MARKER}`);
    });
    expect(await createSet({ fetch }).select(EC_HEADER)).toEqual(failure({ reason: "network" }));
  });

  it("should report network when fetch throws synchronously", async () => {
    const fetch = vi.fn((): Promise<Response> => {
      throw new TypeError("no fetch");
    });
    expect(await createSet({ fetch }).select(EC_HEADER)).toEqual(failure({ reason: "network" }));
  });

  it.each<[string, () => Response]>([
    ["status", () => new Response(SECRET_MARKER, { status: 500 })],
    ["invalid JSON", () => new Response(`{"${SECRET_MARKER}"`, { status: 200 })],
    ["invalid JWKS", () => new Response(`{"keys":"${SECRET_MARKER}"}`, { status: 200 })],
  ])("should keep the response body out of a %s failure", async (_name, response) => {
    const result = await createSet({ fetch: fetchSequence(response) }).select(EC_HEADER);
    expect(JSON.stringify(result).includes(SECRET_MARKER)).toBe(false);
  });
});

describe("createRemoteKeySet stale keys", () => {
  const flapping = () =>
    fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Response(null, { status: 503 }),
    );

  it("should serve the expired JWKS while refetching fails within maxStale", async () => {
    const clock = createClock();
    const keys = createSet({ fetch: flapping(), now: clock.now, cacheTtl: 600, maxStale: 3600 });
    await keys.select(EC_HEADER);
    clock.set(600 + 3600);
    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({ alg: "ES256", kid: "ec" });
  });

  it("should fail once maxStale has passed", async () => {
    const clock = createClock();
    const keys = createSet({ fetch: flapping(), now: clock.now, cacheTtl: 600, maxStale: 3600 });
    await keys.select(EC_HEADER);
    clock.set(600 + 3601);
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "status", status: 503 }));
  });

  it("should never serve an expired JWKS when maxStale is 0", async () => {
    const clock = createClock();
    const keys = createSet({ fetch: flapping(), now: clock.now, cacheTtl: 600, maxStale: 0 });
    await keys.select(EC_HEADER);
    clock.set(601);
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "status", status: 503 }));
  });

  it("should wait for the cooldown before retrying a failed fetch", async () => {
    const clock = createClock();
    const fetch = flapping();
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(600);
    await keys.select(EC_HEADER);
    clock.set(629);
    await keys.select(EC_HEADER);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("should retry a failed fetch after the cooldown", async () => {
    const clock = createClock();
    const fetch = flapping();
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(600);
    await keys.select(EC_HEADER);
    clock.set(630);
    await keys.select(EC_HEADER);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("should report the last failure during the cooldown when nothing was ever fetched", async () => {
    const clock = createClock();
    const fetch = fetchSequence(() => new Response(null, { status: 503 }));
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(10);
    expect([await keys.select(EC_HEADER), fetch.mock.calls.length]).toEqual([
      failure({ reason: "status", status: 503 }),
      1,
    ]);
  });
});
