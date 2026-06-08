// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "./index";

describe("Store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("state isolation", () => {
    it("should clone initialState to prevent mutations leaking back into the store fallback", () => {
      const initialState = { config: { theme: "light" } };
      const store = createStore("test-store", initialState);

      const state = store.get();
      expect(state).toEqual(initialState);

      state.config.theme = "dark";

      expect(store.get().config.theme).toBe("light");
    });

    it("should clone stored data to prevent mutations leaking back into the store", () => {
      const store = createStore("test-store-2", { config: { theme: "light" } });
      store.set({ config: { theme: "dark" } });

      const state = store.get();
      expect(state.config.theme).toBe("dark");

      state.config.theme = "light";

      expect(store.get().config.theme).toBe("dark");
    });
  });

  describe("get()", () => {
    it("should return the initialState clone when storage is empty", () => {
      const store = createStore("key-get-empty", { name: "default" });
      expect(store.get()).toEqual({ name: "default" });
    });

    it("should return the persisted state when storage has a valid value", () => {
      const store = createStore("key-get-valid", { count: 0 });
      store.set({ count: 7 });
      expect(store.get()).toEqual({ count: 7 });
    });

    it("should fall back to initialState and warn when stored JSON is malformed", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      localStorage.setItem("key-get-malformed", "{{not valid json}}");

      const store = createStore("key-get-malformed", { name: "fallback" });
      expect(store.get()).toEqual({ name: "fallback" });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to parse stored JSON"), expect.anything());
    });

    it("should fall back to initialState and warn when localStorage.getItem throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });

      const store = createStore("key-get-throws", { name: "fallback" });
      expect(store.get()).toEqual({ name: "fallback" });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to read from localStorage"),
        expect.anything(),
      );
    });
  });

  describe("set()", () => {
    it("should persist the full state and return true on success", () => {
      const store = createStore("key-set-ok", { count: 0 });
      const didWrite = store.set({ count: 42 });
      expect(didWrite).toBe(true);
      expect(store.get()).toEqual({ count: 42 });
    });

    it("should overwrite any previously stored state", () => {
      const store = createStore("key-set-overwrite", { a: 1, b: 2 });
      store.set({ a: 10, b: 20 });
      store.set({ a: 99, b: 99 });
      expect(store.get()).toEqual({ a: 99, b: 99 });
    });

    it("should return false and warn when localStorage.setItem throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });

      const store = createStore("key-set-fail", { count: 0 });
      const didWrite = store.set({ count: 1 });
      expect(didWrite).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to write to localStorage"),
        expect.anything(),
      );
    });
  });

  describe("patch()", () => {
    it("should merge partial state and return the merged result", () => {
      const store = createStore("key-patch-merge", { a: 1, b: 2 });
      store.set({ a: 1, b: 2 });

      const result = store.patch({ b: 99 });
      expect(result).toEqual({ a: 1, b: 99 });
    });

    it("should persist the merged state so subsequent reads reflect it", () => {
      const store = createStore("key-patch-persist", { x: "hello", y: "world" });
      store.set({ x: "hello", y: "world" });
      store.patch({ x: "hi" });
      expect(store.get()).toEqual({ x: "hi", y: "world" });
    });

    it("should not overwrite unpatched keys", () => {
      const store = createStore("key-patch-unpatched", { x: "hello", y: "world" });
      store.set({ x: "hello", y: "world" });
      store.patch({ x: "hi" });
      expect(store.get().y).toBe("world");
    });
  });

  describe("getItem()", () => {
    it("should return the typed value for a stored key", () => {
      const store = createStore("key-getitem-value", { color: "red", size: 10 });
      store.set({ color: "blue", size: 10 });
      expect(store.getItem("color")).toBe("blue");
    });

    it("should return undefined for a key not present in the stored state", () => {
      const store = createStore<{ color?: string }>("key-getitem-undef", {});
      expect(store.getItem("color")).toBeUndefined();
    });
  });

  describe("setItem()", () => {
    it("should write a single key and return the full updated state", () => {
      const store = createStore("key-setitem-full", { a: 1, b: 2 });
      store.set({ a: 1, b: 2 });

      const next = store.setItem("a", 99);
      expect(next).toEqual({ a: 99, b: 2 });
    });

    it("should persist the change so subsequent reads reflect it", () => {
      const store = createStore("key-setitem-persist", { a: 1, b: 2 });
      store.set({ a: 1, b: 2 });
      store.setItem("b", 50);
      expect(store.get()).toEqual({ a: 1, b: 50 });
    });

    it("should not affect other keys when setting a single key", () => {
      const store = createStore("key-setitem-isolated", { a: 1, b: 2, c: 3 });
      store.set({ a: 1, b: 2, c: 3 });
      store.setItem("b", 99);
      const state = store.get();
      expect(state.a).toBe(1);
      expect(state.c).toBe(3);
    });
  });

  describe("removeItem()", () => {
    it("should only allow optional keys at type level", () => {
      const requiredStore = createStore<{ a: number; b: number }>("key-removeitem-required", {
        a: 1,
        b: 2,
      });

      // @ts-expect-error Required keys must not be removable from a typed store.
      requiredStore.removeItem("b");

      const optionalStore = createStore<{ a: number; b?: number }>("key-removeitem-optional", {
        a: 1,
        b: 2,
      });

      optionalStore.removeItem("b");
    });

    it("should remove a key and return the updated state without it", () => {
      const store = createStore<{ a: number; b?: number }>("key-removeitem-returns", {
        a: 1,
        b: 2,
      });
      store.set({ a: 1, b: 2 });

      const next = store.removeItem("b");
      expect(next).toEqual({ a: 1 });
    });

    it("should persist the removal so subsequent reads reflect it", () => {
      const store = createStore<{ a: number; b?: number }>("key-removeitem-persist", {
        a: 1,
        b: 2,
      });
      store.set({ a: 1, b: 2 });
      store.removeItem("b");
      expect("b" in store.get()).toBe(false);
    });
  });

  describe("clear()", () => {
    it("should remove the stored entry so subsequent reads return initialState", () => {
      const store = createStore("key-clear-fallback", { value: "stored" });
      store.set({ value: "changed" });
      store.clear();
      expect(store.get()).toEqual({ value: "stored" });
    });

    it("should warn and not throw when localStorage.removeItem throws", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new Error("SecurityError");
      });

      const store = createStore("key-clear-throws", { value: "x" });
      expect(() => store.clear()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to clear localStorage"), expect.anything());
    });
  });

  describe("validate option", () => {
    const isValidSchema = (raw: unknown): raw is { name: string } =>
      typeof raw === "object" && raw !== null && typeof (raw as Record<string, unknown>)["name"] === "string";

    it("should return the stored value when it passes the validator", () => {
      const store = createStore("key-validate-pass", { name: "default" }, { validate: isValidSchema });
      store.set({ name: "valid" });
      expect(store.get()).toEqual({ name: "valid" });
    });

    it("should fall back to initialState and warn when the validator rejects stored value", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      localStorage.setItem("key-validate-fail", JSON.stringify({ wrong: "shape" }));

      const store = createStore("key-validate-fail", { name: "default" }, { validate: isValidSchema });
      expect(store.get()).toEqual({ name: "default" });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("failed schema validation"));
    });

    it("should accept stored values without a validator", () => {
      const store = createStore("key-no-validate", { count: 0 });
      store.set({ count: 5 });
      expect(store.get()).toEqual({ count: 5 });
    });
  });
});
