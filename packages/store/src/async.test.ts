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
});
