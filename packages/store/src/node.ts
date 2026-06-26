import * as fs from "node:fs";
import * as path from "node:path";

import type { AsyncStorageDriver, StorageDriver } from "./index";

/**
 * Options for configuring local filesystem JSON storage drivers.
 */
export interface NodeJsonFileDriverOptions {
  /**
   * The absolute or relative path to the JSON file where data is persisted.
   */
  filePath: string;
}

/**
 * A synchronous storage driver that persists data to a local JSON file.
 *
 * Suitable for command-line tools or backend applications running in Node.js.
 * If file read/write operations fail or the JSON is invalid, the driver throws an error
 * (e.g. `SyntaxError` for malformed JSON, or filesystem errors), which is caught
 * and handled by the store.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param options - Configuration options containing the file path.
 * @returns A synchronous storage driver compatible with `createStore`.
 */
export function nodeJsonFileDriver<TSchema extends object>(options: NodeJsonFileDriverOptions): StorageDriver<TSchema> {
  const { filePath } = options;

  return {
    get(): unknown {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const raw = fs.readFileSync(filePath, "utf8");
      if (!raw.trim()) {
        return null;
      }
      return JSON.parse(raw);
    },
    set(value: TSchema): boolean {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
      return true;
    },
    clear(): void {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
    },
  };
}

/**
 * An asynchronous storage driver that persists data to a local JSON file.
 *
 * Uses non-blocking promise-based filesystem operations.
 * If file access/write fails or the JSON is invalid, the driver throws or rejects
 * with an error (e.g. `SyntaxError` for malformed JSON, or filesystem errors),
 * which is caught and handled by the store.
 *
 * @typeParam TSchema - Object shape persisted by the store.
 * @param options - Configuration options containing the file path.
 * @returns An asynchronous storage driver compatible with `createAsyncStore`.
 */
export function nodeAsyncJsonFileDriver<TSchema extends object>(
  options: NodeJsonFileDriverOptions,
): AsyncStorageDriver<TSchema> {
  const { filePath } = options;

  return {
    async get(): Promise<unknown> {
      try {
        await fs.promises.access(filePath);
      } catch {
        return null;
      }
      const raw = await fs.promises.readFile(filePath, "utf8");
      if (!raw.trim()) {
        return null;
      }
      return JSON.parse(raw);
    },
    async set(value: TSchema): Promise<boolean> {
      const dir = path.dirname(filePath);
      try {
        await fs.promises.access(dir);
      } catch {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      await fs.promises.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
      return true;
    },
    async clear(): Promise<void> {
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
          throw error;
        }
      }
    },
  };
}
