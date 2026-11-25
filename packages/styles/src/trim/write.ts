import { randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";

/* How `chs build` and the Vite plugin replace a stylesheet: written to a
   temporary file beside it and renamed over it, so a write that fails partway
   leaves the previous file whole and a reader never sees half of one. */

/* A name anyone could guess, such as one from the process ID, let whoever can
   write to the target's folder plant a link there first, and the write went
   through it to a file the build was never given. The name is random, and the
   file is created with `wx`, which fails on any entry already there, a link
   included, so the file written is always one this build created. Everything
   after goes through the handle, never the name. */
export async function createTemporary(target: string): Promise<{ path: string; handle: fs.FileHandle }> {
  for (let attempt = 1; ; attempt += 1) {
    const name = `${target}.${randomBytes(8).toString("hex")}.tmp`;

    try {
      // oxlint-disable-next-line no-await-in-loop -- a name is tried only once the one before it is taken
      return { path: name, handle: await fs.open(name, "wx") };
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST" || attempt === 5) {
        throw error;
      }
    }
  }
}

/* Windows refuses to rename over a file another process holds open without
   delete sharing, which an antivirus scan or a dev server does for a moment
   after a write. The rename is retried briefly there; elsewhere it is atomic
   and fails only for a reason a retry does not fix. */
export async function replaceFile(from: string, to: string): Promise<void> {
  const busy = new Set(["EACCES", "EBUSY", "EPERM"]);

  for (let attempt = 1; ; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each attempt waits on the one before
      await fs.rename(from, to);
      return;
    } catch (error) {
      if (process.platform !== "win32" || attempt === 10 || !busy.has((error as { code?: string }).code ?? "")) {
        throw error;
      }

      // oxlint-disable-next-line no-await-in-loop -- the backoff between attempts
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
  }
}

/* Node.js's reason and code for a failed system call, without the paths its
   message names, which for a write are mostly the temporary file's: a name the
   user never gave and cannot find afterwards. Nothing for another error. */
export function systemReason(error: unknown): { reason: string; code: string } | undefined {
  const { code } = error as { code?: unknown };

  if (!(error instanceof Error) || typeof code !== "string" || !error.message.startsWith(`${code}: `)) {
    return undefined;
  }

  // As in "EACCES: permission denied, open '/srv/app.css.42.tmp'".
  return { reason: error.message.slice(code.length + 2).replace(/, \w+ '.*$/s, ""), code };
}
