import { afterEach, describe, expect, it, vi } from "vitest";

import type { JwtHeader, JwtResult, KeySet, VerificationKey } from "../core/types";
import { generateKeyPair } from "../keys/generate";
import { EC_P256_PUBLIC_JWK, ED25519_PUBLIC_JWK } from "../keys/test-fixtures";
import { sign } from "../sign/sign";
import { createVerifier } from "../verify/create-verifier";
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
    "http://localhost.example/jwks.json",
    "http://sub.localhost/jwks.json",
    "http://128.0.0.1/jwks.json",
    "http://[::2]/jwks.json",
    "http://10.0.0.1/jwks.json",
    "http://user:pass@localhost/jwks.json",
    "ws://localhost/jwks.json",
    "data:application/json,{}",
    "/jwks.json",
    "https://user:pass@issuer.example/",
  ])("should throw TypeError for url %s", (url) => {
    expect(() => createRemoteKeySet({ url })).toThrow(
      new TypeError(
        "createRemoteKeySet: options.url must be an absolute https: URL without credentials, or http: on a loopback host.",
      ),
    );
  });

  // A development issuer on the same machine serves plain HTTP; loopback traffic never leaves the host.
  it.each([
    "http://localhost:8787/jwks.json",
    "http://LOCALHOST/jwks.json",
    "http://127.0.0.1:3000/jwks.json",
    "http://127.1.2.3/jwks.json",
    "http://[::1]:8080/jwks.json",
  ])("should accept http: on the loopback host of %s and fetch from it", async (url) => {
    const fetch = vi.fn(async () => jwksResponse(EC_JWK));
    const keys = createRemoteKeySet({ url, fetch });

    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({ alg: "ES256", kid: "ec" });
    expect(fetch).toHaveBeenCalledWith(new URL(url).href, expect.anything());
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
    ["onFetch that is not a function", { onFetch: "log" }],
    ["onFetchError that is not a function", { onFetchError: {} }],
    ["waitUntil that is not a function", { waitUntil: true }],
    ["seed that is not an object", { seed: "{}" }],
    ["seed null", { seed: null }],
    ["seed without fetchedAt", { seed: { jwks: { keys: [] } } }],
    ["seed with a NaN fetchedAt", { seed: { jwks: { keys: [] }, fetchedAt: Number.NaN } }],
    ["seed with a string fetchedAt", { seed: { jwks: { keys: [] }, fetchedAt: "0" } }],
    ["empty algorithms", { algorithms: [] }],
    ["algorithms with HS256", { algorithms: ["HS256"] }],
  ])("should throw TypeError for %s", (_name, options) => {
    expect(() => createSet(options as Partial<RemoteKeySetOptions>)).toThrow(TypeError);
  });

  it.each([
    ["unknown option audiance", { audiance: "api" }],
    ["unknown option cachettl", { cachettl: 5 }],
    ["unknown option set to undefined", { timout: undefined }],
  ])("should throw TypeError for %s", (_name, options) => {
    const name = Object.keys(options)[0];
    expect(() => createSet(options as Partial<RemoteKeySetOptions>)).toThrow(
      new TypeError(`createRemoteKeySet: options.${name} is not an option.`),
    );
  });

  it("should truncate a very long unknown option name in the message", () => {
    expect(() => createSet({ ["x".repeat(500)]: 1 } as never)).toThrow(
      new TypeError(`createRemoteKeySet: options.${"x".repeat(64)}... is not an option.`),
    );
  });

  it("should ignore symbol keys in options", () => {
    expect(() => createSet({ [Symbol("note")]: 1 } as never)).not.toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, undefined, "0"])(
    "should reject select with TypeError when now returns %s, without fetching",
    async (time) => {
      const fetch = fetchSequence(() => jwksResponse(EC_JWK));
      const keys = createSet({ fetch, now: () => time as number });

      await expect(keys.select(EC_HEADER)).rejects.toThrow(
        new TypeError("createRemoteKeySet: options.now must return a finite number of milliseconds."),
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("should reject select with TypeError when the clock breaks after a fetch", async () => {
    let broken = false;
    const keys = createSet({ fetch: fetchSequence(() => jwksResponse(EC_JWK)), now: () => (broken ? Number.NaN : 0) });
    await keys.select(EC_HEADER);
    broken = true;

    await expect(keys.select(EC_HEADER)).rejects.toThrow(TypeError);
  });

  it("should make a verifier fail closed with key_set_error when the remote clock is broken", async () => {
    const keys = createSet({ fetch: fetchSequence(() => jwksResponse(EC_JWK)), now: () => Number.NaN });
    const pair = await generateKeyPair({ alg: "ES256", kid: "ec" });
    const token = await sign({ payload: { sub: "u" }, key: pair.privateKey });

    expect(await createVerifier({ keys })(token)).toEqual(failure({ reason: "key_set_error" }));
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

  it("should select a known kid from a fresh cache without waiting for a refetch for an unknown kid", async () => {
    const clock = createClock();
    let finishRefetch: (response: Response) => void = () => undefined;
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () =>
        new Promise<Response>((resolve) => {
          finishRefetch = resolve;
        }),
    );
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(30);
    const unknown = keys.select(ED_HEADER);
    const outcome = await Promise.race([
      keys.select(EC_HEADER).then(describeSelection),
      new Promise<string>((resolve) => setTimeout(() => resolve("still waiting"), 0)),
    ]);
    expect(outcome).toEqual({ alg: "ES256", kid: "ec" });
    finishRefetch(jwksResponse(EC_JWK, ED_JWK));
    expect(describeSelection(await unknown)).toEqual({ alg: "EdDSA", kid: "ed" });
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
    clock.set(600 + 3599);
    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({ alg: "ES256", kid: "ec" });
  });

  it("should fail once maxStale has passed", async () => {
    const clock = createClock();
    const keys = createSet({ fetch: flapping(), now: clock.now, cacheTtl: 600, maxStale: 3600 });
    await keys.select(EC_HEADER);
    clock.set(600 + 3600);
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "status", status: 503 }));
  });

  it("should never serve an expired JWKS when maxStale is 0", async () => {
    const clock = createClock();
    const keys = createSet({ fetch: flapping(), now: clock.now, cacheTtl: 600, maxStale: 0 });
    await keys.select(EC_HEADER);
    clock.set(601);
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "status", status: 503 }));
  });

  it("should never serve an expired JWKS at the instant it expires when maxStale is 0", async () => {
    const clock = createClock();
    const keys = createSet({ fetch: flapping(), now: clock.now, cacheTtl: 600, maxStale: 0 });
    await keys.select(EC_HEADER);
    clock.set(600);
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

describe("createRemoteKeySet when the clock steps back", () => {
  it("should treat the cooldown as over when the clock is earlier than the last fetch start", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Response(null, { status: 503 }),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(700);
    await keys.select(EC_HEADER);
    clock.set(650);
    await keys.select(EC_HEADER);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("should refetch an unknown kid when the clock is earlier than the last fetch start", async () => {
    const clock = createClock();
    clock.set(1000);
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => jwksResponse(EC_JWK, ED_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(500);
    expect(describeSelection(await keys.select(ED_HEADER))).toEqual({ alg: "EdDSA", kid: "ed" });
  });

  it("should treat the cache as expired when the clock is earlier than the fetch", async () => {
    const clock = createClock();
    clock.set(1000);
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => jwksResponse(ED_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600 });
    await keys.select(EC_HEADER);
    clock.set(0);
    expect(describeSelection(await keys.select(ED_HEADER))).toEqual({ alg: "EdDSA", kid: "ed" });
  });

  it("should not serve the cached JWKS as stale when the clock is earlier than the fetch", async () => {
    const clock = createClock();
    clock.set(1000);
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Response(null, { status: 503 }),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, maxStale: 3600 });
    await keys.select(EC_HEADER);
    clock.set(0);
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "status", status: 503 }));
  });
});

describe("createRemoteKeySet response handling", () => {
  it("should report invalid_response for more than 100 keys", async () => {
    const many = Array.from({ length: 101 }, (_, index) => ({ ...EC_JWK, kid: `k${index}` }));
    const keys = createSet({ fetch: fetchSequence(() => jwksResponse(...many)) });
    expect(await keys.select(EC_HEADER)).toEqual(failure({ reason: "invalid_response" }));
  });

  it("should accept exactly 100 keys", async () => {
    const many = Array.from({ length: 100 }, (_, index) => ({ ...EC_JWK, kid: `k${index}` }));
    const keys = createSet({ fetch: fetchSequence(() => jwksResponse(...many)) });
    expect(describeSelection(await keys.select({ alg: "ES256", kid: "k99" }))).toEqual({ alg: "ES256", kid: "k99" });
  });

  it.each([undefined, null, {}])("should report key_fetch_failed, not throw, when fetch returns %j", async (value) => {
    const fetch = vi.fn(async (): Promise<Response> => value as never);
    const result = await createSet({ fetch }).select(EC_HEADER);
    expect(result.ok ? [] : result.error.issues.map((issue) => issue.code)).toEqual(["key_fetch_failed"]);
  });

  it("should read a 200 response whose body is null through arrayBuffer", async () => {
    const response = jwksResponse(EC_JWK);
    Object.defineProperty(response, "body", { value: null });
    const keys = createSet({ fetch: fetchSequence(() => response) });
    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({ alg: "ES256", kid: "ec" });
  });

  it("should throw TypeError for a URL object carrying credentials", () => {
    expect(() => createRemoteKeySet({ url: new URL("https://user:pass@issuer.example/jwks.json") })).toThrow(
      new TypeError(
        "createRemoteKeySet: options.url must be an absolute https: URL without credentials, or http: on a loopback host.",
      ),
    );
  });

  it("should count the TTL from when the fetch completes", async () => {
    const clock = createClock();
    const fetch = fetchSequence(() => {
      clock.set(100);
      return jwksResponse(EC_JWK);
    });
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600 });
    await keys.select(EC_HEADER);
    clock.set(699);
    await keys.select(EC_HEADER);
    const callsBeforeExpiry = fetch.mock.calls.length;
    clock.set(700);
    await keys.select(EC_HEADER);
    expect([callsBeforeExpiry, fetch.mock.calls.length]).toEqual([1, 2]);
  });
});

describe("createRemoteKeySet refreshing in the background", () => {
  const settlesWithin = async <T>(promise: Promise<T>, ms: number): Promise<T | "still pending"> =>
    Promise.race([promise, new Promise<"still pending">((resolve) => setTimeout(() => resolve("still pending"), ms))]);

  it("should serve the expired JWKS at once while the refetch is still running", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Promise<Response>(() => undefined),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, timeout: 60 });
    await keys.select(EC_HEADER);
    clock.set(600);
    const result = await settlesWithin(keys.select(EC_HEADER), 50);
    expect([result === "still pending" ? result : describeSelection(result), fetch.mock.calls.length]).toEqual([
      { alg: "ES256", kid: "ec" },
      2,
    ]);
  });

  it("should replace the cache with the JWKS the background refetch returns", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => jwksResponse(ED_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, cooldown: 30 });
    await keys.select(EC_HEADER);
    clock.set(600);
    await keys.select(EC_HEADER);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    clock.set(601);
    expect([describeSelection(await keys.select(ED_HEADER)), describeSelection(await keys.select(EC_HEADER))]).toEqual([
      { alg: "EdDSA", kid: "ed" },
      { ok: false, error: { issues: [{ code: "unknown_kid", path: ["header", "kid"] }] } },
    ]);
  });

  it("should wait for the background refetch for a kid the expired JWKS lacks", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => jwksResponse(EC_JWK, ED_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600 });
    await keys.select(EC_HEADER);
    clock.set(600);
    expect([describeSelection(await keys.select(ED_HEADER)), fetch.mock.calls.length]).toEqual([
      { alg: "EdDSA", kid: "ed" },
      2,
    ]);
  });

  it("should start one background refetch for concurrent selects of an expired JWKS", async () => {
    const clock = createClock();
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600 });
    await keys.select(EC_HEADER);
    clock.set(600);
    await Promise.all([keys.select(EC_HEADER), keys.select(EC_HEADER), keys.select(EC_HEADER)]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // A Workers runtime may cancel the I/O of a request that ended, so a fetch another request started can
  // stay pending past its own timeout; the set must not wait on it forever.
  it("should start a new fetch when the running one outlived its timeout and the cooldown", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Promise<Response>(() => undefined),
      () => jwksResponse(EC_JWK, ED_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, cooldown: 30, timeout: 5 });
    await keys.select(EC_HEADER);
    vi.useFakeTimers();
    clock.set(600);
    await keys.select(EC_HEADER);
    clock.set(631);
    expect([describeSelection(await keys.select(ED_HEADER)), fetch.mock.calls.length]).toEqual([
      { alg: "EdDSA", kid: "ed" },
      3,
    ]);
  });

  it("should ignore a replaced fetch that settles after the fetch that replaced it", async () => {
    const clock = createClock();
    let answerLate: (response: Response) => void = () => undefined;
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () =>
        new Promise<Response>((resolve) => {
          answerLate = resolve;
        }),
      () => jwksResponse(EC_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, cooldown: 30, timeout: 5 });
    await keys.select(EC_HEADER);
    vi.useFakeTimers();
    clock.set(600);
    await keys.select(EC_HEADER);
    clock.set(631);
    await keys.select(EC_HEADER);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    answerLate(jwksResponse(ED_JWK));
    await vi.advanceTimersByTimeAsync(0);
    clock.set(632);
    expect(describeSelection(await keys.select(ED_HEADER))).toEqual({
      ok: false,
      error: { issues: [{ code: "unknown_kid", path: ["header", "kid"] }] },
    });
  });

  it("should keep waiting on a running fetch that has not outlived the cooldown", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Promise<Response>(() => undefined),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, cooldown: 30, timeout: 5 });
    await keys.select(EC_HEADER);
    vi.useFakeTimers();
    clock.set(600);
    await keys.select(EC_HEADER);
    clock.set(629);
    await keys.select(EC_HEADER);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("createRemoteKeySet abandoned fetches", () => {
  it("should fetch again for a select that joins a fetch past its deadline", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => new Promise<Response>(() => undefined),
      () => jwksResponse(EC_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cooldown: 30, timeout: 5 });
    vi.useFakeTimers();
    void keys.select(EC_HEADER);
    clock.set(10);
    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({ alg: "ES256", kid: "ec" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("createRemoteKeySet missing kid", () => {
  it("should not refetch inside the cooldown while an abandoned background fetch is pending", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Promise<Response>(() => undefined),
      () => jwksResponse(EC_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, cooldown: 30, timeout: 5 });
    await keys.select(EC_HEADER);
    vi.useFakeTimers();
    clock.set(600);
    await keys.select(EC_HEADER);
    clock.set(610);
    const result = await keys.select({ alg: "ES256", kid: "invented" });
    expect([result.ok, fetch.mock.calls.length]).toEqual([false, 2]);
  });

  it("should refetch for a kid the cache lacks even when an unnamed key could stand in", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse({ ...EC_P256_PUBLIC_JWK, alg: "ES256" }),
      () => jwksResponse({ ...EC_P256_PUBLIC_JWK, kid: "rotated", alg: "ES256" }),
    );
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select({ alg: "ES256" });
    clock.set(31);
    expect(describeSelection(await keys.select({ alg: "ES256", kid: "rotated" }))).toEqual({
      alg: "ES256",
      kid: "rotated",
    });
  });

  it("should fall back to the unnamed key when the refetched JWKS still lacks the kid", async () => {
    const clock = createClock();
    const unnamed = (): Response => jwksResponse({ ...EC_P256_PUBLIC_JWK, alg: "ES256" });
    const fetch = fetchSequence(unnamed, unnamed, unnamed);
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select({ alg: "ES256" });
    clock.set(31);
    const first = describeSelection(await keys.select({ alg: "ES256", kid: "issuer-key" }));
    clock.set(32);
    const second = describeSelection(await keys.select({ alg: "ES256", kid: "issuer-key" }));
    expect([first, second, fetch.mock.calls.length]).toEqual([
      { alg: "ES256", kid: undefined },
      { alg: "ES256", kid: undefined },
      2,
    ]);
  });
  it("should refetch for a kid the cache lacks when several unnamed keys make the selection ambiguous", async () => {
    const clock = createClock();
    const unnamed = { ...EC_P256_PUBLIC_JWK, alg: "ES256" };
    const fetch = fetchSequence(
      () => jwksResponse(unnamed, unnamed),
      () => jwksResponse({ ...EC_P256_PUBLIC_JWK, kid: "rotated", alg: "ES256" }),
    );
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select({ alg: "ES256", kid: "ec" });
    clock.set(31);
    expect(describeSelection(await keys.select({ alg: "ES256", kid: "rotated" }))).toEqual({
      alg: "ES256",
      kid: "rotated",
    });
  });

  it("should not refetch inside the cooldown when a joined fetch misses its deadline and the cache is usable", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Promise<Response>(() => undefined),
      () => jwksResponse(EC_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, cooldown: 30, timeout: 5 });
    await keys.select(EC_HEADER);
    vi.useFakeTimers();
    clock.set(600);
    await keys.select(EC_HEADER);
    clock.set(602);
    const pending = keys.select({ alg: "ES256", kid: "invented" });
    clock.set(606);
    await vi.advanceTimersByTimeAsync(4000);
    const result = await pending;
    expect([result.ok, fetch.mock.calls.length]).toEqual([false, 2]);
  });

  it("should keep the unnamed key when the refetch for a missing kid fails", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse({ ...EC_P256_PUBLIC_JWK, alg: "ES256" }),
      () => new Response("unavailable", { status: 503 }),
    );
    const keys = createSet({ fetch, now: clock.now, cooldown: 30 });
    await keys.select({ alg: "ES256" });
    clock.set(31);
    expect(describeSelection(await keys.select({ alg: "ES256", kid: "issuer-key" }))).toEqual({
      alg: "ES256",
      kid: undefined,
    });
  });
});

describe("createRemoteKeySet waitUntil", () => {
  it("should hand each fetch it starts to waitUntil", async () => {
    const clock = createClock();
    const waitUntil = vi.fn();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => jwksResponse(EC_JWK),
    );
    const keys = createSet({ fetch, now: clock.now, waitUntil });
    await keys.select(EC_HEADER);
    clock.set(600);
    await keys.select(EC_HEADER);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(waitUntil.mock.calls.map(([promise]) => promise instanceof Promise)).toEqual([true, true]);
  });

  it("should select as usual when waitUntil throws", async () => {
    const keys = createSet({
      fetch: fetchSequence(() => jwksResponse(EC_JWK)),
      waitUntil: () => {
        throw new Error("no request context");
      },
    });
    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({ alg: "ES256", kid: "ec" });
  });
});

describe("createRemoteKeySet callbacks", () => {
  it("should call onFetch with the fetched JWKS and when it was fetched", async () => {
    const clock = createClock();
    clock.set(42);
    const onFetch = vi.fn();
    const keys = createSet({ fetch: fetchSequence(() => jwksResponse(EC_JWK)), now: clock.now, onFetch });
    await keys.select(EC_HEADER);
    expect(onFetch.mock.calls).toEqual([[{ jwks: { keys: [EC_JWK] }, fetchedAt: 42_000 }]]);
  });

  it("should call onFetchError with the issue of each failed fetch", async () => {
    const onFetchError = vi.fn();
    const keys = createSet({ fetch: fetchSequence(() => new Response(null, { status: 503 })), onFetchError });
    await keys.select(EC_HEADER);
    expect(onFetchError.mock.calls).toEqual([
      [{ code: "key_fetch_failed", params: { reason: "status", status: 503 } }],
    ]);
  });

  it("should not call onFetchError for a successful fetch, nor onFetch for a failed one", async () => {
    const onFetch = vi.fn();
    const onFetchError = vi.fn();
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Response(null, { status: 503 }),
    );
    const keys = createSet({ fetch, now: clock.now, maxStale: 0, onFetch, onFetchError });
    await keys.select(EC_HEADER);
    clock.set(600);
    await keys.select(EC_HEADER);
    expect([onFetch.mock.calls.length, onFetchError.mock.calls.length]).toEqual([1, 1]);
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("callback broke");
      },
    ],
    ["rejects", async () => Promise.reject(new Error("callback broke"))],
  ])("should select as usual when a callback %s", async (_name, callback) => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const failing = createSet({
        fetch: fetchSequence(() => new Response(null, { status: 503 })),
        onFetchError: callback,
      });
      const working = createSet({ fetch: fetchSequence(() => jwksResponse(EC_JWK)), onFetch: callback });
      const results = [await failing.select(EC_HEADER), describeSelection(await working.select(EC_HEADER))];
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect([...results, unhandled.mock.calls.length]).toEqual([
        failure({ reason: "status", status: 503 }),
        { alg: "ES256", kid: "ec" },
        0,
      ]);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("createRemoteKeySet seed", () => {
  it("should select from a fresh seed without fetching", async () => {
    const clock = createClock();
    clock.set(100);
    const fetch = fetchSequence(() => jwksResponse(ED_JWK));
    const keys = createSet({ fetch, now: clock.now, seed: { jwks: { keys: [EC_JWK] }, fetchedAt: 0 } });
    expect([describeSelection(await keys.select(EC_HEADER)), fetch.mock.calls.length]).toEqual([
      { alg: "ES256", kid: "ec" },
      0,
    ]);
  });

  it("should accept what onFetch received as a seed", async () => {
    const clock = createClock();
    let saved: unknown;
    const first = createSet({
      fetch: fetchSequence(() => jwksResponse(EC_JWK)),
      now: clock.now,
      onFetch: (fetched) => {
        saved = JSON.parse(JSON.stringify(fetched));
      },
    });
    await first.select(EC_HEADER);
    const fetch = fetchSequence(() => jwksResponse(ED_JWK));
    const second = createSet({ fetch, now: clock.now, seed: saved as RemoteKeySetOptions["seed"] });
    expect([describeSelection(await second.select(EC_HEADER)), fetch.mock.calls.length]).toEqual([
      { alg: "ES256", kid: "ec" },
      0,
    ]);
  });

  it("should serve an expired seed and refresh it in the background", async () => {
    const clock = createClock();
    clock.set(700);
    const fetch = fetchSequence(() => jwksResponse(ED_JWK));
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, seed: { jwks: { keys: [EC_JWK] }, fetchedAt: 0 } });
    expect([describeSelection(await keys.select(EC_HEADER)), fetch.mock.calls.length]).toEqual([
      { alg: "ES256", kid: "ec" },
      1,
    ]);
  });

  it("should fetch instead of using a seed older than cacheTtl plus maxStale", async () => {
    const clock = createClock();
    clock.set(600 + 3600);
    const fetch = fetchSequence(() => jwksResponse(ED_JWK));
    const keys = createSet({ fetch, now: clock.now, seed: { jwks: { keys: [EC_JWK] }, fetchedAt: 0 } });
    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({
      ok: false,
      error: { issues: [{ code: "unknown_kid", path: ["header", "kid"] }] },
    });
  });

  it.each([
    ["not a JWKS", { keys: "none" }],
    ["a JWKS with more than 100 keys", { keys: Array.from({ length: 101 }, () => EC_JWK) }],
    ["null", null],
  ])("should ignore a seed whose jwks is %s and fetch", async (_name, jwks) => {
    const fetch = fetchSequence(() => jwksResponse(EC_JWK));
    const keys = createSet({ fetch, seed: { jwks, fetchedAt: 0 } });
    expect([describeSelection(await keys.select(EC_HEADER)), fetch.mock.calls.length]).toEqual([
      { alg: "ES256", kid: "ec" },
      1,
    ]);
  });

  it("should treat a seed fetched later than the clock as expired", async () => {
    const fetch = fetchSequence(() => jwksResponse(ED_JWK));
    const keys = createSet({ fetch, now: () => 0, maxStale: 0, seed: { jwks: { keys: [EC_JWK] }, fetchedAt: 1000 } });
    await keys.select(EC_HEADER);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("createRemoteKeySet stale keys after other failures", () => {
  it("should serve the expired JWKS when the refetch times out", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => new Promise<Response>(() => undefined) as never,
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600, timeout: 2 });
    await keys.select(EC_HEADER);
    clock.set(600);
    vi.useFakeTimers();
    const pending = keys.select(EC_HEADER);
    await vi.advanceTimersByTimeAsync(2000);
    expect(describeSelection(await pending)).toEqual({ alg: "ES256", kid: "ec" });
  });

  it("should serve the expired JWKS when the refetch fails with a network error", async () => {
    const clock = createClock();
    const fetch = fetchSequence(
      () => jwksResponse(EC_JWK),
      () => {
        throw new TypeError("connect failed");
      },
    );
    const keys = createSet({ fetch, now: clock.now, cacheTtl: 600 });
    await keys.select(EC_HEADER);
    clock.set(600);
    expect(describeSelection(await keys.select(EC_HEADER))).toEqual({ alg: "ES256", kid: "ec" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
