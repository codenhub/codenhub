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

/**
 * Creates an in-memory {@link MemoryStore} that keeps everything in one process's memory.
 *
 * @remarks
 * Everything lives in this process's memory and is lost on restart. It is NOT for production: it exists
 * for tests and examples, and it is the reference for the {@link OidcStore} contract that other adapters
 * are judged against.
 *
 * Records are never purged. The store keeps every record for its lifetime, and the provider checks
 * `expiresAt` itself, so memory grows with use; that is one more reason it is not for production. Saved
 * and returned records are copies, so the caller can change its own objects without changing the store.
 *
 * @param options - Clients to register.
 * @returns A store whose methods resolve for any string key, except that each `save*` method rejects when
 * its key already exists, so a spent code or refresh token can never be made consumable again.
 */
export function createMemoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  const clients = new Map<string, ClientRecord>();
  const interactions = new Map<string, Entry<InteractionRecord>>();
  const codes = new Map<string, Entry<CodeRecord>>();
  const accessTokens = new Map<string, Entry<AccessTokenRecord>>();
  const refreshTokens = new Map<string, Entry<RefreshTokenRecord>>();
  // Kept forever, and checked on every read: a token saved after its grant was revoked must still be hidden.
  const revokedGrants = new Set<string>();

  for (const client of options.clients ?? []) {
    clients.set(client.clientId, copyClient(client));
  }

  const addClient = (client: ClientRecord): void => {
    clients.set(client.clientId, copyClient(client));
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

  return {
    addClient,

    findClient: (clientId) =>
      run(() => {
        const client = clients.get(clientId);
        return client === undefined ? undefined : copyClient(client);
      }),

    saveInteraction: (key, record) =>
      run(() => {
        rejectIfPresent(interactions, key);
        interactions.set(key, { record: structuredClone(record), used: false });
      }),

    consumeInteraction: (key) =>
      run(() => {
        const entry = interactions.get(key);
        if (entry === undefined) {
          return undefined;
        }
        // Deleted rather than marked used: an interaction is single-use and never reported as replayed.
        interactions.delete(key);
        return structuredClone(entry.record);
      }),

    saveCode: (key, record) =>
      run(() => {
        rejectIfPresent(codes, key);
        codes.set(key, { record: structuredClone(record), used: false });
      }),

    consumeCode: (key) =>
      run(() => {
        const entry = codes.get(key);
        return entry === undefined ? undefined : consumeEntry(entry);
      }),

    saveAccessToken: (key, record) =>
      run(() => {
        rejectIfPresent(accessTokens, key);
        accessTokens.set(key, { record: structuredClone(record), used: false });
      }),

    findAccessToken: (key) =>
      run(() => {
        const entry = accessTokens.get(key);
        if (entry === undefined || revokedGrants.has(entry.record.grantId)) {
          return undefined;
        }
        return structuredClone(entry.record);
      }),

    saveRefreshToken: (key, record) =>
      run(() => {
        rejectIfPresent(refreshTokens, key);
        refreshTokens.set(key, { record: structuredClone(record), used: false });
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
      }),
  };
}

/**
 * Copies a client record one level down: the record, its redirect URIs and scopes, and its `auth` object.
 * A client may hold `@codenhub/jwt` keys, which are recognized by identity and hold functions, so they are
 * shared by reference rather than cloned. A value that is not an array is copied as it is, so a malformed
 * record reaches the provider's own check and gets its own `TypeError`.
 */
function copyClient(client: ClientRecord): ClientRecord {
  return {
    ...client,
    redirectUris: copyList(client.redirectUris),
    scopes: copyList(client.scopes),
    auth: typeof client.auth === "object" && client.auth !== null ? { ...client.auth } : client.auth,
  };
}

/** Copies an array; any other value is returned unchanged. */
function copyList<T>(value: T): T {
  return Array.isArray(value) ? ([...value] as T) : value;
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
 * await between finding the entry and calling this. The consumed record is a copy, so the caller cannot
 * change the stored one.
 */
function consumeEntry<TRecord extends { readonly grantId: string }>(entry: Entry<TRecord>): Consumption<TRecord> {
  if (entry.used) {
    return { status: "replayed", grantId: entry.record.grantId };
  }
  entry.used = true;
  return { status: "consumed", record: structuredClone(entry.record) };
}
