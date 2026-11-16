/* The default export rather than a named `globSync`: a Node.js release without
   it still loads this module, so a command that inlines it reaches its own
   version check and can name both versions. A named import of a missing export
   fails at load, before any code runs. */
import fs from "node:fs";
import path from "node:path";

/** How entries are resolved and read. */
export interface ScanOptions {
  /** The folder relative entries are read from. Defaults to the working directory. */
  cwd?: string;
  /** Throw an {@link UnmatchedEntryError} on an entry that names no file, instead of skipping it. */
  failOnUnmatched?: boolean;
  /** Throw Node.js's own error on a file that cannot be read, instead of skipping it. */
  failOnUnreadable?: boolean;
}

/** An entry that names no file, thrown when {@link ScanOptions.failOnUnmatched} is on. */
export class UnmatchedEntryError extends Error {
  readonly entry: string;
  readonly cwd: string;

  constructor(entry: string, cwd: string) {
    super(`"${entry}" matches no file in ${cwd}; check the path, or run from the project root.`);
    this.name = "UnmatchedEntryError";
    this.entry = entry;
    this.cwd = cwd;
  }
}

// `(` starts every extglob, such as `@(a|b)`, the one glob form with none of the other characters.
const GLOB_CHARACTERS = /[*?[\]{}(]/;

/**
 * Resolves entries into the files they name, as absolute paths, each listed once.
 *
 * An entry is tried as a literal path first, so a real file whose name holds a bracket, such as
 * `app/[id]/page.tsx`, is read rather than taken as a pattern. Only when no such file exists is it
 * expanded as a glob. Folders are never listed.
 */
export function findFiles(entries: Iterable<string>, options: ScanOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const files = new Set<string>();

  for (const entry of entries) {
    const named = resolveEntry(entry, cwd, options.failOnUnmatched === true);

    if (named.length === 0 && options.failOnUnmatched) {
      throw new UnmatchedEntryError(entry, cwd);
    }
    for (const file of named) {
      files.add(file);
    }
  }

  return [...files];
}

/**
 * Yields the UTF-8 text of each file the entries name.
 *
 * Every entry is resolved when this is called, so an entry that names no file fails before any
 * reading. Files are then read one at a time, as they are asked for, so a glob that matches
 * thousands of files stays under the open-file limit.
 */
export function readFiles(entries: Iterable<string>, options: ScanOptions = {}): Generator<string, void, undefined> {
  return readEach(findFiles(entries, options), options.failOnUnreadable === true);
}

function* readEach(files: readonly string[], failOnUnreadable: boolean): Generator<string, void, undefined> {
  for (const file of files) {
    let text: string;

    try {
      text = fs.readFileSync(file, "utf8");
    } catch (error) {
      if (failOnUnreadable) {
        throw error;
      }
      continue;
    }
    yield text;
  }
}

const splitters = new Map<string, RegExp>();

/**
 * Splits text into words: the runs of characters a word may hold.
 *
 * @param wordCharacters - The body of a regular expression character class, such as `\w:-`.
 */
export function splitWords(text: string, wordCharacters: string): string[] {
  let splitter = splitters.get(wordCharacters);

  if (splitter === undefined) {
    splitter = new RegExp(`[^${wordCharacters}]+`);
    splitters.set(wordCharacters, splitter);
  }

  return text.split(splitter).filter((word) => word !== "");
}

function resolveEntry(entry: string, cwd: string, isStrict: boolean): string[] {
  try {
    const literal = path.resolve(cwd, entry);

    if (fs.existsSync(literal)) {
      return fs.statSync(literal).isFile() ? [literal] : [];
    }
    if (!GLOB_CHARACTERS.test(entry)) {
      return [];
    }

    return fs
      .globSync(entry, { cwd })
      .map((match) => path.resolve(cwd, match))
      .filter(isFileOrUnknown);
  } catch (error) {
    // Without strict resolution, a path that cannot be read or a pattern the platform rejects names no file.
    if (isStrict) {
      throw error;
    }
    return [];
  }
}

/* A link is followed, so a linked file is read and a linked folder is not, and
   a broken link names nothing. A path that cannot be checked is kept, so that
   reading it is what fails, under `failOnUnreadable`'s rule. */
function isFileOrUnknown(file: string): boolean {
  try {
    return fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true;
  } catch {
    return true;
  }
}
