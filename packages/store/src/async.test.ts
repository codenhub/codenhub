import { describe, expect, it, vi } from "vitest";

import { asyncMemoryDriver, createAsyncStore } from "./index";

describe("AsyncStore", () => {
  it("should initialize with initial state and get/set values asynchronously", async () => {
    const driver = asyncMemoryDriver<{ count: number }>();
    const store = createAsyncStore({
      storageKey: "test-async-store",
      initialState: { count: 0 },
      driver,
    });

    expect(await store.get()).toEqual({ count: 0 });
    expect(await store.set({ count: 10 })).toBe(true);
    expect(await store.get()).toEqual({ count: 10 });
  });

  it("should patch state asynchronously", async () => {
    const driver = asyncMemoryDriver<{ count: number; name?: string }>();
    const store = createAsyncStore({
      storageKey: "test-async-store",
      initialState: { count: 0, name: "test" },
      driver,
    });

    const next = await store.patch({ count: 5 });
    expect(next).toEqual({ count: 5, name: "test" });
    expect(await store.get()).toEqual({ count: 5, name: "test" });
  });

  it("should support getItem, setItem, and removeItem asynchronously", async () => {
    const driver = asyncMemoryDriver<{ count: number; name?: string }>();
    const store = createAsyncStore({
      storageKey: "test-async-store",
      initialState: { count: 0, name: "test" },
      driver,
    });

    expect(await store.getItem("count")).toBe(0);
    expect(await store.setItem("count", 42)).toEqual({ count: 42, name: "test" });
    expect(await store.getItem("count")).toBe(42);

    expect(await store.removeItem("name")).toEqual({ count: 42 });
    expect(await store.getItem("name")).toBeUndefined();
  });

  it("should handle driver failures gracefully", async () => {
    const onError = vi.fn();
    const failingDriver = {
      get: vi.fn().mockRejectedValue(new Error("Read error")),
      set: vi.fn().mockRejectedValue(new Error("Write error")),
      clear: vi.fn().mockRejectedValue(new Error("Clear error")),
    };

    const store = createAsyncStore({
      storageKey: "failing-store",
      initialState: { count: 10 },
      driver: failingDriver,
      onError,
    });

    expect(await store.get()).toEqual({ count: 10 });
    expect(onError).toHaveBeenCalledWith({
      code: "storage-read-failed",
      message: 'Driver failed to read value for key "failing-store".',
      storageKey: "failing-store",
      cause: expect.any(Error),
    });

    expect(await store.set({ count: 20 })).toBe(false);
    expect(onError).toHaveBeenCalledWith({
      code: "storage-write-failed",
      message: 'Driver failed to write value for key "failing-store".',
      storageKey: "failing-store",
      cause: expect.any(Error),
    });

    await store.clear();
    expect(onError).toHaveBeenCalledWith({
      code: "storage-clear-failed",
      message: 'Driver failed to clear storage for key "failing-store".',
      storageKey: "failing-store",
      cause: expect.any(Error),
    });
  });

  describe("asyncMemoryDriver state isolation", () => {
    it("should prevent mutation leaks on set", async () => {
      const driver = asyncMemoryDriver<{ config: { theme: string } }>();
      const store = createAsyncStore({
        storageKey: "async-memory-leak-test",
        initialState: { config: { theme: "light" } },
        driver,
      });
      const data = { config: { theme: "dark" } };
      await store.set(data);

      data.config.theme = "blue";
      expect((await store.get()).config.theme).toBe("dark");
    });

    it("should prevent mutation leaks on get", async () => {
      const driver = asyncMemoryDriver<{ config: { theme: string } }>();
      const store = createAsyncStore({
        storageKey: "async-memory-leak-test-2",
        initialState: { config: { theme: "light" } },
        driver,
      });
      await store.set({ config: { theme: "dark" } });

      const state = await store.get();
      state.config.theme = "blue";
      expect((await store.get()).config.theme).toBe("dark");
    });

    it("should throw if the driver is shared across stores with different keys", () => {
      const driver = asyncMemoryDriver<{ value: number }>();
      createAsyncStore({
        storageKey: "store-a",
        initialState: { value: 1 },
        driver,
      });

      expect(() => {
        createAsyncStore({
          storageKey: "store-b",
          initialState: { value: 2 },
          driver,
        });
      }).toThrow(
        'Driver instance cannot be shared across stores with different keys (already bound to "store-a", tried to bind to "store-b").',
      );
    });
  });

  describe("write operations returned value isolation (async)", () => {
    it("should clone the object returned by patch", async () => {
      const driver = asyncMemoryDriver<{ config: { theme: string } }>();
      const store = createAsyncStore({
        storageKey: "async-patch-clone-test",
        initialState: { config: { theme: "light" } },
        driver,
      });
      const result = await store.patch({ config: { theme: "dark" } });
      result.config.theme = "blue";
      expect((await store.get()).config.theme).toBe("dark");
    });

    it("should clone the object returned by setItem", async () => {
      const driver = asyncMemoryDriver<{ config: { theme: string } }>();
      const store = createAsyncStore({
        storageKey: "async-setitem-clone-test",
        initialState: { config: { theme: "light" } },
        driver,
      });
      const result = await store.setItem("config", { theme: "dark" });
      result.config.theme = "blue";
      expect((await store.get()).config.theme).toBe("dark");
    });

    it("should clone the object returned by removeItem", async () => {
      const driver = asyncMemoryDriver<{ config?: { theme: string }; other: number }>();
      const store = createAsyncStore({
        storageKey: "async-removeitem-clone-test",
        initialState: { config: { theme: "light" }, other: 1 },
        driver,
      });
      const result = await store.removeItem("config");
      result.other = 99;
      expect((await store.get()).other).toBe(1);
    });
  });

  describe("write serialization", () => {
    it("should serialize concurrent writes to prevent race conditions", async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      let inMemoryData: unknown = null;

      const slowDriver = {
        async get() {
          await delay(10);
          return inMemoryData;
        },
        async set(value: unknown) {
          await delay(10);
          inMemoryData = value;
          return true;
        },
      };

      const store = createAsyncStore<{ count: number; name?: string }>({
        storageKey: "async-serialize-test",
        initialState: { count: 0, name: "default" },
        driver: slowDriver,
      });

      const p1 = store.patch({ count: 1 });
      const p2 = store.patch({ name: "updated" });

      await Promise.all([p1, p2]);

      expect(await store.get()).toEqual({ count: 1, name: "updated" });
    });
  });
});
