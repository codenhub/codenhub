import { describe, expect, it, vi } from "vitest";

import { cloudflareDoDriver, cloudflareKvDriver } from "./cf";
import { createAsyncStore } from "./index";

describe("Cloudflare Drivers", () => {
  describe("cloudflareKvDriver", () => {
    it("should get, put, and delete keys using mock KVNamespace", async () => {
      const kvData = new Map<string, string>();
      const mockKvNamespace = {
        get: vi.fn().mockImplementation(async (key: string) => kvData.get(key) || null),
        put: vi.fn().mockImplementation(async (key: string, val: string) => {
          kvData.set(key, val);
        }),
        delete: vi.fn().mockImplementation(async (key: string) => {
          kvData.delete(key);
        }),
      };

      const driver = cloudflareKvDriver<{ api: string }>({
        kvNamespace: mockKvNamespace,
        storageKey: "my-config",
      });

      const store = createAsyncStore({
        storageKey: "my-config",
        initialState: { api: "https://default.api" },
        driver,
      });

      expect(await store.get()).toEqual({ api: "https://default.api" });
      expect(mockKvNamespace.get).toHaveBeenCalledWith("my-config");

      expect(await store.set({ api: "https://custom.api" })).toBe(true);
      expect(mockKvNamespace.put).toHaveBeenCalledWith("my-config", JSON.stringify({ api: "https://custom.api" }));
      expect(await store.get()).toEqual({ api: "https://custom.api" });

      await store.clear();
      expect(mockKvNamespace.delete).toHaveBeenCalledWith("my-config");
      expect(await store.get()).toEqual({ api: "https://default.api" });
    });

    it("should fall back to initialState and report storage-parse-failed when KV JSON is malformed", async () => {
      const onError = vi.fn();
      const mockKvNamespace = {
        get: vi.fn().mockResolvedValue("{invalid json}"),
        put: vi.fn(),
        delete: vi.fn(),
      };

      const driver = cloudflareKvDriver<{ api: string }>({
        kvNamespace: mockKvNamespace,
        storageKey: "my-config",
      });

      const store = createAsyncStore({
        storageKey: "my-config",
        initialState: { api: "https://default.api" },
        driver,
        onError,
      });

      expect(await store.get()).toEqual({ api: "https://default.api" });
      expect(onError).toHaveBeenCalledWith({
        code: "storage-parse-failed",
        message: 'Failed to parse stored JSON for key "my-config".',
        storageKey: "my-config",
        cause: expect.any(SyntaxError),
      });
    });
  });

  describe("cloudflareDoDriver", () => {
    it("should get, put, and delete keys using mock DurableObjectStorage", async () => {
      const doData = new Map<string, unknown>();
      const mockDoStorage = {
        get: vi.fn().mockImplementation(async (key: string) => doData.get(key)),
        put: vi.fn().mockImplementation(async (key: string, val: unknown) => {
          doData.set(key, val);
        }),
        delete: vi.fn().mockImplementation(async (key: string) => {
          doData.delete(key);
        }),
      };

      const driver = cloudflareDoDriver<{ token: string }>({
        storage: mockDoStorage,
        storageKey: "do-token-key",
      });

      const store = createAsyncStore({
        storageKey: "do-token-key",
        initialState: { token: "default-token" },
        driver,
      });

      expect(await store.get()).toEqual({ token: "default-token" });
      expect(mockDoStorage.get).toHaveBeenCalledWith("do-token-key");

      expect(await store.set({ token: "new-token" })).toBe(true);
      expect(mockDoStorage.put).toHaveBeenCalledWith("do-token-key", { token: "new-token" });
      expect(await store.get()).toEqual({ token: "new-token" });

      await store.clear();
      expect(mockDoStorage.delete).toHaveBeenCalledWith("do-token-key");
      expect(await store.get()).toEqual({ token: "default-token" });
    });

    it("should map undefined returned by DurableObjectStorage get to null", async () => {
      const mockDoStorage = {
        get: vi.fn().mockResolvedValue(undefined),
        put: vi.fn(),
        delete: vi.fn(),
      };
      const driver = cloudflareDoDriver<{ token: string }>({
        storage: mockDoStorage,
        storageKey: "do-token-key",
      });
      expect(await driver.get()).toBeNull();
    });
  });

  describe("Dynamic storageKey injection", () => {
    it("should inject storageKey dynamically from store into KV driver if omitted in options", async () => {
      const kvData = new Map<string, string>();
      const mockKvNamespace = {
        get: vi.fn().mockImplementation(async (key: string) => kvData.get(key) || null),
        put: vi.fn().mockImplementation(async (key: string, val: string) => {
          kvData.set(key, val);
        }),
        delete: vi.fn(),
      };

      // storageKey omitted in KV driver options
      const driver = cloudflareKvDriver<{ api: string }>({
        kvNamespace: mockKvNamespace,
      });

      const store = createAsyncStore({
        storageKey: "injected-kv-key",
        initialState: { api: "https://default.api" },
        driver,
      });

      expect(await store.get()).toEqual({ api: "https://default.api" });
      expect(mockKvNamespace.get).toHaveBeenCalledWith("injected-kv-key");
    });

    it("should inject storageKey dynamically from store into DO driver if omitted in options", async () => {
      const doData = new Map<string, unknown>();
      const mockDoStorage = {
        get: vi.fn().mockImplementation(async (key: string) => doData.get(key)),
        put: vi.fn().mockImplementation(async (key: string, val: unknown) => {
          doData.set(key, val);
        }),
        delete: vi.fn(),
      };

      // storageKey omitted in DO driver options
      const driver = cloudflareDoDriver<{ token: string }>({
        storage: mockDoStorage,
      });

      const store = createAsyncStore({
        storageKey: "injected-do-key",
        initialState: { token: "default-token" },
        driver,
      });

      expect(await store.get()).toEqual({ token: "default-token" });
      expect(mockDoStorage.get).toHaveBeenCalledWith("injected-do-key");
    });

    it("should throw error if get/set called on KV driver without storageKey initialization", async () => {
      const mockKvNamespace = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      };
      const driver = cloudflareKvDriver<{ api: string }>({
        kvNamespace: mockKvNamespace,
      });

      await expect(driver.get()).rejects.toThrow("Storage key not initialized in driver");
    });
  });
});
