import { deepFreeze } from "../core";
import { MAX_DURATION_SECONDS, MAX_NUMERIC_DATE } from "../core/limits";
import { rejectUnknownOptions } from "../core/options";
import type { JwtHeader, JwtResult, KeySet, PrivateKey, PublicJwk, PublicKey, VerificationKey } from "../core/types";
import { bindIssuer, exportPublicJwk, getKeyEntry, getPublicKey, readIssuer } from "../keys";
import { MAX_JWKS_KEYS } from "./local";
import { selectKey } from "./select";

/** One signing key of a {@link KeyRing} and when it signs. Times are seconds since the Unix epoch. */
export interface KeyRingEntry {
  /**
   * A private key from `generateKeyPair`, `importPrivateKey` or `importKeyPair`,
   * with a `kid` no other key of the ring has.
   */
  readonly key: PrivateKey;
  /**
   * When the key starts signing, as a whole number of seconds since the Unix epoch, like `exp`. It signs from
   * then until the next key's `activeFrom` or its own `retiredAt`, whichever comes first. No two keys of a
   * ring share it.
   */
  readonly activeFrom: number;
  /**
   * When the key stops signing even if no later key has taken over, such as when it must leave service
   * early. Later than `activeFrom`.
   *
   * @defaultValue none: the key signs until the next key's `activeFrom`
   */
  readonly retiredAt?: number;
}

/** How {@link createKeyRing} schedules an issuer's signing keys. */
export interface KeyRingOptions {
  /** The keys, in any order. Between 1 and 100. */
  readonly keys: readonly KeyRingEntry[];
  /**
   * Seconds before its `activeFrom` that a key is published. At least as long as verifiers may keep an older
   * copy of your JWKS: your JWKS response's `max-age` plus the `maxStale` of the remote key sets reading it,
   * with a margin for the time a response takes to reach them.
   * A whole number from 0 to 315360000.
   */
  readonly publishAhead: number;
  /**
   * Seconds a key stays published after it stops signing. At least your longest token lifetime plus the
   * clock tolerance of your verifiers and how far their clocks may lag yours, so every token it signed expires
   * before it leaves. A whole number from
   * 0 to 315360000.
   */
  readonly publishAfter: number;
  /**
   * The issuer whose keys these are, as for `createKeySet`: each key the ring selects is bound to it, so a
   * token it verifies must carry this `iss`.
   *
   * @defaultValue keys bound to no issuer
   */
  readonly issuer?: string;
  /**
   * The current time in milliseconds, as `Date.now` returns it. Read at every call of a ring's methods.
   *
   * @defaultValue `Date.now`
   */
  readonly now?: () => number;
}

/** A JWKS of public keys, as {@link KeyRing.jwks} returns it. */
export interface PublicJwks {
  /** The public JWKs. */
  readonly keys: readonly PublicJwk[];
}

/**
 * An issuer's signing keys over time: which one signs now, which ones to publish, and a key set that
 * verifies the issuer's own tokens. Frozen. It holds no state of its own; each method reads the clock.
 */
export interface KeyRing extends KeySet {
  /**
   * The key to sign with now: of the keys whose `activeFrom` has come, the one with the latest, unless its
   * `retiredAt` has come too. A ring never falls back to a key a later one replaced. Call it for each token,
   * just before `sign`: a key kept past its signing window signs tokens that can outlive its place in the JWKS.
   *
   * @throws TypeError when no key signs now: every `activeFrom` is still to come, or the newest active key is
   * retired; or when `now` returns something other than a finite number.
   */
  signingKey(): PrivateKey;
  /**
   * The JWKS to serve at your `jwks_uri`: the public half of every key published now, from `publishAhead`
   * seconds before its `activeFrom` until `publishAfter` seconds after it stops signing, in `activeFrom` order.
   *
   * @returns A frozen JWKS, possibly with no key.
   * @throws TypeError, as a rejected promise, when `now` returns something other than a finite number.
   */
  jwks(): Promise<PublicJwks>;
  /**
   * Selects from the keys {@link KeyRing.jwks} publishes now, as {@link KeySet.select} describes, so a
   * verifier given the ring as its `keys` accepts exactly the keys verifiers reading your JWKS do.
   *
   * @throws TypeError, as a rejected promise, when `now` returns something other than a finite number.
   */
  select(header: JwtHeader): Promise<JwtResult<VerificationKey>>;
}

const KNOWN_OPTIONS: Readonly<Record<keyof KeyRingOptions, true>> = {
  keys: true,
  publishAhead: true,
  publishAfter: true,
  issuer: true,
  now: true,
};

const ENTRY_MEMBERS: Readonly<Record<keyof KeyRingEntry, true>> = { key: true, activeFrom: true, retiredAt: true };

const MS_PER_SECOND = 1000;

/** A ring key, checked, with the times it is in use and is published. Times are seconds. */
interface Scheduled<TPrivate, TPublic> {
  readonly key: TPrivate;
  readonly publicKey: TPublic;
  readonly activeFrom: number;
  readonly retiredAt: number;
  readonly publishedFrom: number;
  readonly publishedUntil: number;
}

/** What a ring is built over: the caller's name, and how a key is read and its public half made. */
interface RingKind<TPrivate, TPublic> {
  readonly name: string;
  /** Checks an entry's `key`, throwing a TypeError naming `path`. */
  readonly readKey: (value: unknown, path: string) => TPrivate & { readonly kid?: string };
  readonly publicHalf: (key: TPrivate) => TPublic;
  /** Whether keys are published ahead of their `activeFrom`, and so `publishAhead` is an option. */
  readonly publishesAhead: boolean;
}

/** The schedule a ring reads its keys from. */
interface Schedule<TPrivate, TPublic> {
  /** The newest key whose `activeFrom` has come, or why none is current: no key is active yet, or it is retired. */
  readonly current: () => Scheduled<TPrivate, TPublic> | "none" | "retired";
  /** The keys from `publishAhead` seconds before their `activeFrom` until their `publishAfter` ends, in order. */
  readonly published: () => readonly Scheduled<TPrivate, TPublic>[];
}

/**
 * Builds a key ring from an issuer's signing keys and when each one signs, for rotating keys without a
 * window in which a verifier lacks the key a token names.
 *
 * @remarks
 * A key signs from its `activeFrom` until the next key's `activeFrom` or its own `retiredAt`. It is
 * published `publishAhead` seconds before it starts signing, so verifiers holding a cached JWKS already have
 * it, and `publishAfter` seconds after it stops, so tokens it signed still verify until they expire. The ring
 * stores nothing: keep the keys and their times in your own storage and build the ring from them, at startup
 * or per request. [Key rotation](https://github.com/codenhub/codenhub/blob/main/packages/jwt/docs/rotation.md)
 * gives the steps.
 *
 * @example
 * ```ts
 * const ring = createKeyRing({
 *   keys: [
 *     { key: currentKey, activeFrom: 1_798_761_600 },
 *     { key: nextKey, activeFrom: 1_801_440_000 },
 *   ],
 *   publishAhead: 86_400,
 *   publishAfter: 172_800,
 * });
 * const token = await sign({ payload, key: ring.signingKey(), issuedAt: true, expiresIn: 3600 });
 * const verify = createVerifier({ keys: ring, issuer: "https://issuer.example" });
 * ```
 *
 * @param options - The keys and their times, how long ahead and after a key is published, the issuer they
 * belong to, and the clock.
 * @returns The frozen ring.
 * @throws TypeError when `options` is not an object or has a member that is not an option; `keys` is not an
 * array of 1 to 100 entries; an entry is not an object, has a member other than `key`, `activeFrom` and
 * `retiredAt`, holds a `key` that is not a private key created by this package or has no `kid`, or has an
 * `activeFrom` or `retiredAt` that is not a whole number of seconds from 0 to 253402300799, as a time in
 * milliseconds is not; a `retiredAt` is not later than its `activeFrom`; two keys share a `kid` or an
 * `activeFrom`; `publishAhead` or `publishAfter` is not a whole number from 0 to 315360000; `now` is not a
 * function; or `issuer` is not a non-empty string.
 */
export function createKeyRing(options: KeyRingOptions): KeyRing {
  const issuer = readIssuer(readRingOptions(options, KNOWN_OPTIONS, "createKeyRing"), "createKeyRing");
  const schedule = readRing(options, {
    name: "createKeyRing",
    readKey: readSigningKey,
    publicHalf: (key: PrivateKey): PublicKey =>
      issuer === undefined ? getPublicKey(key) : bindIssuer(getPublicKey(key), issuer, "createKeyRing"),
    publishesAhead: true,
  });
  const exported = exportOnce(exportPublicJwk);

  return Object.freeze({
    signingKey: (): PrivateKey => currentOf(schedule, "createKeyRing", "signing").key,
    jwks: async (): Promise<PublicJwks> =>
      deepFreeze({ keys: await Promise.all(schedule.published().map(async (entry) => exported(entry))) }),
    select: async (header: JwtHeader): Promise<JwtResult<VerificationKey>> =>
      selectKey(
        schedule.published().map((entry) => entry.publicKey),
        header,
      ),
  });
}

/** Checks that `options` is an object of known members, and returns it. */
function readRingOptions(options: unknown, known: Readonly<Record<string, true>>, name: string): object {
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${name}: options must be an object.`);
  }
  rejectUnknownOptions(options, known, name);
  return options;
}

/** Reads a ring's options, checked by `readRingOptions` first, into its schedule. */
function readRing<TPrivate, TPublic>(options: object, kind: RingKind<TPrivate, TPublic>): Schedule<TPrivate, TPublic> {
  const { name } = kind;
  const source = options as Record<string, unknown>;
  const publishAhead = kind.publishesAhead ? readDuration(source, "publishAhead", name) : 0;
  const publishAfter = readDuration(source, "publishAfter", name);
  const now = source.now === undefined ? Date.now : source.now;
  if (typeof now !== "function") {
    throw new TypeError(`${name}: options.now must be a function.`);
  }
  const schedule = readSchedule(source.keys, kind, { publishAhead, publishAfter });

  const currentSeconds = (): number => {
    const time: unknown = (now as () => unknown)();
    if (typeof time !== "number" || !Number.isFinite(time)) {
      throw new TypeError(`${name}: options.now must return a finite number of milliseconds.`);
    }
    return Math.floor(time / MS_PER_SECOND);
  };
  return {
    current: () => {
      const seconds = currentSeconds();
      const newest = schedule.findLast((entry) => entry.activeFrom <= seconds);
      if (newest === undefined) {
        return "none";
      }
      return newest.retiredAt <= seconds ? "retired" : newest;
    },
    published: () => {
      const seconds = currentSeconds();
      return schedule.filter((entry) => entry.publishedFrom <= seconds && seconds < entry.publishedUntil);
    },
  };
}

/** The current key of a ring, for `signingKey()`, which throws when there is none. */
function currentOf<TPrivate, TPublic>(
  schedule: Schedule<TPrivate, TPublic>,
  name: string,
  verb: string,
): Scheduled<TPrivate, TPublic> {
  const current = schedule.current();
  if (current === "none") {
    throw new TypeError(`${name}: no key is active for ${verb} now; every key's activeFrom is later.`);
  }
  if (current === "retired") {
    throw new TypeError(`${name}: no key is active for ${verb} now; the newest active key is retired.`);
  }
  return current;
}

/** Exports each scheduled key's public half once, however often the JWKS is asked for. */
function exportOnce<TPublic, TJwk>(
  exportJwk: (key: TPublic) => Promise<TJwk>,
): (entry: Scheduled<unknown, TPublic>) => Promise<TJwk> {
  const jwks = new WeakMap<Scheduled<unknown, TPublic>, Promise<TJwk>>();
  return (entry) => {
    let jwk = jwks.get(entry);
    if (jwk === undefined) {
      jwk = exportJwk(entry.publicKey);
      jwks.set(entry, jwk);
    }
    return jwk;
  };
}

/** Reads `publishAhead` or `publishAfter`, which have no default. */
function readDuration(source: Record<string, unknown>, name: string, caller: string): number {
  const value = source[name];
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_DURATION_SECONDS) {
    throw new TypeError(
      `${caller}: options.${name} must be a whole number of seconds from 0 to ${MAX_DURATION_SECONDS}.`,
    );
  }
  return value as number;
}

/** Reads `activeFrom` or `retiredAt` of an entry. */
function readTime(entry: Record<string, unknown>, name: string, path: string, caller: string): number {
  const value = entry[name];
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_NUMERIC_DATE) {
    throw new TypeError(
      `${caller}: ${path}.${name} must be a whole number of seconds since the Unix epoch, from 0 to ${MAX_NUMERIC_DATE}.`,
    );
  }
  return value as number;
}

/** Checks every entry and returns them sorted by `activeFrom`, with the times each signs and is published. */
function readSchedule<TPrivate, TPublic>(
  keys: unknown,
  kind: RingKind<TPrivate, TPublic>,
  settings: { readonly publishAhead: number; readonly publishAfter: number },
): readonly Scheduled<TPrivate, TPublic>[] {
  const { name } = kind;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_JWKS_KEYS) {
    throw new TypeError(`${name}: options.keys must be a non-empty array of at most ${MAX_JWKS_KEYS} entries.`);
  }
  // Copied once, by index, so the ring holds exactly the entries checked below.
  const snapshot: readonly unknown[] = Array.from({ length: keys.length }, (_, index): unknown => keys[index]);
  const kids = new Set<string>();
  const starts = new Set<number>();
  const checked = snapshot.map((value, index) => {
    const path = `options.keys[${index}]`;
    if (typeof value !== "object" || value === null) {
      throw new TypeError(`${name}: ${path} must be an object.`);
    }
    rejectUnknownOptions(value, ENTRY_MEMBERS, name, path);
    const entry = value as Record<string, unknown>;
    const key = kind.readKey(entry.key, path);
    const activeFrom = readTime(entry, "activeFrom", path, name);
    const retiredAt = entry.retiredAt === undefined ? Infinity : readTime(entry, "retiredAt", path, name);
    if (retiredAt <= activeFrom) {
      throw new TypeError(`${name}: ${path}.retiredAt must be later than its activeFrom.`);
    }
    if (kids.has(key.kid as string)) {
      throw new TypeError(`${name}: two keys share the kid of ${path}.`);
    }
    if (starts.has(activeFrom)) {
      throw new TypeError(`${name}: two keys share the activeFrom of ${path}.`);
    }
    kids.add(key.kid as string);
    starts.add(activeFrom);
    return { key, publicKey: kind.publicHalf(key), activeFrom, retiredAt };
  });
  checked.sort((left, right) => left.activeFrom - right.activeFrom);
  return Object.freeze(
    checked.map((entry, index): Scheduled<TPrivate, TPublic> => {
      const signsUntil = Math.min(entry.retiredAt, checked[index + 1]?.activeFrom ?? Infinity);
      return Object.freeze({
        ...entry,
        publishedFrom: entry.activeFrom - settings.publishAhead,
        publishedUntil: signsUntil + settings.publishAfter,
      });
    }),
  );
}

/** Reads a signing ring entry's `key`: a private key this package created, with a `kid`. */
function readSigningKey(value: unknown, path: string): PrivateKey {
  let isPrivate: boolean;
  try {
    getKeyEntry(value);
    isPrivate = (value as { kind: unknown }).kind === "private";
  } catch {
    isPrivate = false;
  }
  if (!isPrivate) {
    throw new TypeError(`createKeyRing: ${path}.key must be a private key created by this package.`);
  }
  const key = value as PrivateKey;
  if (key.kid === undefined) {
    throw new TypeError(`createKeyRing: ${path}.key must have a kid.`);
  }
  return key;
}
