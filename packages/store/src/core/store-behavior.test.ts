// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { cloudflareKvDriver } from "../cloudflare";
import { asyncMemoryDriver, createAsyncStore, createStore, localStorageDriver } from "../index";

interface Settings {
  count: number;
  nested: { enabled: boolean };
  nickname?: string;
}

const initialState: Settings = { count: 0, nested: { enabled: false }, nickname: "initial" };

afterEach(() => vi.restoreAllMocks());

describe.each([false, true])("failure recovery (async: %s)", (isAsync) => {
  function setup(get: () => unknown = () => initialState, onError = vi.fn()) {
    const set = vi.fn((_value: Settings) => true);
    const store = isAsync
      ? createAsyncStore({
          storageKey: "settings",
          initialState,
          onError,
          driver: {
            get: async () => get(),
            set: async (value: Settings) => set(value),
          },
        })
      : createStore({ storageKey: "settings", initialState, onError, driver: { get, set } });
    return { store, set, onError };
  }

  it.each(["patch", "setItem", "removeItem"] as const)(
    "skips %s after a failed read and returns an isolated fallback",
    async (method) => {
      const cause = new Error("temporarily offline");
      const { store, set, onError } = setup(() => {
        throw cause;
      });
      const result = await (method === "patch"
        ? store.patch({ count: 2 })
        : method === "setItem"
          ? store.setItem("count", 2)
          : store.removeItem("nickname"));
      expect(result).toEqual(initialState);
      result.nested.enabled = true;
      expect(initialState.nested.enabled).toBe(false);
      expect(set).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "store.read_failed", cause }));
    },
  );

  it("reports missing clear and leaves the record in place", async () => {
    const { store, onError, set } = setup();
    await store.clear();
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "store.clear_unsupported" }));
    expect(await store.get()).toEqual(initialState);
    expect(set).not.toHaveBeenCalled();
  });

  it("reports a frozen thrown error once", async () => {
    const cause = Object.freeze(new Error("frozen"));
    const { store, onError } = setup(() => {
      throw cause;
    });
    expect(await store.get()).toEqual(initialState);
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "store.read_failed", cause }));
  });

  it("reports the same thrown object independently for two stores", async () => {
    const cause = new Error("shared");
    const get = () => {
      throw cause;
    };
    const first = setup(get);
    const second = setup(get);
    await first.store.get();
    await second.store.get();
    for (const { onError } of [first, second]) {
      expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "store.read_failed", cause }));
    }
  });

  it.each(["read", "parse", "validation", "write-false", "write-throw", "clear", "clear-unsupported"])(
    "propagates a throwing onError once for %s",
    async (failure) => {
      const callbackError = new Error("callback failed");
      const onError = vi.fn(() => {
        throw callbackError;
      });
      const get = () => {
        if (failure === "read") {
          throw new Error("read failed");
        }
        if (failure === "parse") {
          throw new SyntaxError("bad JSON");
        }
        return initialState;
      };
      const set = () => {
        if (failure === "write-throw") {
          throw new Error("write failed");
        }
        return false;
      };
      const clear =
        failure === "clear-unsupported"
          ? undefined
          : () => {
              throw new Error("clear failed");
            };
      const options = {
        storageKey: "settings",
        initialState,
        onError,
        validate: failure === "validation" ? (_raw: unknown): _raw is Settings => false : undefined,
      };
      const store = isAsync
        ? createAsyncStore({
            ...options,
            driver: { get: async () => get(), set: async () => set(), clear: clear && (async () => clear()) },
          })
        : createStore({ ...options, driver: { get, set, clear } });
      const operation = async () =>
        failure.startsWith("write")
          ? store.set(initialState)
          : failure.startsWith("clear")
            ? store.clear()
            : store.get();
      await expect(operation()).rejects.toBe(callbackError);
      expect(onError).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["parse", "validation"])("still overwrites %s failures with fallback plus patch", async (failure) => {
    const onError = vi.fn();
    const get = () => {
      if (failure === "parse") {
        throw new SyntaxError("bad JSON");
      }
      return 5;
    };
    const set = vi.fn((_value: Settings) => true);
    const options = {
      storageKey: "settings",
      initialState,
      onError,
      validate: (raw: unknown): raw is Settings => typeof raw === "object" && raw !== null,
    };
    const store = isAsync
      ? createAsyncStore({ ...options, driver: { get: async () => get(), set: async (value: Settings) => set(value) } })
      : createStore({ ...options, driver: { get, set } });
    const expected = { ...initialState, count: 2 };
    expect(await store.patch({ count: 2 })).toEqual(expected);
    expect(set).toHaveBeenCalledExactlyOnceWith(expected);
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: `store.${failure}_failed` }));
  });
});

describe.each([false, true])("record shape (async: %s)", (isAsync) => {
  function setup(stored: unknown, onError = vi.fn(), validate?: (raw: unknown) => raw is Settings) {
    let data = stored;
    const driver = { get: () => data, set: (value: Settings) => ((data = structuredClone(value)), true) };
    const store = isAsync
      ? createAsyncStore({
          storageKey: "settings",
          initialState,
          onError,
          validate,
          driver: { get: async () => driver.get(), set: async (value: Settings) => driver.set(value) },
        })
      : createStore({ storageKey: "settings", initialState, onError, validate, driver });
    return { store, onError, stored: () => data };
  }

  it.each([
    ["string", "hi"],
    ["number", 5],
    ["boolean", true],
  ])("reports a stored %s as a validation failure without a validator", async (_kind, value) => {
    const { store, onError, stored } = setup(value);
    expect(await store.get()).toEqual(initialState);
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "store.validation_failed" }));
    expect(await store.patch({ count: 2 })).toEqual({ ...initialState, count: 2 });
    expect(stored()).toEqual({ ...initialState, count: 2 });
  });
  it("ignores undefined values in patch so required fields stay present", async () => {
    const { store, stored } = setup({ count: 1, nested: { enabled: true } });
    const count: number | undefined = undefined;
    const result = await store.patch({ count, nested: { enabled: false } });
    expect(result).toEqual({ count: 1, nested: { enabled: false } });
    expect(Object.hasOwn(result, "count")).toBe(true);
    expect(stored()).toEqual({ count: 1, nested: { enabled: false } });
  });
});

describe.each([false, true])("empty storage key (async: %s)", (isAsync) => {
  it("reads and writes under the empty key", async () => {
    const onError = vi.fn();
    const options = { storageKey: "", initialState, onError };
    const store = isAsync
      ? createAsyncStore({ ...options, driver: cloudflareKvDriver<Settings>({ kvNamespace: kvNamespace() }) })
      : createStore({ ...options, driver: localStorageDriver<Settings>() });
    expect(await store.patch({ count: 3 })).toEqual({ ...initialState, count: 3 });
    expect(await store.get()).toEqual({ ...initialState, count: 3 });
    expect(onError).not.toHaveBeenCalled();
  });
});

function kvNamespace() {
  const records = new Map<string, string>();
  return {
    get: async (key: string) => records.get(key) ?? null,
    put: async (key: string, value: string) => void records.set(key, value),
    delete: async (key: string) => void records.delete(key),
  };
}

describe("async input snapshots", () => {
  it.each(["set", "patch", "setItem"] as const)("snapshots %s inputs before the queue runs", async (method) => {
    const store = createAsyncStore({ storageKey: "settings", initialState, driver: asyncMemoryDriver<Settings>() });
    const input = structuredClone(initialState);
    const pending =
      method === "set"
        ? store.set(input)
        : method === "patch"
          ? store.patch(input)
          : store.setItem("nested", input.nested);
    input.nested.enabled = true;
    await pending;
    expect((await store.get()).nested.enabled).toBe(false);
  });
});

describe("localStorage reporting", () => {
  it("reports validation to the store callback with an explicit driver", () => {
    localStorage.setItem("validation-routing", "5");
    const onError = vi.fn();
    const store = createStore({
      storageKey: "validation-routing",
      initialState,
      driver: localStorageDriver("validation-routing"),
      onError,
      validate: (raw: unknown): raw is Settings => typeof raw === "object" && raw !== null,
    });
    expect(store.get()).toEqual(initialState);
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "store.validation_failed" }));
  });
  it.each(["get", "set", "clear"] as const)("reports frozen %s errors once without changing the cause", (method) => {
    const cause = Object.freeze(new Error("storage failed"));
    const onError = vi.fn();
    const name = method === "get" ? "getItem" : method === "set" ? "setItem" : "removeItem";
    vi.spyOn(Storage.prototype, name).mockImplementation((key: string) => {
      if (key !== "") {
        throw cause;
      }
      return null;
    });
    const store = createStore({ storageKey: "settings", initialState, onError });
    const result = method === "set" ? store.set(initialState) : method === "clear" ? store.clear() : store.get();
    expect(result).toEqual(method === "set" ? false : method === "clear" ? undefined : initialState);
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ cause }));
  });

  it("reports a reused localStorage error to both stores", () => {
    const cause = new Error("quota");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw cause;
    });
    for (const storageKey of ["first", "second"]) {
      const onError = vi.fn();
      createStore({ storageKey, initialState, onError }).set(initialState);
      expect(onError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "store.write_failed", cause }));
    }
  });

  it.each([false, true])("propagates callback errors once with an explicit driver: %s", (isExplicit) => {
    const callbackError = new Error("callback failed");
    const onError = vi.fn(() => {
      throw callbackError;
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const store = createStore({
      storageKey: "settings",
      initialState,
      onError,
      driver: isExplicit ? localStorageDriver("settings") : undefined,
    });
    expect(() => store.set(initialState)).toThrow(callbackError);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
