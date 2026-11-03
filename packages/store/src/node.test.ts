import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAsyncStore, createStore } from "./index";
import { nodeAsyncJsonFileDriver, nodeJsonFileDriver } from "./node";

// Each test gets its own file: a file stays bound to the first storage key used on it.
let testCount = 0;
let tempFile = "";

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
    renameSync: vi.fn((from: string, to: string) => {
      mockFiles.set(to, mockFiles.get(from)!);
      mockFiles.delete(from);
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
      rename: vi.fn(async (from: string, to: string) => {
        mockFiles.set(to, mockFiles.get(from)!);
        mockFiles.delete(from);
      }),
      rm: vi.fn(async (p: string) => {
        mockFiles.delete(p);
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
    tempFile = `temp-test-dir/store-${String(++testCount)}.json`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each([false, true])("atomic file replacement (async: %s)", (isAsync) => {
    it.each(["write", "rename"])(
      "preserves the previous file and cleans temporary files after %s fails",
      async (failure) => {
        const previous = JSON.stringify({ value: "previous" });
        mockFiles.set(tempFile, previous);
        const cause = new Error("disk failure");
        if (isAsync) {
          if (failure === "rename") {
            vi.mocked(fs.promises.rename).mockRejectedValueOnce(cause);
          } else {
            vi.mocked(fs.promises.writeFile).mockImplementationOnce(async (file) => {
              mockFiles.set(String(file), "partial");
              throw cause;
            });
          }
        } else {
          if (failure === "rename") {
            vi.mocked(fs.renameSync).mockImplementationOnce(() => {
              throw cause;
            });
          } else {
            vi.mocked(fs.writeFileSync).mockImplementationOnce((file) => {
              mockFiles.set(String(file), "partial");
              throw cause;
            });
          }
        }
        const driver = isAsync
          ? nodeAsyncJsonFileDriver({ filePath: tempFile })
          : nodeJsonFileDriver({ filePath: tempFile });
        await expect((async () => driver.set({ value: "next" }))()).rejects.toBe(cause);
        expect(mockFiles.get(tempFile)).toBe(previous);
        expect([...mockFiles.keys()]).toEqual([tempFile]);
      },
    );
  });

  describe("one storage key per file", () => {
    const create = (isAsync: boolean, storageKey: string, filePath: string) =>
      isAsync
        ? createAsyncStore({ storageKey, initialState: {}, driver: nodeAsyncJsonFileDriver({ filePath }) })
        : createStore({ storageKey, initialState: {}, driver: nodeJsonFileDriver({ filePath }) });

    it.each([
      [false, false],
      [true, true],
      [false, true],
    ])("rejects a second key on the same file (first async: %s, second async: %s)", (firstAsync, secondAsync) => {
      const filePath = `shared-${String(firstAsync)}-${String(secondAsync)}/store.json`;
      create(firstAsync, "a", filePath);
      expect(() => create(secondAsync, "b", `./${filePath}`)).toThrow(
        `File "${path.resolve(filePath)}" is already bound to storage key "a"; tried to bind it to "b". Use one file per storage key.`,
      );
    });

    it("allows the same key on the same file again", () => {
      create(false, "same", "same-key/store.json");
      expect(() => create(true, "same", "same-key/store.json")).not.toThrow();
    });
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

    it("should fall back to initialState and report store.parse_failed when JSON is malformed", () => {
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
        code: "store.parse_failed",
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

    it("should fall back to initialState and report store.parse_failed when JSON is malformed", async () => {
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
        code: "store.parse_failed",
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
