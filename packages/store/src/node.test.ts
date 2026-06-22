import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAsyncStore, createStore } from "./index";
import { nodeAsyncJsonFileDriver, nodeJsonFileDriver } from "./node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, "temp-test-dir");
const tempFile = path.join(tempDir, "store.json");

describe("Node Drivers", () => {
  beforeEach(() => {
    if (fs.existsSync(tempFile)) {
      fs.rmSync(tempFile, { force: true });
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempFile)) {
      fs.rmSync(tempFile, { force: true });
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
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
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(tempFile, "{invalid json}", "utf8");

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
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(tempFile, "{invalid json}", "utf8");

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
  });
});
