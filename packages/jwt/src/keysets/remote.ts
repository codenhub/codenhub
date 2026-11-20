import { fail, ok } from "../core";
import { rejectUnknownOptions } from "../core/options";
import type { AsymmetricAlgorithm, JwtHeader, JwtIssue, JwtResult, KeySet, VerificationKey } from "../core/types";
import { parseJsonObject } from "../encoding";
import type { EncryptionKeySetOptions } from "../jwe/keyset";
import type { EncryptionKeySet } from "../jwe/types";
import { readKeyImporter } from "./local";
import { lacksKid, selectKey } from "./select";

/**
 * The `fetch` a remote key set calls: the JWKS URL, normalized, and a `GET` request init. The global `fetch`
 * of every runtime fits, as does a stub that takes just these two arguments.
 */
export type JwksFetch = (url: string, init: RequestInit) => Promise<Response>;

/** How {@link createRemoteKeySet} fetches and caches a JWKS. Durations are in seconds. */
export interface RemoteKeySetOptions {
  /**
   * Absolute `https:` URL of the JWKS, such as an issuer's `jwks_uri`. Plain `http:` is accepted only on a
   * loopback host (`localhost`, `127.0.0.0/8` or `[::1]`), for a development issuer on the same machine.
   * Credentials in the URL are refused.
   */
  readonly url: string | URL;
  /**
   * The `fetch` to call, for runtimes or tests that supply their own.
   *
   * @defaultValue `globalThis.fetch`, looked up at each fetch
   */
  readonly fetch?: JwksFetch;
  /**
   * Algorithms keys may be bound to, as for {@link ImportKeySetOptions.algorithms}. Non-empty.
   *
   * @defaultValue every asymmetric algorithm: `ES256`, `ES384`, `ES512`, `EdDSA`, `Ed25519`, `RS256`, `RS384`,
   * `RS512`, `PS256`, `PS384`, `PS512`
   */
  readonly algorithms?: readonly AsymmetricAlgorithm[];
  /**
   * The issuer whose JWKS this is, as for {@link ImportKeySetOptions.issuer}: each key is bound to it, so a
   * token verified with one must carry this `iss`.
   *
   * @defaultValue keys bound to no issuer
   */
  readonly issuer?: string;
  /**
   * Which keys to import, as for {@link ImportKeySetOptions.use}: `sig` for verification keys, or `enc` for a
   * recipient's encryption keys, as {@link RemoteEncryptionKeySetOptions} describes.
   *
   * @defaultValue `"sig"`
   */
  readonly use?: "sig";
  /**
   * Seconds a fetched JWKS is used before it is fetched again. An integer of at least 1. A response whose
   * `Cache-Control` has a shorter `max-age` is used for that long instead, but never for less than
   * `cooldown`; `no-store` or `no-cache` gives it `cooldown`.
   *
   * @defaultValue 600
   */
  readonly cacheTtl?: number;
  /**
   * Least seconds between the starts of two fetches that a failure or an unknown `kid` causes. An
   * integer from 0 through `cacheTtl`.
   *
   * @defaultValue 30, or `cacheTtl` when that is smaller
   */
  readonly cooldown?: number;
  /**
   * Seconds after `cacheTtl` runs out during which the last fetched JWKS is still used while fetching a
   * new one fails. An integer of at least 0; 0 never uses an expired JWKS.
   *
   * @defaultValue 3600
   */
  readonly maxStale?: number;
  /**
   * Seconds a fetch, body included, may take before it is abandoned. Greater than 0 and at most 60;
   * fractions are allowed.
   *
   * @defaultValue 5
   */
  readonly timeout?: number;
  /**
   * Largest response body accepted, in bytes. An integer from 1 through 1048576.
   *
   * @defaultValue 65536
   */
  readonly maxResponseBytes?: number;
  /**
   * Current time in milliseconds since the Unix epoch, for tests. It must return a finite number: any
   * other result is a bug in the clock, so `select` rejects with a `TypeError`.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
  /**
   * A JWKS fetched earlier, such as one a previous instance saved from {@link RemoteKeySetOptions.onFetch},
   * used as if this set had fetched it at `fetchedAt` and kept for `cacheTtl`. It is imported at the first
   * `select`. `null` means no seed, and a seed that is not a snapshot, was fetched from another `url`, or
   * holds no usable key is ignored: the set fetches as it would without one. A seed older than `cacheTtl`
   * plus `maxStale` is never used, and neither is one whose `fetchedAt` is more than a minute ahead of `now`.
   */
  readonly seed?: RemoteKeySetSnapshot | null;
  /**
   * Called after each successful fetch, with the JWKS as fetched and when, for a caller that saves it to
   * pass as `seed` later. A promise it returns is handed to `waitUntil`; its errors, thrown or rejected, are
   * ignored.
   */
  readonly onFetch?: (snapshot: RemoteKeySetSnapshot) => void;
  /**
   * Called after each failed fetch with its `key_fetch_failed` issue, whether or not a `select` waited for
   * the fetch and whether or not a newer fetch replaced it, for logging. A promise it returns is handed to `waitUntil`; its errors, thrown or rejected, are
   * ignored.
   */
  readonly onFetchError?: (issue: JwtIssue) => void;
  /**
   * Called with each fetch as it starts, to keep it running after the request that started it has
   * responded. On Cloudflare Workers, pass `waitUntil` from `cloudflare:workers`: without it, a fetch
   * started in the background, or by a request that ends first, is cancelled with that request, and the
   * cache is refreshed only when a later `select` has to wait for a fetch. Its errors, thrown or
   * rejected, are ignored.
   */
  readonly waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * How {@link createRemoteKeySet} fetches a recipient's JWKS of encryption keys, such as an OpenID client's
 * `jwks_uri` an OpenID Provider encrypts ID tokens to. Every option of {@link RemoteKeySetOptions} applies but
 * `issuer`; keys are imported as `importKeySet(jwks, { use: "enc" })` imports them, and `select` takes
 * `{ alg, kid }`.
 */
export interface RemoteEncryptionKeySetOptions
  extends Omit<RemoteKeySetOptions, "algorithms" | "issuer" | "use">, EncryptionKeySetOptions {}

/** A fetched JWKS, where from and when, as {@link RemoteKeySetOptions.onFetch} receives it. */
export interface RemoteKeySetSnapshot {
  /** The URL the JWKS was fetched from, as `URL.href` normalizes it; a seed from another URL is ignored. */
  readonly url: string;
  /** The JWKS document, a JSON value. */
  readonly jwks: unknown;
  /** When the fetch completed, in milliseconds since the Unix epoch, from `options.now`. */
  readonly fetchedAt: number;
}

/** Every documented option; typed so adding one to `RemoteKeySetOptions` fails to compile until listed. */
const KNOWN_OPTIONS: Readonly<Record<keyof RemoteKeySetOptions, true>> = {
  url: true,
  fetch: true,
  algorithms: true,
  issuer: true,
  use: true,
  cacheTtl: true,
  cooldown: true,
  maxStale: true,
  timeout: true,
  maxResponseBytes: true,
  now: true,
  seed: true,
  onFetch: true,
  onFetchError: true,
  waitUntil: true,
};

const MS_PER_SECOND = 1000;
const DEFAULT_CACHE_TTL = 600;
const DEFAULT_COOLDOWN = 30;
const DEFAULT_MAX_STALE = 3600;
const DEFAULT_TIMEOUT = 5;
const MAX_TIMEOUT = 60;
const DEFAULT_MAX_RESPONSE_BYTES = 65_536;
const MAX_RESPONSE_BYTES_LIMIT = 1_048_576;
const HTTP_OK = 200;
/** Time past `timeout` after which a fetch that never settled no longer holds back a new one. */
const ABANDONED_FETCH_GRACE_MS = 1000;
/** How far the clock may step back, or a seed's `fetchedAt` lie ahead, with the cache still counted as fresh. */
const CLOCK_STEP_BACK_TOLERANCE_MS = 60_000;

/** Why a fetch failed, as `params.reason` of a `key_fetch_failed` issue. */
type FetchFailureReason = "timeout" | "network" | "status" | "too_large" | "invalid_response" | "no_usable_keys";

interface RemoteConfig {
  readonly url: string;
  readonly fetch: JwksFetch | undefined;
  /** Imports a fetched JWKS, as verification keys or, with `use: "enc"`, as encryption keys. */
  readonly importKeys: (jwks: unknown) => Promise<JwtResult<readonly VerificationKey[]>>;
  readonly cacheTtlMs: number;
  readonly cooldownMs: number;
  readonly maxStaleMs: number;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly now: () => number;
  readonly seed: RemoteKeySetSnapshot | undefined;
  readonly onFetch: ((snapshot: RemoteKeySetSnapshot) => void) | undefined;
  readonly onFetchError: ((issue: JwtIssue) => void) | undefined;
  readonly waitUntil: ((promise: Promise<unknown>) => void) | undefined;
}

/** A JWKS document as fetched, and how long its response allows it to be used. */
interface FetchedJwks {
  readonly jwks: unknown;
  readonly ttlMs: number;
}

/** A JWKS that was fetched and imported. */
interface FetchedKeys extends FetchedJwks {
  readonly keys: readonly VerificationKey[];
}

/** The last JWKS fetched successfully. */
interface CachedKeys {
  readonly keys: readonly VerificationKey[];
  /** When the fetch that produced `keys` completed, from `now()`. */
  readonly fetchedAt: number;
  /** How long `keys` are fresh: `cacheTtl`, or less when the response's `Cache-Control` said so. */
  readonly ttlMs: number;
}

/** What a key set learned about its runtime's `fetch`, kept for the key set's life. */
interface FetchState {
  /** Whether to pass `cache: "no-cache"`; cleared when the runtime refused it. */
  sendsCacheMode: boolean;
}

/**
 * Builds a key set that fetches its keys from a JWKS URL, caches them, and refetches on expiry or on an
 * unknown `kid`.
 *
 * @remarks
 * Nothing is fetched until the first `select`. Then:
 *
 * - **TTL.** A fetched JWKS is used for `cacheTtl` seconds, or for the response's shorter
 *   `Cache-Control: max-age`, but at least `cooldown`. After that, for up to `maxStale` more
 *   seconds, a `select` still answers from it at once and starts a fetch in the background; past that, it
 *   waits for the fetch.
 * - **One fetch at a time.** A `select` that needs keys the cache cannot give while a fetch is running
 *   waits for that fetch, at most until a second past its `timeout`; concurrent callers never start a
 *   second one. A fetch that misses that deadline, or rejects because a Workers runtime cancelled it with
 *   the request that started it, is fetched again by the waiting `select`, unless the cooldown is running
 *   and the cache is still usable, which then answers. Such a fetch also stops
 *   holding back a new one once it is past the deadline and the cooldown. `waitUntil` keeps fetches
 *   running past their request.
 * - **Unknown `kid`.** When a token's `kid` is not in the cached JWKS, the JWKS is fetched again once,
 *   and the selection is repeated on the result, also when a key without a `kid` could stand in for it.
 *   A failing refetch gives `key_fetch_failed`, unless such a key stands in. A header without a `kid`
 *   never causes a refetch.
 * - **Cooldown.** A refetch for an unknown `kid`, or a retry after a failed fetch, starts only when
 *   `cooldown` seconds have passed since the last fetch started. Inside that window an unknown `kid`
 *   fails with `unknown_kid` at once, so a flood of tokens with invented `kid`s causes at most one
 *   fetch per window. `cooldown: 0` gives up that limit: each such `select` may start a fetch, though
 *   never while another is running.
 * - **Stale keys.** When fetching fails, or a retry waits for the cooldown, the expired JWKS is used
 *   until `maxStale` runs out; past that, `select` fails with `key_fetch_failed`. Using stale keys does
 *   not extend them: every `select` after the cooldown tries to fetch again.
 * - **Persisting.** `onFetch` hands out each fetched JWKS, and `seed` starts a new set from one, so a
 *   short-lived process need not fetch on its first `select`.
 *
 * Fetches are `GET` requests with `accept: application/json` and `cache: "no-cache"`, so an HTTP cache
 * revalidates rather than answers, that do not follow redirects; only status 200 is accepted. A runtime
 * that refuses `cache`, as Cloudflare Workers does before compatibility date 2025-08-07, is asked again
 * without it, for the rest of the key set's life. The body is capped at `maxResponseBytes`, and the whole
 * fetch at `timeout` seconds. The JWKS is imported as {@link importKeySet} does; a JWKS that is not one,
 * including one with more than 100 keys, is an `invalid_response`, and one without a key this set can
 * use is `no_usable_keys`.
 *
 * @example
 * ```ts
 * const keys = createRemoteKeySet({ url: "https://issuer.example/.well-known/jwks.json" });
 * const verify = createVerifier({ keys, issuer: "https://issuer.example" });
 * ```
 *
 * @param options - Where to fetch the JWKS from, and how to cache it.
 * @returns A frozen key set. Its `select` never rejects for a fetch problem or a token: a failed fetch gives `key_fetch_failed` with
 * `params.reason` of `timeout`, `network` (the fetch rejected), `status` (with `params.status`, also
 * for a redirect), `too_large` (`Content-Length` or body over `maxResponseBytes`), `invalid_response`
 * (not a strict JSON object, or not a JWKS) or `no_usable_keys` (a JWKS of which no key imports for
 * `algorithms`). A failed fetch leaves the cache as it was. Issues never contain anything from the response. `select`
 * rejects with a `TypeError` only when `options.now` returns something other than a finite number, which
 * is a bug in the caller's clock; a verifier that calls such a key set reports `key_fetch_failed` with
 * `{ reason: "key_set_error" }` instead.
 * @throws TypeError when `options` is not an object; `options` has a member that is not an option; `url` is not an absolute `https:` URL, or
 * `http:` URL on a loopback host, or carries credentials; `fetch`, `now`, `onFetch`, `onFetchError` or `waitUntil` is not a function; `algorithms` is not a non-empty array of asymmetric algorithms; `issuer` is not a non-empty string; or `cacheTtl`, `cooldown`, `maxStale`, `timeout` or
 * `maxResponseBytes` is out of range.
 */
export function createRemoteKeySet(options: RemoteEncryptionKeySetOptions): EncryptionKeySet;
export function createRemoteKeySet(options: RemoteKeySetOptions): KeySet;
export function createRemoteKeySet(
  options: RemoteKeySetOptions | RemoteEncryptionKeySetOptions,
): KeySet | EncryptionKeySet {
  const config = readRemoteOptions(options);
  let cached: CachedKeys | undefined;
  let lastFailure: JwtResult<never> | undefined;
  let lastFetchStartedAt: number | undefined;
  let inFlight: Promise<JwtResult<readonly VerificationKey[]>> | undefined;
  // Counts fetches started, so a fetch that settles after a newer one replaced it changes nothing.
  let generation = 0;
  let seeding: Promise<void> | undefined;
  const fetchState: FetchState = { sendsCacheMode: true };

  // A clock that steps back makes an elapsed time negative. That never keeps a cooldown running. A cache
  // fetched up to a minute "in the future", as after a small clock correction or from a seed saved on a host
  // whose clock runs ahead, counts as just fetched; further ahead it is expired, so the bounds of decision 5
  // hold within that minute.
  const isCoolingDown = (): boolean => {
    if (lastFetchStartedAt === undefined) {
      return false;
    }
    const elapsed = config.now() - lastFetchStartedAt;
    return elapsed >= 0 && elapsed < config.cooldownMs;
  };

  /**
   * Whether the cache is younger than its TTL plus `staleMs`: 0 asks whether it is fresh, `maxStale` whether
   * it is usable. A cache far newer than the clock says is neither.
   */
  const isCachedWithin = (staleMs: number): boolean => {
    if (cached === undefined) {
      return false;
    }
    const age = config.now() - cached.fetchedAt;
    return age >= -CLOCK_STEP_BACK_TOLERANCE_MS && Math.max(age, 0) < cached.ttlMs + staleMs;
  };

  const runFetch = async (started: number): Promise<JwtResult<readonly VerificationKey[]>> => {
    let outcome: JwtResult<FetchedKeys>;
    try {
      outcome = await fetchKeys(config, fetchState);
    } catch {
      // fetchKeys reports every expected failure; this keeps an unforeseen one from rejecting every caller.
      outcome = fetchFailure("network");
    }
    if (!outcome.ok) {
      // Reported even for a fetch a newer one replaced, so the hook sees every failure.
      notify(config.onFetchError, outcome.error.issues[0] as JwtIssue, config.waitUntil);
    }
    if (started !== generation) {
      return outcome.ok ? ok(outcome.value.keys) : outcome;
    }
    inFlight = undefined;
    if (!outcome.ok) {
      lastFailure = outcome;
      return outcome;
    }
    const fetchedAt = config.now();
    cached = { keys: outcome.value.keys, fetchedAt, ttlMs: outcome.value.ttlMs };
    lastFailure = undefined;
    notify(config.onFetch, { url: config.url, jwks: outcome.value.jwks, fetchedAt }, config.waitUntil);
    return ok(outcome.value.keys);
  };

  /** Whether a fetch is running and still within its deadline, so it may yet settle. */
  const hasLiveFetch = (): boolean => {
    if (inFlight === undefined || lastFetchStartedAt === undefined) {
      return false;
    }
    const elapsed = config.now() - lastFetchStartedAt;
    return elapsed >= 0 && elapsed < config.timeoutMs + ABANDONED_FETCH_GRACE_MS;
  };

  /**
   * Whether a fetch is running that a new one should wait for, rather than one presumed abandoned. A fetch
   * past its deadline still counts during the cooldown, so invented `kid`s cannot start fetches faster.
   */
  const isFetching = (): boolean => inFlight !== undefined && (hasLiveFetch() || isCoolingDown());

  /** Starts a fetch unless one is running, and returns the running one. */
  const refetch = (): Promise<JwtResult<readonly VerificationKey[]>> => {
    if (inFlight === undefined || !isFetching()) {
      lastFetchStartedAt = config.now();
      generation += 1;
      inFlight = runFetch(generation);
      notify(config.waitUntil, inFlight);
    }
    return inFlight;
  };

  /**
   * Waits for a new fetch, or joins the running one until its deadline. On Workers, a fetch whose request
   * ended never settles, or rejects when awaited from another request; either way this select fetches
   * again, once, from its own request.
   */
  const awaitFetch = async (): Promise<JwtResult<readonly VerificationKey[]>> => {
    if (inFlight === undefined || !isFetching()) {
      return refetch();
    }
    const running = inFlight;
    const remainingMs =
      (lastFetchStartedAt ?? config.now()) + config.timeoutMs + ABANDONED_FETCH_GRACE_MS - config.now();
    if (remainingMs > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const abandoned = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), remainingMs);
      });
      try {
        const settled = await Promise.race([running, abandoned]);
        if (settled !== undefined) {
          return settled;
        }
      } catch {
        // Only a fetch cancelled with its request rejects: runFetch itself never does.
      } finally {
        clearTimeout(timer);
      }
    }
    // Inside the cooldown, a usable cache answers rather than a fetch that invented kids could repeat.
    if (isCoolingDown() && isCachedWithin(config.maxStaleMs)) {
      return usableKeys();
    }
    if (inFlight === running) {
      inFlight = undefined;
    }
    try {
      return await refetch();
    } catch {
      return fetchFailure("network");
    }
  };

  /** Imports the seed once, unless a fetch has filled the cache first. A seed without a usable key is ignored. */
  const importSeed = async (seed: RemoteKeySetSnapshot): Promise<void> => {
    const imported = await config.importKeys(seed.jwks);
    if (imported.ok && imported.value.length > 0 && cached === undefined) {
      cached = { keys: imported.value, fetchedAt: seed.fetchedAt, ttlMs: config.cacheTtlMs };
    }
  };

  /** The keys to select from now, or why there are none. */
  const usableKeys = (): JwtResult<readonly VerificationKey[]> => {
    if (cached !== undefined && isCachedWithin(config.maxStaleMs)) {
      return ok(cached.keys);
    }
    return lastFailure ?? fetchFailure("network");
  };

  const select = async (header: JwtHeader): Promise<JwtResult<VerificationKey>> => {
    if (config.seed !== undefined) {
      seeding ??= importSeed(config.seed);
      await seeding;
    }
    let hasFetched = false;
    if (isFetching()) {
      // A cache that is still usable and holds the key needs no wait for the fetch that is running, and
      // neither does a missing kid while a fetch past its deadline holds the cooldown.
      if (cached !== undefined && isCachedWithin(config.maxStaleMs)) {
        const selected = selectKey(cached.keys, header);
        if (!lacksKid(cached.keys, header) || !hasLiveFetch()) {
          return selected;
        }
      }
      await awaitFetch();
      hasFetched = true;
    } else if (!isCachedWithin(0) && !isCoolingDown()) {
      if (isCachedWithin(config.maxStaleMs)) {
        // The expired keys answer now; the refetch replaces them for later selects.
        void ignoreRejection(refetch());
      } else {
        await awaitFetch();
        hasFetched = true;
      }
    }
    const keys = usableKeys();
    if (!keys.ok) {
      return keys;
    }
    const selected = selectKey(keys.value, header);
    if (!lacksKid(keys.value, header) || hasFetched || (isCoolingDown() && !hasLiveFetch())) {
      return selected;
    }
    const refetched = await awaitFetch();
    if (!refetched.ok) {
      // A key that stood in for the kid still answers when the refetch fails.
      return selected.ok ? selected : refetched;
    }
    return selectKey(refetched.value, header);
  };

  return Object.freeze({ select });
}

/** Fetches and imports the JWKS once. Never throws. */
async function fetchKeys(config: RemoteConfig, state: FetchState): Promise<JwtResult<FetchedKeys>> {
  const fetched = await fetchJson(config, state);
  if (!fetched.ok) {
    return fetched;
  }
  const imported = await config.importKeys(fetched.value.jwks);
  if (!imported.ok) {
    return fetchFailure("invalid_response");
  }
  // An empty or unusable JWKS would replace keys that work with none, so it fails as a fetch does.
  if (imported.value.length === 0) {
    return fetchFailure("no_usable_keys");
  }
  return ok({ ...fetched.value, keys: imported.value });
}

/**
 * Calls a caller's callback, whose failure must not change what `select` returns. A promise it returns, such
 * as one saving a snapshot, is handed to `waitUntil` so the work outlives the request.
 */
function notify<T>(
  callback: ((value: T) => void) | undefined,
  value: T,
  waitUntil?: (promise: Promise<unknown>) => void,
): void {
  if (callback === undefined) {
    return;
  }
  try {
    const result: unknown = callback(value);
    if (result instanceof Promise) {
      const settled = ignoreRejection(result);
      notify(waitUntil, settled);
    }
  } catch {
    // Deliberately ignored: the callback only observes the fetch.
  }
}

/** Thrown inside a fetch to end it with a given failure. */
class FetchRejection {
  readonly result: JwtResult<never>;

  constructor(result: JwtResult<never>) {
    this.result = result;
  }
}

/** Fetches the JWKS document and parses it as a strict JSON object, within the time limit. Never throws. */
async function fetchJson(config: RemoteConfig, state: FetchState): Promise<JwtResult<FetchedJwks>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new FetchRejection(fetchFailure("timeout")));
    }, config.timeoutMs);
  });
  const request = requestJson(config, state, controller.signal);
  // After a timeout the request may still reject; that outcome is no longer wanted.
  void ignoreRejection(request);
  try {
    return await Promise.race([request, timedOut]);
  } catch (error) {
    if (error instanceof FetchRejection) {
      return error.result;
    }
    return fetchFailure(controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(
  config: RemoteConfig,
  state: FetchState,
  signal: AbortSignal,
): Promise<JwtResult<FetchedJwks>> {
  const response = await send(config, state, signal);
  if (response.status !== HTTP_OK) {
    discardBody(response);
    return fetchFailure("status", { status: response.status });
  }
  const declaredLength = Number(response.headers.get("content-length") ?? Number.NaN);
  if (declaredLength > config.maxResponseBytes) {
    discardBody(response);
    return fetchFailure("too_large");
  }
  const body = await readCappedBody(response, config.maxResponseBytes, signal);
  if (body === undefined) {
    return fetchFailure("too_large");
  }
  const parsed = parseJsonObject(withoutBom(body));
  if (!parsed.ok) {
    return fetchFailure("invalid_response");
  }
  return ok({ jwks: parsed.value, ttlMs: freshnessMs(response.headers.get("cache-control"), config) });
}

/**
 * Calls `fetch` with `cache: "no-cache"`, so that a browser's HTTP cache, which honours the issuer's
 * `Cache-Control`, revalidates instead of answering a refetch with the JWKS it holds. A `Cache-Control`
 * request header would do the same, but makes a cross-origin request need a CORS preflight. Workers before
 * compatibility date 2025-08-07 reject the `cache` member, with a `TypeError` or, before 2024-11-11, an
 * `Error`. A network failure rejects with a `TypeError` too, so only a rejection whose message names
 * `cache` is retried, once and without it, and `cache` is then left out for the key set's life. Any other
 * failure is not retried, so a failing issuer still costs one request per fetch.
 */
async function send(config: RemoteConfig, state: FetchState, signal: AbortSignal): Promise<Response> {
  // Called through a local so that a host `fetch`, such as a browser's, never runs with another `this`.
  const fetchFunction = config.fetch ?? globalThis.fetch;
  const init: RequestInit = { method: "GET", headers: { accept: "application/json" }, redirect: "manual", signal };
  if (!state.sendsCacheMode) {
    return fetchFunction(config.url, init);
  }
  try {
    return await fetchFunction(config.url, { ...init, cache: "no-cache" });
  } catch (error) {
    if (signal.aborted || !namesCacheMode(error)) {
      throw error;
    }
  }
  state.sendsCacheMode = false;
  return fetchFunction(config.url, init);
}

/** Whether a rejection is a runtime refusing the `cache` member, which names it in its message. */
function namesCacheMode(error: unknown): boolean {
  try {
    return error instanceof Error && /\bcache\b/i.test(error.message);
  } catch {
    return false;
  }
}

const BOM = [0xef, 0xbb, 0xbf] as const;

/** The body without one leading UTF-8 byte order mark, which some servers write before a JWKS. */
function withoutBom(body: Uint8Array): Uint8Array {
  return body[0] === BOM[0] && body[1] === BOM[1] && body[2] === BOM[2] ? body.subarray(BOM.length) : body;
}

/**
 * How long a fetched JWKS stays fresh: `cacheTtl`, shortened by the response's `max-age`, but never below
 * `cooldown`, which also applies to `no-store` and `no-cache`. A missing or malformed `max-age` leaves
 * `cacheTtl`; `s-maxage` is for shared caches and is ignored.
 */
function freshnessMs(cacheControl: string | null, config: RemoteConfig): number {
  const maxAge = cacheControl === null ? undefined : readMaxAge(cacheControl);
  if (maxAge === undefined) {
    return config.cacheTtlMs;
  }
  return Math.min(Math.max(maxAge * MS_PER_SECOND, config.cooldownMs), config.cacheTtlMs);
}

/**
 * The `max-age` of a `Cache-Control` value in seconds, 0 for `no-store` or `no-cache`, or `undefined`
 * without a well-formed one. A repeated `max-age` takes its first well-formed value, as RFC 9111 section
 * 4.2.1 allows.
 */
function readMaxAge(cacheControl: string): number | undefined {
  let maxAge: number | undefined;
  for (const directive of cacheControl.split(",")) {
    const separator = directive.indexOf("=");
    const name = (separator === -1 ? directive : directive.slice(0, separator)).trim().toLowerCase();
    if (name === "no-store" || name === "no-cache") {
      return 0;
    }
    if (name === "max-age" && separator !== -1 && maxAge === undefined) {
      const value = directive.slice(separator + 1).trim();
      maxAge = /^\d+$/.test(value) ? Number(value) : undefined;
    }
  }
  return maxAge;
}

/**
 * Reads the body, stopping as soon as it grows past `maxBytes`, in which case it returns `undefined`. An abort
 * cancels the reader, so a body still streaming after the timeout is released even from a `fetch` that
 * ignores the signal.
 */
async function readCappedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> {
  if (response.body === null) {
    const whole = new Uint8Array(await response.arrayBuffer());
    return whole.byteLength > maxBytes ? undefined : whole;
  }
  const reader = response.body.getReader();
  const cancelOnAbort = (): void => {
    void ignoreRejection(reader.cancel());
  };
  if (signal.aborted) {
    cancelOnAbort();
  }
  signal.addEventListener("abort", cancelOnAbort, { once: true });
  try {
    return await readChunks(reader, maxBytes);
  } finally {
    signal.removeEventListener("abort", cancelOnAbort);
  }
}

async function readChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array | undefined> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    // Chunks arrive in order, one at a time; there is nothing to run in parallel.
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > maxBytes) {
      void ignoreRejection(reader.cancel());
      return undefined;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Releases a body that will not be read, so the connection can be reused. */
function discardBody(response: Response): void {
  try {
    if (response.body !== null) {
      void ignoreRejection(response.body.cancel());
    }
  } catch {
    // A body that cannot be cancelled, such as a locked one, is left to the garbage collector.
  }
}

/** Waits for a promise whose outcome no longer matters, so its rejection is not reported as unhandled. */
async function ignoreRejection(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // Deliberately ignored: the fetch already has its outcome.
  }
}

function fetchFailure(reason: FetchFailureReason, extra?: { readonly status: number }): JwtResult<never> {
  const issue: JwtIssue = { code: "key_fetch_failed", params: { reason, ...extra } };
  return fail(issue);
}

/** Checks every option once, so a misconfiguration throws when the key set is created. */
function readRemoteOptions(options: unknown): RemoteConfig {
  if (typeof options !== "object" || options === null) {
    throw new TypeError("createRemoteKeySet: options must be an object.");
  }
  rejectUnknownOptions(options, KNOWN_OPTIONS, "createRemoteKeySet");
  const source = options as Record<string, unknown>;
  const cacheTtl = readInteger(source, { name: "cacheTtl", fallback: DEFAULT_CACHE_TTL, minimum: 1 });
  const cooldown = readInteger(source, {
    name: "cooldown",
    fallback: Math.min(DEFAULT_COOLDOWN, cacheTtl),
    minimum: 0,
    maximum: cacheTtl,
  });
  const url = readUrl(source.url);
  return {
    url,
    fetch: readFunction(source, "fetch") as JwksFetch | undefined,
    importKeys: readKeyImporter(options, "createRemoteKeySet"),
    cacheTtlMs: cacheTtl * MS_PER_SECOND,
    cooldownMs: cooldown * MS_PER_SECOND,
    maxStaleMs: readInteger(source, { name: "maxStale", fallback: DEFAULT_MAX_STALE, minimum: 0 }) * MS_PER_SECOND,
    timeoutMs: readTimeout(source.timeout) * MS_PER_SECOND,
    maxResponseBytes: readInteger(source, {
      name: "maxResponseBytes",
      fallback: DEFAULT_MAX_RESPONSE_BYTES,
      minimum: 1,
      maximum: MAX_RESPONSE_BYTES_LIMIT,
    }),
    now: checkedClock((readFunction(source, "now") as (() => number) | undefined) ?? Date.now),
    seed: readSeed(source.seed, url),
    onFetch: readFunction(source, "onFetch") as RemoteConfig["onFetch"],
    onFetchError: readFunction(source, "onFetchError") as RemoteConfig["onFetchError"],
    waitUntil: readFunction(source, "waitUntil") as RemoteConfig["waitUntil"],
  };
}

/**
 * The seed, or `undefined` for none and for one that is not a snapshot of this URL: a seed comes from
 * storage, which may hold what another key set or an older build wrote, so it is ignored rather than thrown
 * (decision 38). Its `jwks` is checked when imported.
 */
function readSeed(value: unknown, url: string): RemoteKeySetSnapshot | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    const fetchedAt: unknown = Reflect.get(value, "fetchedAt");
    const seedUrl: unknown = Reflect.get(value, "url");
    if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt) || typeof seedUrl !== "string") {
      return undefined;
    }
    return new URL(seedUrl).href === url ? { url, jwks: Reflect.get(value, "jwks"), fetchedAt } : undefined;
  } catch {
    // A URL that does not parse, or a getter that throws, is not a snapshot either.
    return undefined;
  }
}

/**
 * Wraps the clock so a result that is not a finite number throws instead of being used: NaN would make
 * every cooldown and expiry comparison false, so the cache would never expire. The clock is caller code,
 * so the rejection propagates from `select` (decisions 10 and 23).
 */
function checkedClock(now: () => number): () => number {
  return () => {
    const time: unknown = now();
    if (typeof time !== "number" || !Number.isFinite(time)) {
      throw new TypeError("createRemoteKeySet: options.now must return a finite number of milliseconds.");
    }
    return time;
  };
}

/**
 * Hosts whose traffic never leaves the machine, where a development issuer may serve plain `http:`: the
 * name `localhost`, `127.0.0.0/8` and `[::1]`, as the WHATWG URL parser normalizes them (decision 29).
 */
const isLoopbackHost = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

function readUrl(value: unknown): string {
  const message =
    "createRemoteKeySet: options.url must be an absolute https: URL without credentials, or http: on a loopback host.";
  if (typeof value !== "string" && !(value instanceof URL)) {
    throw new TypeError(message);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(message);
  }
  const secure = url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHost(url.hostname));
  if (!secure || url.username !== "" || url.password !== "") {
    throw new TypeError(message);
  }
  return url.href;
}

function readFunction(source: Record<string, unknown>, name: string): unknown {
  const value = source[name];
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`createRemoteKeySet: options.${name} must be a function.`);
  }
  return value;
}

interface IntegerOption {
  readonly name: string;
  readonly fallback: number;
  readonly minimum: number;
  readonly maximum?: number;
}

function readInteger(source: Record<string, unknown>, option: IntegerOption): number {
  const given = source[option.name];
  const value = given === undefined ? option.fallback : given;
  const maximum = option.maximum ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(value) || (value as number) < option.minimum || (value as number) > maximum) {
    const range = option.maximum === undefined ? `at least ${option.minimum}` : `${option.minimum} through ${maximum}`;
    throw new TypeError(`createRemoteKeySet: options.${option.name} must be an integer ${range}.`);
  }
  return value as number;
}

function readTimeout(value: unknown): number {
  const timeout = value === undefined ? DEFAULT_TIMEOUT : value;
  if (typeof timeout !== "number" || !(timeout > 0) || timeout > MAX_TIMEOUT) {
    throw new TypeError(
      `createRemoteKeySet: options.timeout must be a number greater than 0 and at most ${MAX_TIMEOUT}.`,
    );
  }
  return timeout;
}
