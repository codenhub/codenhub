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
  /**
   * Throw on a file that cannot be read, instead of skipping it: Node.js's own error when it names
   * the file, or one naming the file with Node.js's error as its `cause` when it does not.
   */
  failOnUnreadable?: boolean;
  /**
   * Keep a glob out of every `node_modules` folder, unless the entry itself names `node_modules`.
   * A literal path is read wherever it is.
   */
  skipNodeModules?: boolean;
}

/**
 * Why an entry named no file, when a likelier cause than a wrong path is known: it names a folder,
 * its wildcard matched only files {@link ScanOptions.skipNodeModules} left out, or it holds a `[`,
 * which a glob reads as the start of a set of characters, and matches files once that is escaped.
 */
export type UnmatchedReason = "folder" | "nodeModules" | "bracket";

/** An entry that names no file, thrown when {@link ScanOptions.failOnUnmatched} is on. */
export class UnmatchedEntryError extends Error {
  readonly entry: string;
  readonly cwd: string;
  readonly reason: UnmatchedReason | undefined;

  constructor(entry: string, cwd: string, reason?: UnmatchedReason) {
    super(describeUnmatched(entry, cwd, reason));
    this.name = "UnmatchedEntryError";
    this.entry = entry;
    this.cwd = cwd;
    this.reason = reason;
  }
}

/* "Check the path" sends a reader to fix a path that may be right, so a cause
   more likely than a typo is named instead, with the entry that would work. */
function describeUnmatched(entry: string, cwd: string, reason: UnmatchedReason | undefined): string {
  const unmatched = `"${entry}" matches no file in ${cwd}`;

  switch (reason) {
    case "folder":
      return `"${entry}" is a folder in ${cwd}, not a file; name the files in it, as in "${entry.replace(/[\\/]+$/, "")}/**/*".`;
    case "nodeModules":
      return `${unmatched}; a * or ** does not enter node_modules, so name the folder to read one, as in "node_modules/<package>/**/*".`;
    case "bracket":
      // `\[` escapes a bracket on POSIX only: Windows reads the backslash as a separator. `[[]` is a set of one `[` on both.
      return `${unmatched}; a [ in a glob starts a set of characters, so write [[] for a bracket in a name, as in "${escapeBrackets(entry)}".`;
    default:
      return `${unmatched}; check the path, or run from the project root.`;
  }
}

// A `[[]` is a bracket escaped already, and escaping it again would make it `[[][[]]`.
function escapeBrackets(entry: string): string {
  return entry.replaceAll(/\[\[\]|\[/g, "[[]");
}

// `(` starts every extglob, such as `@(a|b)`, the one glob form with none of the other characters.
const GLOB_CHARACTERS = /[*?[\]{}(]/;
// A brace or extglob alternative names a folder too, as in `{src,node_modules/ui}/**`.
const NODE_MODULES_SEGMENT = /(^|[\\/{,(|])node_modules([\\/},)|]|$)/;

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
    const skipNodeModules = options.skipNodeModules === true && !NODE_MODULES_SEGMENT.test(entry);
    const named = resolveEntry(entry, cwd, { isStrict: options.failOnUnmatched === true, skipNodeModules });

    if (named.length === 0 && options.failOnUnmatched) {
      throw new UnmatchedEntryError(entry, cwd, reasonUnmatched(entry, cwd, skipNodeModules));
    }
    for (const file of named) {
      files.add(file);
    }
  }

  return [...files];
}

/**
 * Yields the text of each file the entries name: UTF-16 after a UTF-16 byte order mark, and UTF-8
 * otherwise, without the mark.
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
      text = decode(fs.readFileSync(file));
    } catch (error) {
      if (failOnUnreadable) {
        throw namingFile(error, file);
      }
      continue;
    }
    yield text;
  }
}

/* A file is UTF-8 unless it starts with a UTF-16 byte order mark, which
   Windows PowerShell 5.1 writes for `"card" > safelist.txt`: read as UTF-8,
   every other byte of that is a NUL, and no word in it is found. The mark is
   dropped, as UTF-8's is. Without one, a file is UTF-8. */
function decode(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.toString("utf16le", 2);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    // Node.js has no UTF-16 BE decoder, so the pairs are swapped to LE; an odd last byte is dropped, as LE drops it.
    const body = Buffer.from(bytes.subarray(2, bytes.length - (bytes.length % 2)));

    return body.swap16().toString("utf16le");
  }

  return bytes.toString("utf8", bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0);
}

/* Node.js names the path in a system error, such as ENOENT or EACCES, but not
   in the one for a file too long for a string, which would leave a reader of a
   broad glob unable to tell which file to leave out. */
function namingFile(error: unknown, file: string): unknown {
  if (!(error instanceof Error) || error.message.includes(file)) {
    return error;
  }
  return new Error(`${file}: ${error.message}`, { cause: error });
}

const matchers = new Map<string, RegExp>();

/**
 * Yields the words in text, one at a time: the runs of characters a word may hold. Lazy, so a
 * large file is never held as an array of every word in it, beside the text itself.
 *
 * @param wordCharacters - The body of a regular expression character class, such as `\w:-`.
 * @yields Each word, in the order it appears.
 */
export function* splitWords(text: string, wordCharacters: string): Generator<string, void, undefined> {
  let matcher = matchers.get(wordCharacters);

  if (matcher === undefined) {
    // A leading `^` is one of the characters, not a negation.
    matcher = new RegExp(`[${wordCharacters.startsWith("^") ? "\\" : ""}${wordCharacters}]+`, "g");
    matchers.set(wordCharacters, matcher);
  }

  // `matchAll` iterates a copy of the expression, so the shared one keeps no position.
  for (const [word] of text.matchAll(matcher)) {
    yield word;
  }
}

function resolveEntry(
  entry: string,
  cwd: string,
  { isStrict, skipNodeModules }: { isStrict: boolean; skipNodeModules: boolean },
): string[] {
  try {
    const literal = path.resolve(cwd, entry);

    if (fs.existsSync(literal)) {
      return fs.statSync(literal).isFile() ? [literal] : [];
    }
    if (!GLOB_CHARACTERS.test(entry)) {
      return [];
    }

    return fs
      .globSync(entry, { cwd, exclude: skipNodeModules ? isNodeModules : undefined })
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

/* Run only once an entry has failed, so the second walk a wildcard takes to
   look inside node_modules costs nothing on a build that succeeds. */
function reasonUnmatched(entry: string, cwd: string, skipNodeModules: boolean): UnmatchedReason | undefined {
  try {
    if (fs.statSync(path.resolve(cwd, entry), { throwIfNoEntry: false })?.isDirectory()) {
      return "folder";
    }
    if (skipNodeModules && GLOB_CHARACTERS.test(entry)) {
      const all = fs.globSync(entry, { cwd }).map((match) => path.resolve(cwd, match));

      if (all.some(isFileOrUnknown)) {
        return "nodeModules";
      }
    }
  } catch {
    // The entry's own failure is the one reported; a cause that cannot be checked is left out.
  }

  // Only an entry the escape makes match a file: one that names nothing either way has a wrong path.
  const escaped = escapeBrackets(entry);

  return escaped !== entry && resolveEntry(escaped, cwd, { isStrict: false, skipNodeModules }).length > 0
    ? "bracket"
    : undefined;
}

// Called for each folder the walk would enter too, so it never descends into one.
function isNodeModules(match: string): boolean {
  return path.basename(match) === "node_modules";
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
