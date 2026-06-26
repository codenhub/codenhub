// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStore, localStorageDriver, memoryDriver } from "./index";
import type { RemovableStoreKey } from "./index";

describe("Store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("state isolation", () => {
    it("should clone initialState to prevent mutations leaking back into the store fallback", () => {
      const initialState = { config: { theme: "light" } };
      const store = createStore({ storageKey: "test-store", initialState });

      const state = store.get();
      expect(state).toEqual(initialState);

      state.config.theme = "dark";

      expect(store.get().config.theme).toBe("light");
    });

    it("should snapshot initialState when the store is created", () => {
      const initialState = { config: { theme: "light" } };
      const store = createStore({ storageKey: "test-store-snapshot", initialState });

      initialState.config.theme = "dark";

      expect(store.get().config.theme).toBe("light");
    });

    it("should clone stored data to prevent mutations leaking back into the store", () => {
      const store = createStore({ storageKey: "test-store-2", initialState: { config: { theme: "light" } } });
      store.set({ config: { theme: "dark" } });

      const state = store.get();
      expect(state.config.theme).toBe("dark");

      state.config.theme = "light";

      expect(store.get().config.theme).toBe("dark");
    });
  });

  describe("get()", () => {
    it("should return the initialState clone when storage is empty", () => {
      const store = createStore({ storageKey: "key-get-empty", initialState: { name: "default" } });
      expect(store.get()).toEqual({ name: "default" });
    });

    it("should return the persisted state when storage has a valid value", () => {
      const store = createStore({ storageKey: "key-get-valid", initialState: { count: 0 } });
      store.set({ count: 7 });
      expect(store.get()).toEqual({ count: 7 });
    });

    it("should fall back to initialState and report an error when stored JSON is malformed", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const onError = vi.fn();
      localStorage.setItem("key-get-malformed", "{{not valid json}}");

      const store = createStore({ storageKey: "key-get-malformed", initialState: { name: "fallback" }, onError });
      expect(store.get()).toEqual({ name: "fallback" });
      expect(onError).toHaveBeenCalledWith({
        code: "storage-parse-failed",
        message: 'Failed to parse stored JSON for key "key-get-malformed".',
        storageKey: "key-get-malformed",
        cause: expect.anything(),
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should fall back to initialState without error when localStorage is inaccessible (e.g. SecurityError)", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });

      const onError = vi.fn();
      const store = createStore({ storageKey: "key-get-throws", initialState: { name: "fallback" }, onError });
      expect(store.get()).toEqual({ name: "fallback" });
      // isStorageAvailable() catches the throw and treats storage as unavailable.
      // No onError is fired because this is an environmental failure, not a per-key read failure.
      expect(onError).not.toHaveBeenCalled();
    });

    it("should fall back to initialState when localStorage is unavailable", () => {
      vi.stubGlobal("localStorage", undefined);

      const store = createStore({ storageKey: "key-get-unavailable", initialState: { name: "fallback" } });

      expect(store.get()).toEqual({ name: "fallback" });
    });
  });

  describe("set()", () => {
    it("should persist the full state and return true on success", () => {
      const store = createStore({ storageKey: "key-set-ok", initialState: { count: 0 } });
      const didWrite = store.set({ count: 42 });
      expect(didWrite).toBe(true);
      expect(store.get()).toEqual({ count: 42 });
    });

    it("should overwrite any previously stored state", () => {
      const store = createStore({ storageKey: "key-set-overwrite", initialState: { a: 1, b: 2 } });
      store.set({ a: 10, b: 20 });
      store.set({ a: 99, b: 99 });
      expect(store.get()).toEqual({ a: 99, b: 99 });
    });

    it("should return false and report an error when localStorage.setItem throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = new DOMException("QuotaExceededError");
      const onError = vi.fn();
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw error;
      });

      const store = createStore({ storageKey: "key-set-fail", initialState: { count: 0 }, onError });
      const didWrite = store.set({ count: 1 });
      expect(didWrite).toBe(false);
      expect(onError).toHaveBeenCalledWith({
        code: "storage-write-failed",
        message: 'Failed to write to localStorage for key "key-set-fail".',
        storageKey: "key-set-fail",
        cause: error,
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should return false when localStorage is unavailable", () => {
      vi.stubGlobal("localStorage", undefined);

      const store = createStore({ storageKey: "key-set-unavailable", initialState: { count: 0 } });

      expect(store.set({ count: 1 })).toBe(false);
    });
  });

  describe("patch()", () => {
    it("should merge partial state and return the merged result", () => {
      const store = createStore({ storageKey: "key-patch-merge", initialState: { a: 1, b: 2 } });
      store.set({ a: 1, b: 2 });

      const result = store.patch({ b: 99 });
      expect(result).toEqual({ a: 1, b: 99 });
    });

    it("should persist the merged state so subsequent reads reflect it", () => {
      const store = createStore({ storageKey: "key-patch-persist", initialState: { x: "hello", y: "world" } });
      store.set({ x: "hello", y: "world" });
      store.patch({ x: "hi" });
      expect(store.get()).toEqual({ x: "hi", y: "world" });
    });

    it("should not overwrite unpatched keys", () => {
      const store = createStore({ storageKey: "key-patch-unpatched", initialState: { x: "hello", y: "world" } });
      store.set({ x: "hello", y: "world" });
      store.patch({ x: "hi" });
      expect(store.get().y).toBe("world");
    });

    it("should return merged state even when the write fails", () => {
      const onError = vi.fn();
      const stored: unknown = { a: 1, b: 2 };
      const failingWriteDriver = {
        get: () => stored,
        set: () => {
          throw new Error("Write failed");
        },
      };

      const store = createStore({
        storageKey: "key-patch-write-fail",
        initialState: { a: 1, b: 2 },
        driver: failingWriteDriver,
        onError,
      });

      const result = store.patch({ b: 99 });
      expect(result).toEqual({ a: 1, b: 99 });
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "storage-write-failed" }));
    });
  });

  describe("getItem()", () => {
    it("should return the typed value for a stored key", () => {
      const store = createStore({ storageKey: "key-getitem-value", initialState: { color: "red", size: 10 } });
      store.set({ color: "blue", size: 10 });
      expect(store.getItem("color")).toBe("blue");
    });

    it("should return undefined for a key not present in the stored state", () => {
      const store = createStore<{ color?: string }>({ storageKey: "key-getitem-undef", initialState: {} });
      expect(store.getItem("color")).toBeUndefined();
    });
  });

  describe("setItem()", () => {
    it("should write a single key and return the full updated state", () => {
      const store = createStore({ storageKey: "key-setitem-full", initialState: { a: 1, b: 2 } });
      store.set({ a: 1, b: 2 });

      const next = store.setItem("a", 99);
      expect(next).toEqual({ a: 99, b: 2 });
    });

    it("should persist the change so subsequent reads reflect it", () => {
      const store = createStore({ storageKey: "key-setitem-persist", initialState: { a: 1, b: 2 } });
      store.set({ a: 1, b: 2 });
      store.setItem("b", 50);
      expect(store.get()).toEqual({ a: 1, b: 50 });
    });

    it("should not affect other keys when setting a single key", () => {
      const store = createStore({ storageKey: "key-setitem-isolated", initialState: { a: 1, b: 2, c: 3 } });
      store.set({ a: 1, b: 2, c: 3 });
      store.setItem("b", 99);
      const state = store.get();
      expect(state.a).toBe(1);
      expect(state.c).toBe(3);
    });

    it("should return updated state even when the write fails", () => {
      const onError = vi.fn();
      const stored: unknown = { a: 1, b: 2 };
      const failingWriteDriver = {
        get: () => stored,
        set: () => {
          throw new Error("Write failed");
        },
      };

      const store = createStore({
        storageKey: "key-setitem-write-fail",
        initialState: { a: 1, b: 2 },
        driver: failingWriteDriver,
        onError,
      });

      const result = store.setItem("a", 99);
      expect(result).toEqual({ a: 99, b: 2 });
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "storage-write-failed" }));
    });
  });

  describe("removeItem()", () => {
    it("should only allow optional keys at type level", () => {
      const removableKey: RemovableStoreKey<{ a: number; b?: number }> = "b";

      // @ts-expect-error Required keys must not be typed as removable.
      const requiredKey: RemovableStoreKey<{ a: number; b?: number }> = "a";

      const requiredStore = createStore<{ a: number; b: number }>({
        storageKey: "key-removeitem-required",
        initialState: {
          a: 1,
          b: 2,
        },
      });

      // @ts-expect-error Required keys must not be removable from a typed store.
      requiredStore.removeItem("b");

      const optionalStore = createStore<{ a: number; b?: number }>({
        storageKey: "key-removeitem-optional",
        initialState: {
          a: 1,
          b: 2,
        },
      });

      optionalStore.removeItem("b");
      expect(removableKey).toBe("b");
      expect(requiredKey).toBe("a");
    });

    it("should remove a key and return the updated state without it", () => {
      const store = createStore<{ a: number; b?: number }>({
        storageKey: "key-removeitem-returns",
        initialState: {
          a: 1,
          b: 2,
        },
      });
      store.set({ a: 1, b: 2 });

      const next = store.removeItem("b");
      expect(next).toEqual({ a: 1 });
    });

    it("should persist the removal so subsequent reads reflect it", () => {
      const store = createStore<{ a: number; b?: number }>({
        storageKey: "key-removeitem-persist",
        initialState: {
          a: 1,
          b: 2,
        },
      });
      store.set({ a: 1, b: 2 });
      store.removeItem("b");
      expect("b" in store.get()).toBe(false);
    });

    it("should return updated state even when the write fails", () => {
      const onError = vi.fn();
      const stored: unknown = { a: 1, b: 2 };
      const failingWriteDriver = {
        get: () => stored,
        set: () => {
          throw new Error("Write failed");
        },
      };

      const store = createStore<{ a: number; b?: number }>({
        storageKey: "key-removeitem-write-fail",
        initialState: { a: 1, b: 2 },
        driver: failingWriteDriver,
        onError,
      });

      const result = store.removeItem("b");
      expect(result).toEqual({ a: 1 });
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "storage-write-failed" }));
    });
  });

  describe("clear()", () => {
    it("should remove the stored entry so subsequent reads return initialState", () => {
      const store = createStore({ storageKey: "key-clear-fallback", initialState: { value: "stored" } });
      store.set({ value: "changed" });
      store.clear();
      expect(store.get()).toEqual({ value: "stored" });
    });

    it("should report an error and not throw when localStorage.removeItem throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = new Error("SecurityError");
      const onError = vi.fn();
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw error;
      });

      const store = createStore({ storageKey: "key-clear-throws", initialState: { value: "x" }, onError });
      expect(() => store.clear()).not.toThrow();
      expect(onError).toHaveBeenCalledWith({
        code: "storage-clear-failed",
        message: 'Failed to clear localStorage for key "key-clear-throws".',
        storageKey: "key-clear-throws",
        cause: error,
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should do nothing when localStorage is unavailable", () => {
      vi.stubGlobal("localStorage", undefined);

      const store = createStore({ storageKey: "key-clear-unavailable", initialState: { value: "x" } });

      expect(() => store.clear()).not.toThrow();
    });
  });

  describe("validate option", () => {
    const isValidSchema = (raw: unknown): raw is { name: string } =>
      typeof raw === "object" && raw !== null && typeof (raw as Record<string, unknown>)["name"] === "string";

    it("should return the stored value when it passes the validator", () => {
      const store = createStore({
        storageKey: "key-validate-pass",
        initialState: { name: "default" },
        validate: isValidSchema,
      });
      store.set({ name: "valid" });
      expect(store.get()).toEqual({ name: "valid" });
    });

    it("should fall back to initialState and report an error when the validator rejects stored value", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const onError = vi.fn();

      localStorage.setItem("key-validate-fail", JSON.stringify({ wrong: "shape" }));

      const store = createStore({
        storageKey: "key-validate-fail",
        initialState: { name: "default" },
        validate: isValidSchema,
        onError,
      });
      expect(store.get()).toEqual({ name: "default" });
      expect(onError).toHaveBeenCalledWith({
        code: "storage-validation-failed",
        message: 'Stored value for key "key-validate-fail" failed schema validation.',
        storageKey: "key-validate-fail",
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("should accept stored values without a validator", () => {
      const store = createStore({ storageKey: "key-no-validate", initialState: { count: 0 } });
      store.set({ count: 5 });
      expect(store.get()).toEqual({ count: 5 });
    });
  });

  describe("memoryDriver", () => {
    it("should prevent mutation leaks on set", () => {
      const driver = memoryDriver<{ config: { theme: string } }>();
      const store = createStore({
        storageKey: "memory-leak-test",
        initialState: { config: { theme: "light" } },
        driver,
      });
      const data = { config: { theme: "dark" } };
      store.set(data);

      data.config.theme = "blue";
      expect(store.get().config.theme).toBe("dark");
    });

    it("should prevent mutation leaks on get", () => {
      const driver = memoryDriver<{ config: { theme: string } }>();
      const store = createStore({
        storageKey: "memory-leak-test-2",
        initialState: { config: { theme: "light" } },
        driver,
      });
      store.set({ config: { theme: "dark" } });

      const state = store.get();
      state.config.theme = "blue";
      expect(store.get().config.theme).toBe("dark");
    });

    it("should throw if the driver is shared across stores with different keys", () => {
      const driver = memoryDriver<{ value: number }>();
      createStore({
        storageKey: "store-a",
        initialState: { value: 1 },
        driver,
      });

      expect(() => {
        createStore({
          storageKey: "store-b",
          initialState: { value: 2 },
          driver,
        });
      }).toThrow(
        'Driver instance cannot be shared across stores with different keys (already bound to "store-a", tried to bind to "store-b").',
      );
    });
  });

  describe("write operations returned value isolation", () => {
    it("should clone the object returned by patch", () => {
      const store = createStore({
        storageKey: "patch-clone-test",
        initialState: { config: { theme: "light" } },
      });
      const result = store.patch({ config: { theme: "dark" } });
      result.config.theme = "blue";
      expect(store.get().config.theme).toBe("dark");
    });

    it("should clone the object returned by setItem", () => {
      const store = createStore({
        storageKey: "setitem-clone-test",
        initialState: { config: { theme: "light" } },
      });
      const result = store.setItem("config", { theme: "dark" });
      result.config.theme = "blue";
      expect(store.get().config.theme).toBe("dark");
    });

    it("should clone the object returned by removeItem", () => {
      const store = createStore<{ config?: { theme: string }; other: number }>({
        storageKey: "removeitem-clone-test",
        initialState: { config: { theme: "light" }, other: 1 },
      });
      const result = store.removeItem("config");
      result.other = 99;
      expect(store.get().other).toBe(1);
    });
  });

  describe("onError count and propagation fixes", () => {
    it("should call store onError exactly once and include cause on write failure", () => {
      const error = new DOMException("QuotaExceededError");
      const onError = vi.fn();
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw error;
      });

      const store = createStore({ storageKey: "key-set-fail-once", initialState: { count: 0 }, onError });
      store.set({ count: 1 });
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith({
        code: "storage-write-failed",
        message: 'Failed to write to localStorage for key "key-set-fail-once".',
        storageKey: "key-set-fail-once",
        cause: error,
      });
    });

    it("should propagate error to store onError when driver has no onError", () => {
      const error = new DOMException("QuotaExceededError");
      const onError = vi.fn();
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw error;
      });

      const store = createStore({
        storageKey: "key-set-fail-manual-driver",
        initialState: { count: 0 },
        driver: localStorageDriver(),
        onError,
      });
      store.set({ count: 1 });
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith({
        code: "storage-write-failed",
        message: 'Driver failed to write value for key "key-set-fail-manual-driver".',
        storageKey: "key-set-fail-manual-driver",
        cause: error,
      });
    });
  });
});
