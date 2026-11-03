import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createAsyncStore, createStore } from "../../src/index";
import { nodeAsyncJsonFileDriver, nodeJsonFileDriver } from "../../src/node";

describe.each([false, true])("real Node filesystem round-trip (async: %s)", (isAsync) => {
  it("persists a small record across stores and clears it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "store-"));
    try {
      const filePath = join(directory, "nested", "settings.json");
      const options = { storageKey: "settings", initialState: { theme: "light", enabled: false } };
      const create = () =>
        isAsync
          ? createAsyncStore({ ...options, driver: nodeAsyncJsonFileDriver<typeof options.initialState>({ filePath }) })
          : createStore({ ...options, driver: nodeJsonFileDriver<typeof options.initialState>({ filePath }) });
      const store = create();
      expect(await store.get()).toEqual(options.initialState);
      expect(await store.set({ theme: "dark", enabled: true })).toBe(true);
      expect(await create().get()).toEqual({ theme: "dark", enabled: true });
      await store.patch({ enabled: false });
      expect(await create().get()).toEqual({ theme: "dark", enabled: false });
      expect(await readdir(join(directory, "nested"))).toEqual(["settings.json"]);
      await store.clear();
      expect(await create().get()).toEqual(options.initialState);
      expect(await readdir(join(directory, "nested"))).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
