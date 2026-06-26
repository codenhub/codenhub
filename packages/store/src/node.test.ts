import * as fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAsyncStore, createStore } from "./index";
import { nodeAsyncJsonFileDriver, nodeJsonFileDriver } from "./node";

const tempFile = "temp-test-dir/store.json";

// In-memory virtual filesystem map
const mockFiles = new Map<string, string>();

const createEnoentError = (msg: string): Error & { code?: string } => {
  const err = new Error(msg) as Error & { code?: string };
  err.code = "ENOENT";
  return err;
};

vi.mock("node:fs", () => {
  return {
    existsSync: vi.fn((p: string) => mockFiles.has(p)),
    readFileSync: vi.fn((p: string) => {
      if (!mockFiles.has(p)) {
        throw createEnoentError(`ENOENT: no such file or directory, open '${p}'`);
      }
      return mockFiles.get(p)!;
    }),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((p: string, data: string) => {
      mockFiles.set(p, data);
    }),
    rmSync: vi.fn((p: string) => {
      mockFiles.delete(p);
    }),
    promises: {
      access: vi.fn(async (p: string) => {
        if (!mockFiles.has(p)) {
          throw createEnoentError(`ENOENT: no such file or directory, access '${p}'`);
        }
      }),
      readFile: vi.fn(async (p: string) => {
        if (!mockFiles.has(p)) {
          throw createEnoentError(`ENOENT: no such file or directory, open '${p}'`);
        }
        return mockFiles.get(p)!;
      }),
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async (p: string, data: string) => {
        mockFiles.set(p, data);
      }),
      unlink: vi.fn(async (p: string) => {
        if (!mockFiles.has(p)) {
          throw createEnoentError(`ENOENT: no such file or directory, unlink '${p}'`);
        }
        mockFiles.delete(p);
      }),
    },
  };
});

describe("Node Drivers", () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("nodeJsonFileDriver (Sync)", () => {
    it("should write to and read from a JSON file synchronously", () => {
      const driver = nodeJsonFileDriver<{ value: string }>({ filePath: tempFile });
      const store = createStore({
        storageKey: "node-sync-store",
        initialState: { value: "default" },
        driver,
      });

      expect(store.get()).toEqual({ value: "default" });
      expect(fs.existsSync(tempFile)).toBe(false);

      expect(store.set({ value: "updated" })).toBe(true);
      expect(fs.existsSync(tempFile)).toBe(true);

      const raw = fs.readFileSync(tempFile, "utf8");
      expect(JSON.parse(raw)).toEqual({ value: "updated" });

      expect(store.get()).toEqual({ value: "updated" });

      store.clear();
      expect(fs.existsSync(tempFile)).toBe(false);
      expect(store.get()).toEqual({ value: "default" });
    });

    it("should fall back to initialState and report storage-parse-failed when JSON is malformed", () => {
      const onError = vi.fn();
      mockFiles.set(tempFile, "{invalid json}");

      const driver = nodeJsonFileDriver<{ value: string }>({ filePath: tempFile });
      const store = createStore({
        storageKey: "node-sync-store-malformed",
        initialState: { value: "default" },
        driver,
        onError,
      });

      expect(store.get()).toEqual({ value: "default" });
      expect(onError).toHaveBeenCalledWith({
        code: "storage-parse-failed",
        message: 'Failed to parse stored JSON for key "node-sync-store-malformed".',
        storageKey: "node-sync-store-malformed",
        cause: expect.any(SyntaxError),
      });
    });

    it("should throw if the driver is shared across stores with different keys", () => {
      const driver = nodeJsonFileDriver<{ value: string }>({ filePath: tempFile });
      createStore({
        storageKey: "store-a",
        initialState: { value: "default" },
        driver,
      });

      expect(() => {
        createStore({
          storageKey: "store-b",
          initialState: { value: "default" },
          driver,
        });
      }).toThrow(
        'Driver instance cannot be shared across stores with different keys (already bound to "store-a", tried to bind to "store-b").',
      );
    });
  });

  describe("nodeAsyncJsonFileDriver (Async)", () => {
    it("should write to and read from a JSON file asynchronously", async () => {
      const driver = nodeAsyncJsonFileDriver<{ value: string }>({ filePath: tempFile });
      const store = createAsyncStore({
        storageKey: "node-async-store",
        initialState: { value: "default" },
        driver,
      });

      expect(await store.get()).toEqual({ value: "default" });
      expect(fs.existsSync(tempFile)).toBe(false);

      expect(await store.set({ value: "updated-async" })).toBe(true);
      expect(fs.existsSync(tempFile)).toBe(true);

      const raw = fs.readFileSync(tempFile, "utf8");
      expect(JSON.parse(raw)).toEqual({ value: "updated-async" });

      expect(await store.get()).toEqual({ value: "updated-async" });

      await store.clear();
      expect(fs.existsSync(tempFile)).toBe(false);
      expect(await store.get()).toEqual({ value: "default" });
    });

    it("should fall back to initialState and report storage-parse-failed when JSON is malformed", async () => {
      const onError = vi.fn();
      mockFiles.set(tempFile, "{invalid json}");

      const driver = nodeAsyncJsonFileDriver<{ value: string }>({ filePath: tempFile });
      const store = createAsyncStore({
        storageKey: "node-async-store-malformed",
        initialState: { value: "default" },
        driver,
        onError,
      });

      expect(await store.get()).toEqual({ value: "default" });
      expect(onError).toHaveBeenCalledWith({
        code: "storage-parse-failed",
        message: 'Failed to parse stored JSON for key "node-async-store-malformed".',
        storageKey: "node-async-store-malformed",
        cause: expect.any(SyntaxError),
      });
    });

    it("should throw if the driver is shared across stores with different keys", () => {
      const driver = nodeAsyncJsonFileDriver<{ value: string }>({ filePath: tempFile });
      createAsyncStore({
        storageKey: "store-a",
        initialState: { value: "default" },
        driver,
      });

      expect(() => {
        createAsyncStore({
          storageKey: "store-b",
          initialState: { value: "default" },
          driver,
        });
      }).toThrow(
        'Driver instance cannot be shared across stores with different keys (already bound to "store-a", tried to bind to "store-b").',
      );
    });
  });
});
