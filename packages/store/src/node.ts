import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { SET_STORAGE_KEY } from "./core/types";
import type { AsyncStorageDriver, StorageDriver } from "./core/types";

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
 * Suitable for small JSON-safe records in Node.js 24 or newer. Writes use a unique
 * same-directory temporary file and rename over the destination, cleaning up on failure.
 * Single-process use only: there is no cross-process locking.
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
  let key: string | undefined;

  return {
    get(): unknown {
      try {
        const raw = fs.readFileSync(filePath, "utf8");
        if (!raw.trim()) {
          return null;
        }
        return JSON.parse(raw);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    set(value: TSchema): boolean {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx" });
        fs.renameSync(temporaryPath, filePath);
      } finally {
        fs.rmSync(temporaryPath, { force: true });
      }
      return true;
    },
    clear(): void {
      try {
        fs.rmSync(filePath, { force: true });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
          throw error;
        }
      }
    },
    [SET_STORAGE_KEY](k: string) {
      if (key && key !== k) {
        throw new Error(
          `Driver instance cannot be shared across stores with different keys (already bound to "${key}", tried to bind to "${k}").`,
        );
      }
      key = k;
    },
  };
}

/**
 * An asynchronous storage driver that persists data to a local JSON file.
 *
 * Uses non-blocking promise-based filesystem operations on Node.js 24 or newer.
 * JSON-safe records are written to a unique same-directory temporary file, then renamed
 * over the destination; temporary files are cleaned up on failure. Single-process use only,
 * with no cross-process locking.
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
  let key: string | undefined;

  return {
    async get(): Promise<unknown> {
      try {
        const raw = await fs.promises.readFile(filePath, "utf8");
        if (!raw.trim()) {
          return null;
        }
        return JSON.parse(raw);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    async set(value: TSchema): Promise<boolean> {
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
      try {
        await fs.promises.writeFile(temporaryPath, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx" });
        await fs.promises.rename(temporaryPath, filePath);
      } finally {
        await fs.promises.rm(temporaryPath, { force: true });
      }
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
    [SET_STORAGE_KEY](k: string) {
      if (key && key !== k) {
        throw new Error(
          `Driver instance cannot be shared across stores with different keys (already bound to "${key}", tried to bind to "${k}").`,
        );
      }
      key = k;
    },
  };
}
