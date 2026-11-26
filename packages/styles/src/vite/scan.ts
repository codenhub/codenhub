import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { findFiles, readFiles, UnmatchedEntryError } from "@codenhub/scan";

import { findClasses, isPackageCopy } from "../trim";
import { cannotRead, pluginError } from "./errors";
import { ignoreFilesAbove, isInside, isWalked, unreadable, walkProject } from "./ignore";

export interface ScanOptions {
  // The Vite root, as the system resolves it.
  root: string;
  // Folders under the root never read: build output and caches.
  skip: readonly string[];
  // The `content` option: files read whatever the walk leaves out.
  content: readonly string[];
  // The class names the purge may drop, the only words worth keeping.
  known: ReadonlySet<string>;
  shipped: ReadonlyMap<number, readonly string[]>;
}

/* The extensions Vite processes as CSS. A property value is a word too, and
   `border: 1px solid` would keep `.solid`. */
const STYLESHEET = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/i;
// How much of a file git reads to call it binary.
const BINARY_PROBE = 8000;
// How long a file reported empty is waited on for its text: 10 polls, 10 ms apart.
const WRITE_POLLS = 10;
const WRITE_POLL_MS = 10;
const NONE: ReadonlySet<string> = new Set();

export type FileEvent = "create" | "update" | "delete";

/* The classes each file names, and how many files name each class, so a
   change re-reads that file alone and still knows whether the project as a
   whole gained or lost a class. */
export class ProjectScan {
  readonly #options: ScanOptions;
  readonly #skip: ReadonlySet<string>;
  #named: Set<string> = new Set();
  #byFile = new Map<string, ReadonlySet<string>>();
  #counts = new Map<string, number>();

  constructor(options: ScanOptions) {
    this.#options = options;
    // The root itself is always read, even when an output folder is the root.
    this.#skip = new Set(
      options.skip.map((folder) => path.resolve(folder)).filter((folder) => folder !== options.root),
    );
  }

  // Whether the project names a different set of classes than before. What was read stays until every file is read again.
  async scanAll(): Promise<boolean> {
    const named = findNamed(this.#options.content, this.#options.root);
    const byFile = new Map<string, ReadonlySet<string>>();

    for (const file of named) {
      // oxlint-disable-next-line no-await-in-loop -- one file at a time, so a large project holds one file's text
      byFile.set(file, await this.#classesIn(readNamed(file)));
    }
    for (const file of walkProject({ root: this.#options.root, skip: this.#skip })) {
      if (!named.has(file) && !STYLESHEET.test(file)) {
        // oxlint-disable-next-line no-await-in-loop -- as above
        byFile.set(file, await this.#classesIn(readWalked(file)));
      }
    }

    const counts = new Map<string, number>();

    for (const names of byFile.values()) {
      for (const name of names) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }

    const isChanged = counts.size !== this.#counts.size || [...counts.keys()].some((name) => !this.#counts.has(name));

    this.#named = named;
    this.#byFile = byFile;
    this.#counts = counts;

    return isChanged;
  }

  /* Whether a file created, changed, or deleted since changes the set of
     classes the project names. A file the scan does not read changes
     nothing, and a `.gitignore` the walk reads changes which files it reads,
     so every file is read again. */
  async change(file: string, event: FileEvent): Promise<boolean> {
    const { root } = this.#options;

    if (path.basename(file) === ".gitignore" && (isInside(root, file) || ignoreFilesAbove(root).includes(file))) {
      return this.scanAll();
    }
    if (event === "delete") {
      this.#named.delete(file);

      return this.#record(file, undefined);
    }
    if (this.#named.has(file) || (event === "create" && this.#isNamedNow(file))) {
      this.#named.add(file);
      await untilWritten(file);

      return this.#record(file, await this.#classesIn(readNamed(file)));
    }
    if (STYLESHEET.test(file) || !isWalked({ root, skip: this.#skip }, file)) {
      return false;
    }
    await untilWritten(file);

    return this.#record(file, await this.#classesIn(readWalked(file)));
  }

  classes(): Set<string> {
    return new Set(this.#counts.keys());
  }

  // The files read, which a build in watch mode watches, each `.gitignore` above the root included.
  files(): string[] {
    return [...this.#byFile.keys(), ...ignoreFilesAbove(this.#options.root).filter((file) => fs.existsSync(file))];
  }

  // Whether a `content` entry names the file created, resolved again since a glob may now match it.
  #isNamedNow(file: string): boolean {
    const { content, root } = this.#options;

    return content.length > 0 && findFiles(content, { cwd: root, skipNodeModules: true }).includes(file);
  }

  // Whether giving the file these classes, or none once it is gone, adds a class no other file names or removes the last file naming one.
  #record(file: string, names: ReadonlySet<string> | undefined): boolean {
    const before = this.#byFile.get(file) ?? NONE;
    const after = names ?? NONE;
    let isChanged = false;

    for (const name of before) {
      if (!after.has(name)) {
        const count = (this.#counts.get(name) ?? 1) - 1;

        isChanged ||= count === 0;
        if (count === 0) {
          this.#counts.delete(name);
        } else {
          this.#counts.set(name, count);
        }
      }
    }
    for (const name of after) {
      if (!before.has(name)) {
        const count = (this.#counts.get(name) ?? 0) + 1;

        isChanged ||= count === 1;
        this.#counts.set(name, count);
      }
    }
    if (names === undefined) {
      this.#byFile.delete(file);
    } else {
      this.#byFile.set(file, names);
    }

    return isChanged;
  }

  async #classesIn(text: string | undefined): Promise<ReadonlySet<string>> {
    if (text === undefined || (await isPackageCopy(text, this.#options.known, this.#options.shipped))) {
      return NONE;
    }

    return new Set(findClasses(text, this.#options.known));
  }
}

/* The files the `content` entries name, each resolved from the root with the
   command's rules: a wildcard stays out of `node_modules` unless the entry
   names it, and an entry that names no file fails, naming it. */
function findNamed(entries: readonly string[], root: string): Set<string> {
  const files = new Set<string>();

  for (const entry of entries) {
    let matched: string[];

    try {
      matched = findFiles([entry], { cwd: root, failOnUnmatched: true, failOnUnreadable: true, skipNodeModules: true });
    } catch (error) {
      if (!(error instanceof UnmatchedEntryError)) {
        throw cannotRead({ file: (error as { path?: string }).path ?? entry, error, remedy: "change content" });
      }
      // The scanner's advice for no cause it can name is to run from the project root, which a plugin does not choose.
      throw pluginError(
        error.reason === undefined
          ? `content "${entry}" matches no file in ${root}; check the path, which is read from the Vite root.`
          : `content ${error.message}`,
      );
    }
    for (const file of matched) {
      files.add(file);
    }
  }

  return files;
}

// A file a `content` entry names, read as the command reads it, or nothing when it was deleted since.
function readNamed(file: string): string | undefined {
  try {
    for (const text of readFiles([file], { failOnUnreadable: true })) {
      return text;
    }

    return undefined;
  } catch (error) {
    throw cannotRead({ file, error, remedy: "remove it from content" });
  }
}

// A file's text, or nothing for a binary file or one deleted since the walk found it.
function readWalked(file: string): string | undefined {
  try {
    if (isBinary(file)) {
      return undefined;
    }
    // Decoded as the command decodes content. An existing path is read as it is, never as a glob.
    for (const text of readFiles([file], { failOnUnreadable: true })) {
      return text;
    }

    return undefined;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return undefined;
    }

    throw unreadable(file, error);
  }
}

/* Writing a file empties it before its text lands, and the watcher can report
   the change in between. Chokidar 3, which Vite 5 to 8 bundle, drops a second
   change within 50 ms, so the write that follows may never be reported, and
   the file's classes would be lost until it changes again. A file that is
   empty is waited on until its modified time moves, for at most 100 ms, as
   Vite's own `read()` waits (vitejs/vite#610). A file that cannot be read is
   left to the read, which reports it. */
async function untilWritten(file: string): Promise<void> {
  const statOf = (): fs.Stats | undefined => {
    try {
      return fs.statSync(file);
    } catch {
      return undefined;
    }
  };
  const before = statOf();

  if (before === undefined || before.size > 0) {
    return;
  }
  for (let poll = 0; poll < WRITE_POLLS; poll += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each poll waits on the one before
    await delay(WRITE_POLL_MS);
    if (statOf()?.mtimeMs !== before.mtimeMs) {
      return;
    }
  }
}

/* By git's rule, a file with a NUL byte in its first bytes, unless it starts
   with a UTF-16 byte order mark. Only those bytes are read, so a video costs
   nothing. */
function isBinary(file: string): boolean {
  const head = Buffer.alloc(BINARY_PROBE);
  const handle = fs.openSync(file, "r");
  let length: number;

  try {
    length = fs.readSync(handle, head, 0, BINARY_PROBE, 0);
  } finally {
    fs.closeSync(handle);
  }

  const isUtf16 = (head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff);

  return !isUtf16 && head.subarray(0, length).includes(0);
}
