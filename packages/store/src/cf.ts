import type { AsyncStorageDriver } from "./index";

/**
 * Minimal interface representing a Cloudflare KV namespace binding.
 */
export interface CloudflareKvNamespace {
  /**
   * Reads a value from the KV namespace by its key.
   */
  get(key: string): Promise<string | null>;
  /**
   * Writes a value to the KV namespace under a specific key.
   */
  put(key: string, value: string): Promise<void>;
  /**
   * Deletes a key-value pair from the KV namespace.
   */
  delete(key: string): Promise<void>;
}

/**
 * Options for configuring the Cloudflare Workers KV storage driver.
 */
export interface CloudflareKvDriverOptions {
  /**
   * The Cloudflare KV namespace binding.
   */
  kvNamespace: CloudflareKvNamespace;
  /**
   * The key under which the store data is saved in KV.
   */
  storageKey?: string;
}

/**
 * An asynchronous storage driver that persists data to a Cloudflare Workers KV namespace.
 *
 * If KV read/write operations fail or the retrieved string contains invalid JSON,
 * the driver throws or rejects with an error (e.g., `SyntaxError` for malformed JSON),
 * which is caught and handled by the store.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param options - Configuration options for the KV namespace and storage key.
 * @returns An asynchronous storage driver compatible with `createAsyncStore`.
 */
export function cloudflareKvDriver<TSchema extends object>(
  options: CloudflareKvDriverOptions,
): AsyncStorageDriver<TSchema> {
  const { kvNamespace } = options;
  let key = options.storageKey;

  const getKey = (): string => {
    if (!key) {
      throw new Error(
        "Storage key not initialized in driver. Ensure storageKey is provided in options or store creation.",
      );
    }
    return key;
  };

  const driver: AsyncStorageDriver<TSchema> = {
    async get(): Promise<unknown> {
      const raw = await kvNamespace.get(getKey());
      if (raw === null || raw === undefined) {
        return null;
      }
      return JSON.parse(raw);
    },
    async set(value: TSchema): Promise<boolean> {
      await kvNamespace.put(getKey(), JSON.stringify(value));
      return true;
    },
    async clear(): Promise<void> {
      await kvNamespace.delete(getKey());
    },
    _setStorageKey(k: string) {
      key = k;
    },
  };

  return driver;
}

/**
 * Minimal interface representing Cloudflare Durable Object transactional storage.
 */
export interface CloudflareDurableObjectStorage {
  /**
   * Reads a value from the transactional storage.
   */
  get(key: string): Promise<unknown>;
  /**
   * Writes a value to the transactional storage.
   */
  put(key: string, value: unknown): Promise<void>;
  /**
   * Deletes a key from the transactional storage.
   */
  delete(key: string): Promise<void>;
}

/**
 * Options for configuring the Cloudflare Durable Object storage driver.
 */
export interface CloudflareDoDriverOptions {
  /**
   * The Durable Object transactional storage object (typically state.storage).
   */
  storage: CloudflareDurableObjectStorage;
  /**
   * The key under which the store data is saved in Durable Object storage.
   */
  storageKey?: string;
}

/**
 * An asynchronous storage driver that persists data to Cloudflare Durable Object storage.
 *
 * Stored state is persisted natively (as a parsed object) instead of stringified JSON.
 * If the transactional storage operations fail, the driver rejects with an error,
 * which is caught and handled by the store.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param options - Configuration options for DO storage and key.
 * @returns An asynchronous storage driver compatible with `createAsyncStore`.
 */
export function cloudflareDoDriver<TSchema extends object>(
  options: CloudflareDoDriverOptions,
): AsyncStorageDriver<TSchema> {
  const { storage } = options;
  let key = options.storageKey;

  const getKey = (): string => {
    if (!key) {
      throw new Error(
        "Storage key not initialized in driver. Ensure storageKey is provided in options or store creation.",
      );
    }
    return key;
  };

  const driver: AsyncStorageDriver<TSchema> = {
    async get(): Promise<unknown> {
      const val = await storage.get(getKey());
      if (val === undefined) {
        return null;
      }
      return val;
    },
    async set(value: TSchema): Promise<boolean> {
      await storage.put(getKey(), value);
      return true;
    },
    async clear(): Promise<void> {
      await storage.delete(getKey());
    },
    _setStorageKey(k: string) {
      key = k;
    },
  };

  return driver;
}
