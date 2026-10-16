import { fail, ok } from "../core";
import type { AsymmetricAlgorithm, JwtHeader, JwtIssue, JwtResult, KeySet, VerificationKey } from "../core/types";
import { parseJsonObject } from "../encoding";
import { importKeys, readAlgorithms } from "./local";
import { isUnknownKid, selectKey } from "./select";

/** How {@link createRemoteKeySet} fetches and caches a JWKS. Durations are in seconds. */
export interface RemoteKeySetOptions {
  /** Absolute `https:` URL of the JWKS, such as an issuer's `jwks_uri`. Credentials in the URL are refused. */
  readonly url: string | URL;
  /**
   * The `fetch` to call, for runtimes or tests that supply their own.
   *
   * @defaultValue `globalThis.fetch`, looked up at each fetch
   */
  readonly fetch?: typeof fetch;
  /**
   * Algorithms keys may be bound to, as for {@link ImportKeySetOptions.algorithms}. Non-empty.
   *
   * @defaultValue every asymmetric algorithm: `ES256`, `EdDSA`, `Ed25519`, `RS256`, `PS256`
   */
  readonly algorithms?: readonly AsymmetricAlgorithm[];
  /**
   * Seconds a fetched JWKS is used before it is fetched again. An integer of at least 1.
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
   * Current time in milliseconds since the Unix epoch, for tests.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
}

const MS_PER_SECOND = 1000;
const DEFAULT_CACHE_TTL = 600;
const DEFAULT_COOLDOWN = 30;
const DEFAULT_MAX_STALE = 3600;
const DEFAULT_TIMEOUT = 5;
const MAX_TIMEOUT = 60;
const DEFAULT_MAX_RESPONSE_BYTES = 65_536;
const MAX_RESPONSE_BYTES_LIMIT = 1_048_576;
const HTTP_OK = 200;

/** Why a fetch failed, as `params.reason` of a `key_fetch_failed` issue. */
type FetchFailureReason = "timeout" | "network" | "status" | "too_large" | "invalid_response";

interface RemoteConfig {
  readonly url: string;
  readonly fetch: typeof fetch | undefined;
  readonly algorithms: ReadonlySet<AsymmetricAlgorithm>;
  readonly cacheTtlMs: number;
  readonly cooldownMs: number;
  readonly maxStaleMs: number;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly now: () => number;
}

/** The last JWKS fetched successfully. */
interface CachedKeys {
  readonly keys: readonly VerificationKey[];
  readonly expiresAt: number;
}

/**
 * Builds a key set that fetches its keys from a JWKS URL, caches them, and refetches on expiry or on an
 * unknown `kid`.
 *
 * @remarks
 * Nothing is fetched until the first `select`. Then:
 *
 * - **TTL.** A fetched JWKS is used for `cacheTtl` seconds, then the next `select` fetches it again.
 * - **One fetch at a time.** Every `select` that needs keys while a fetch is running waits for that
 *   fetch, unless the cache is fresh and holds the key; concurrent callers never start a second one.
 * - **Unknown `kid`.** When a token's `kid` is not in the cached JWKS, the JWKS is fetched again once,
 *   and the selection is repeated on the result. A failing refetch gives `key_fetch_failed`. A header
 *   without a `kid` never causes a refetch.
 * - **Cooldown.** A refetch for an unknown `kid`, or a retry after a failed fetch, starts only when
 *   `cooldown` seconds have passed since the last fetch started. Inside that window an unknown `kid`
 *   fails with `unknown_kid` at once, so a flood of tokens with invented `kid`s causes at most one
 *   fetch per window.
 * - **Stale keys.** When fetching fails, or a retry waits for the cooldown, after `cacheTtl` ran out,
 *   the last fetched JWKS is still used for up to `maxStale` more seconds; past that, `select` fails
 *   with `key_fetch_failed`. Using stale keys does not extend them: every `select` after the cooldown
 *   tries to fetch again.
 *
 * Fetches are `GET` requests with `accept: application/json` that do not follow redirects; only status
 * 200 is accepted. The body is capped at `maxResponseBytes`, and the whole fetch at `timeout` seconds.
 * The JWKS is imported as {@link importKeySet} does; a JWKS that is not one, including one with more
 * than 100 keys, is an `invalid_response`.
 *
 * @example
 * ```ts
 * const keys = createRemoteKeySet({ url: "https://issuer.example/.well-known/jwks.json" });
 * const verify = createVerifier({ keys, issuer: "https://issuer.example" });
 * ```
 *
 * @param options - Where to fetch the JWKS from, and how to cache it.
 * @returns A frozen key set. Its `select` never throws: a failed fetch gives `key_fetch_failed` with
 * `params.reason` of `timeout`, `network` (the fetch rejected), `status` (with `params.status`, also
 * for a redirect), `too_large` (`Content-Length` or body over `maxResponseBytes`) or `invalid_response`
 * (not a strict JSON object, or not a JWKS). Issues never contain anything from the response.
 * @throws TypeError when `options` is not an object; `url` is not an absolute `https:` URL or carries
 * credentials; `fetch` or `now` is not a function; `algorithms` is not a non-empty array of asymmetric
 * algorithms; or `cacheTtl`, `cooldown`, `maxStale`, `timeout` or `maxResponseBytes` is out of range.
 */
export function createRemoteKeySet(options: RemoteKeySetOptions): KeySet {
  const config = readRemoteOptions(options);
  let cached: CachedKeys | undefined;
  let lastFailure: JwtResult<never> | undefined;
  let lastFetchStartedAt: number | undefined;
  let inFlight: Promise<JwtResult<readonly VerificationKey[]>> | undefined;

  const isCoolingDown = (): boolean =>
    lastFetchStartedAt !== undefined && config.now() - lastFetchStartedAt < config.cooldownMs;

  const runFetch = async (): Promise<JwtResult<readonly VerificationKey[]>> => {
    let outcome: JwtResult<readonly VerificationKey[]>;
    try {
      outcome = await fetchKeys(config);
    } catch {
      // fetchKeys reports every expected failure; this keeps an unforeseen one from rejecting every caller.
      outcome = fetchFailure("network");
    }
    inFlight = undefined;
    if (outcome.ok) {
      cached = { keys: outcome.value, expiresAt: config.now() + config.cacheTtlMs };
      lastFailure = undefined;
    } else {
      lastFailure = outcome;
    }
    return outcome;
  };

  /** Starts a fetch unless one is running, and returns the running one. */
  const refetch = (): Promise<JwtResult<readonly VerificationKey[]>> => {
    if (inFlight === undefined) {
      lastFetchStartedAt = config.now();
      inFlight = runFetch();
    }
    return inFlight;
  };

  /** The keys to select from now, or why there are none. */
  const usableKeys = (): JwtResult<readonly VerificationKey[]> => {
    if (cached !== undefined && config.now() < cached.expiresAt + config.maxStaleMs) {
      return ok(cached.keys);
    }
    return lastFailure ?? fetchFailure("network");
  };

  const select = async (header: JwtHeader): Promise<JwtResult<VerificationKey>> => {
    let hasFetched = false;
    if (inFlight !== undefined) {
      // A fresh cache that holds the key needs no wait for the fetch that is running.
      if (cached !== undefined && config.now() < cached.expiresAt) {
        const selected = selectKey(cached.keys, header);
        if (!isUnknownKid(selected)) {
          return selected;
        }
      }
      await inFlight;
      hasFetched = true;
    } else if (cached === undefined || config.now() >= cached.expiresAt) {
      if (!isCoolingDown()) {
        await refetch();
        hasFetched = true;
      }
    }
    const keys = usableKeys();
    if (!keys.ok) {
      return keys;
    }
    const selected = selectKey(keys.value, header);
    if (!isUnknownKid(selected) || hasFetched || isCoolingDown()) {
      return selected;
    }
    const refetched = await refetch();
    return refetched.ok ? selectKey(refetched.value, header) : refetched;
  };

  return Object.freeze({ select });
}

/** Fetches and imports the JWKS once. Never throws. */
async function fetchKeys(config: RemoteConfig): Promise<JwtResult<readonly VerificationKey[]>> {
  const fetched = await fetchJson(config);
  if (!fetched.ok) {
    return fetched;
  }
  const imported = await importKeys(fetched.value, config.algorithms);
  return imported.ok ? imported : fetchFailure("invalid_response");
}

/** Thrown inside a fetch to end it with a given failure. */
class FetchRejection {
  readonly result: JwtResult<never>;

  constructor(result: JwtResult<never>) {
    this.result = result;
  }
}

/** Fetches the JWKS document and parses it as a strict JSON object, within the time limit. Never throws. */
async function fetchJson(config: RemoteConfig): Promise<JwtResult<unknown>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new FetchRejection(fetchFailure("timeout")));
    }, config.timeoutMs);
  });
  const request = requestJson(config, controller.signal);
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

async function requestJson(config: RemoteConfig, signal: AbortSignal): Promise<JwtResult<unknown>> {
  // Called through a local so that a host `fetch`, such as a browser's, never runs with another `this`.
  const fetchFunction = config.fetch ?? globalThis.fetch;
  const response = await fetchFunction(config.url, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "manual",
    signal,
  });
  if (response.status !== HTTP_OK) {
    discardBody(response);
    return fetchFailure("status", { status: response.status });
  }
  const declaredLength = Number(response.headers.get("content-length") ?? Number.NaN);
  if (declaredLength > config.maxResponseBytes) {
    discardBody(response);
    return fetchFailure("too_large");
  }
  const body = await readCappedBody(response, config.maxResponseBytes);
  if (body === undefined) {
    return fetchFailure("too_large");
  }
  const parsed = parseJsonObject(body);
  return parsed.ok ? parsed : fetchFailure("invalid_response");
}

/** Reads the body, stopping as soon as it grows past `maxBytes`, in which case it returns `undefined`. */
async function readCappedBody(response: Response, maxBytes: number): Promise<Uint8Array | undefined> {
  if (response.body === null) {
    const whole = new Uint8Array(await response.arrayBuffer());
    return whole.byteLength > maxBytes ? undefined : whole;
  }
  const reader = response.body.getReader();
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
  const source = options as Record<string, unknown>;
  const cacheTtl = readInteger(source, { name: "cacheTtl", fallback: DEFAULT_CACHE_TTL, minimum: 1 });
  const cooldown = readInteger(source, {
    name: "cooldown",
    fallback: Math.min(DEFAULT_COOLDOWN, cacheTtl),
    minimum: 0,
    maximum: cacheTtl,
  });
  return {
    url: readUrl(source.url),
    fetch: readFunction(source, "fetch") as typeof fetch | undefined,
    algorithms: readAlgorithms(options, "createRemoteKeySet"),
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
    now: (readFunction(source, "now") as (() => number) | undefined) ?? Date.now,
  };
}

function readUrl(value: unknown): string {
  const message = "createRemoteKeySet: options.url must be an absolute https: URL without credentials.";
  if (typeof value !== "string" && !(value instanceof URL)) {
    throw new TypeError(message);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(message);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
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
