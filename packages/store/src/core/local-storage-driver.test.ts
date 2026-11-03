import { afterEach, expect, it, vi } from "vitest";

import { localStorageDriver } from "../index";

afterEach(() => vi.unstubAllGlobals());

it("caches availability for one storage object and probes a replacement", () => {
  const getItem = vi.fn(() => null);
  vi.stubGlobal("localStorage", { getItem });
  const driver = localStorageDriver("settings");
  driver.get();
  driver.get();
  expect(getItem.mock.calls).toEqual([[""], ["settings"], ["settings"]]);

  const replacement = vi.fn(() => null);
  vi.stubGlobal("localStorage", { getItem: replacement });
  driver.get();
  expect(replacement.mock.calls).toEqual([[""], ["settings"]]);
});

it("keeps an unavailable probe cached until the storage object changes", () => {
  const getItem = vi.fn(() => {
    throw new Error("access denied");
  });
  vi.stubGlobal("localStorage", { getItem });
  const driver = localStorageDriver("settings");
  expect(driver.get()).toBeNull();
  expect(driver.get()).toBeNull();
  expect(getItem).toHaveBeenCalledTimes(1);

  vi.stubGlobal("localStorage", { getItem: () => '{"count":2}' });
  expect(driver.get()).toEqual({ count: 2 });
});

it("falls back when reading the localStorage property throws", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("Access denied", "SecurityError");
    },
  });
  try {
    expect(localStorageDriver("settings").get()).toBeNull();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  }
});
