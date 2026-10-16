import type {
  AccessTokenRecord,
  ClientRecord,
  CodeRecord,
  Consumption,
  InteractionRecord,
  OidcStore,
  RefreshTokenRecord,
} from "../provider/types";

/** Options for {@link createMemoryStore}. */
export interface MemoryStoreOptions {
  /** Clients to register. */
  readonly clients?: readonly ClientRecord[];
  /** Current time in milliseconds since the Unix epoch; used only to purge expired entries. @defaultValue `Date.now` */
  readonly now?: () => number;
}

/** An {@link OidcStore} that also lets tests register clients. */
export interface MemoryStore extends OidcStore {
  /** Registers or replaces a client. */
  addClient(client: ClientRecord): void;
}

/** A stored record plus whether a single-use value has been consumed. Unused kinds never set `used`. */
interface Entry<TRecord> {
  readonly record: TRecord;
  used: boolean;
}

/** Records expire in seconds, while `now` returns milliseconds; this bridges the two units. */
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Creates an in-memory {@link MemoryStore} that keeps everything in one process's memory.
 *
 * @remarks
 * Everything lives in this process's memory and is lost on restart. It is NOT for production: it exists
 * for tests and examples, and it is the reference for the {@link OidcStore} contract that other adapters
 * are judged against.
 *
 * @param options - Clients to register, and the clock used to purge expired entries.
 * @returns A store whose methods resolve, never reject for a string key.
 */
export function createMemoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  const now = options.now ?? (() => Date.now());
  const clients = new Map<string, ClientRecord>();
  const interactions = new Map<string, Entry<InteractionRecord>>();
  const codes = new Map<string, Entry<CodeRecord>>();
  const accessTokens = new Map<string, Entry<AccessTokenRecord>>();
  const refreshTokens = new Map<string, Entry<RefreshTokenRecord>>();
  // Kept forever, and checked on every read: a token saved after its grant was revoked must still be hidden.
  const revokedGrants = new Set<string>();

  for (const client of options.clients ?? []) {
    clients.set(client.clientId, client);
  }

  const addClient = (client: ClientRecord): void => {
    clients.set(client.clientId, client);
  };

  /**
   * Runs `operation` synchronously and returns its outcome as a promise. Because nothing awaits between a
   * read and the write inside `operation`, a check-and-set in it cannot interleave with another call.
   */
  const run = <T>(operation: () => T): Promise<T> => {
    try {
      return Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error);
    }
  };

  // Purging happens on writes only. Reads return expired records too, because the provider decides from
  // `expiresAt` itself and a read-time purge would make expiry look like a missing value.
  const purgeExpired = (): void => {
    const nowMs = now();
    purgeEntries(interactions, nowMs);
    purgeEntries(codes, nowMs);
    purgeEntries(accessTokens, nowMs);
    purgeEntries(refreshTokens, nowMs);
  };

  return {
    addClient,

    findClient: (clientId) => run(() => clients.get(clientId)),

    saveInteraction: (key, record) =>
      run(() => {
        purgeExpired();
        rejectIfPresent(interactions, key);
        interactions.set(key, { record, used: false });
      }),

    consumeInteraction: (key) =>
      run(() => {
        const entry = interactions.get(key);
        if (entry === undefined) {
          return undefined;
        }
        // Deleted rather than marked used: an interaction is single-use and never reported as replayed.
        interactions.delete(key);
        return entry.record;
      }),

    saveCode: (key, record) =>
      run(() => {
        purgeExpired();
        rejectIfPresent(codes, key);
        codes.set(key, { record, used: false });
      }),

    consumeCode: (key) =>
      run(() => {
        const entry = codes.get(key);
        return entry === undefined ? undefined : consumeEntry(entry);
      }),

    saveAccessToken: (key, record) =>
      run(() => {
        purgeExpired();
        rejectIfPresent(accessTokens, key);
        accessTokens.set(key, { record, used: false });
      }),

    findAccessToken: (key) =>
      run(() => {
        const entry = accessTokens.get(key);
        if (entry === undefined || revokedGrants.has(entry.record.grantId)) {
          return undefined;
        }
        return entry.record;
      }),

    saveRefreshToken: (key, record) =>
      run(() => {
        purgeExpired();
        rejectIfPresent(refreshTokens, key);
        refreshTokens.set(key, { record, used: false });
      }),

    consumeRefreshToken: (key) =>
      run(() => {
        const entry = refreshTokens.get(key);
        // Checked before consuming, so a revoked token reports `undefined` rather than `replayed`.
        if (entry === undefined || revokedGrants.has(entry.record.grantId)) {
          return undefined;
        }
        return consumeEntry(entry);
      }),

    revokeGrant: (grantId) =>
      run(() => {
        revokedGrants.add(grantId);
        removeGrantEntries(accessTokens, grantId);
        removeGrantEntries(refreshTokens, grantId);
      }),
  };
}

/**
 * Refuses to overwrite a key. Overwriting would reset `used` to false, which makes a spent code or refresh
 * token consumable again. The message omits the key, because a key is often a secret token.
 */
function rejectIfPresent<TRecord>(entries: Map<string, Entry<TRecord>>, key: string): void {
  if (entries.has(key)) {
    throw new Error("OidcStore: a key cannot be saved twice");
  }
}

/**
 * Marks a single-use entry consumed, or reports its replay. Synchronous by design: the caller must not
 * await between finding the entry and calling this.
 */
function consumeEntry<TRecord extends { readonly grantId: string }>(entry: Entry<TRecord>): Consumption<TRecord> {
  if (entry.used) {
    return { status: "replayed", grantId: entry.record.grantId };
  }
  entry.used = true;
  return { status: "consumed", record: entry.record };
}

/**
 * Deletes every entry whose expiry has passed. Codes and refresh tokens are kept until `expiresAt` even
 * when used, so a replay inside that window is still reported as `replayed`.
 */
function purgeEntries<TRecord extends { readonly expiresAt: number }>(
  entries: Map<string, Entry<TRecord>>,
  nowMs: number,
): void {
  for (const [key, entry] of entries) {
    if (entry.record.expiresAt * MILLISECONDS_PER_SECOND <= nowMs) {
      entries.delete(key);
    }
  }
}

/** Removes a revoked grant's tokens to free memory. Reads already hide them through the revoked set. */
function removeGrantEntries<TRecord extends { readonly grantId: string }>(
  entries: Map<string, Entry<TRecord>>,
  grantId: string,
): void {
  for (const [key, entry] of entries) {
    if (entry.record.grantId === grantId) {
      entries.delete(key);
    }
  }
}
