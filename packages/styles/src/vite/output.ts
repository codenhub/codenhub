import fs from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";

import { createTemporary, replaceFile, systemReason } from "../trim";
import { pluginError } from "./errors";

/* The trimmed stylesheets live in Vite's cache folder, written as the command
   writes its output: to a temporary file renamed over the last one, so another
   server or build reading it never sees half a file. */

const ADVICE = "fix that, or set cacheDir to a folder you can write to";

// The folder created, as the system resolves it, so the alias names the file Vite loads.
export function createOutputFolder(folder: string): string {
  try {
    fs.mkdirSync(path.join(folder, "aesthetics"), { recursive: true });

    return fs.realpathSync.native(folder);
  } catch (error) {
    throw cannotWrite(folder, error);
  }
}

/* Whether the file changed. One whose bytes are already these is not
   written, so Vite sees no change and two servers on one project do not
   rewrite each other's. The folder is created again, in case the cache was
   deleted while the server runs. */
export async function writeIfChanged(file: string, css: string): Promise<boolean> {
  try {
    if ((await readOrNothing(file)) === css) {
      return false;
    }
    await fsp.mkdir(path.dirname(file), { recursive: true });

    const created = await createTemporary(file);

    try {
      try {
        await created.handle.writeFile(css);
      } finally {
        await created.handle.close();
      }
      await replaceFile(created.path, file);
    } catch (error) {
      // Best effort: the error worth reporting is the write's.
      await fsp.rm(created.path, { force: true }).catch(() => undefined);
      throw error;
    }

    return true;
  } catch (error) {
    throw cannotWrite(file, error);
  }
}

async function readOrNothing(file: string): Promise<string | undefined> {
  try {
    return await fsp.readFile(file, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function cannotWrite(target: string, error: unknown): Error {
  const system = systemReason(error);
  let reason = error instanceof Error ? error.message : String(error);

  if (system !== undefined) {
    reason = `${system.reason} (${system.code})`;
  }

  return pluginError(`cannot write to "${target}": ${reason}; ${ADVICE}.`, error);
}
