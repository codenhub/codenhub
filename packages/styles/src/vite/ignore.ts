import fs from "node:fs";
import path from "node:path";

import { cannotRead } from "./errors";

/* Which files under the Vite root the plugin reads: everything but what
   `.gitignore` excludes, `node_modules`, `.git`, and the folders it is told to
   skip. The `.gitignore` rules are git's, ported from its `dir.c` and
   `wildmatch.c`, so a project reads the same files whether git is installed or
   not; `tests/integration/vite-ignore.test.ts` holds them to git itself. Git
   matches bytes, so paths and patterns are matched as their UTF-8 bytes, each
   byte one character of a latin1 string: `?` matches one byte of `é`. */

export interface WalkOptions {
  // As the system resolves it.
  root: string;
  // Folders never read, by their resolved path.
  skip: ReadonlySet<string>;
}

const SKIPPED_FOLDERS = new Set(["node_modules", ".git"]);
const IGNORE_FILE = ".gitignore";
const UTF8_BOM = "ï»¿";

// Every file under the root the plugin reads, in no set order.
export function* walkProject(options: WalkOptions): Generator<string, void, undefined> {
  const entries = readFolder(options.root);

  yield* walkFolder(options, options.root, entries, IgnoreRules.forRoot(options.root));
}

// Whether the walk from `root` reaches `file`, which may have been created or deleted since.
export function isWalked(options: WalkOptions, file: string): boolean {
  if (!isInside(options.root, file)) {
    return false;
  }

  const relative = path.relative(options.root, file);

  let rules = IgnoreRules.forRoot(options.root);
  let folder = options.root;
  const names = relative.split(path.sep);

  for (const name of names.slice(0, -1)) {
    folder = path.join(folder, name);
    if (SKIPPED_FOLDERS.has(name) || options.skip.has(folder) || !isFolder(folder) || rules.isIgnored(folder, true)) {
      return false;
    }
    rules = rules.within(folder);
  }

  return !rules.isIgnored(file, false);
}

// Whether the file is below the folder, never the folder itself.
export function isInside(folder: string, file: string): boolean {
  const relative = path.relative(folder, file);

  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/* A folder is listed before its `.gitignore` is read, so a folder the walk
   cannot list fails naming the folder: on Unix, a file in it cannot be read
   either, and the `.gitignore` would be named instead. */
function* walkFolder(
  options: WalkOptions,
  folder: string,
  entries: readonly fs.Dirent[],
  rules: IgnoreRules,
): Generator<string, void, undefined> {
  for (const entry of entries) {
    const file = path.join(folder, entry.name);

    // A link to a folder is never followed, so a link cycle cannot hang the walk; a link to a file is read.
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name) && !options.skip.has(file) && !rules.isIgnored(file, true)) {
        const inner = readFolder(file);

        yield* walkFolder(options, file, inner, rules.within(file));
      }
    } else if ((entry.isFile() || (entry.isSymbolicLink() && isFile(file))) && !rules.isIgnored(file, false)) {
      yield file;
    }
  }
}

function readFolder(folder: string): fs.Dirent[] {
  try {
    return fs.readdirSync(folder, { withFileTypes: true });
  } catch (error) {
    throw unreadable(folder, error);
  }
}

// Not a link: a link to a folder is not followed.
function isFolder(folder: string): boolean {
  return fs.lstatSync(folder, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

function isFile(file: string): boolean {
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
}

// A file or folder the walk cannot read, which `.gitignore` can leave out.
export function unreadable(file: string, error: unknown): Error {
  return cannotRead({ file, error, remedy: "add it to .gitignore" });
}

interface Pattern {
  // The pattern without its `!` and trailing `/`.
  text: string;
  isNegated: boolean;
  isFolderOnly: boolean;
  // A pattern with no slash, but for a trailing one, which matches the last part of a path alone.
  isBaseName: boolean;
}

interface PatternList {
  // The folder of its `.gitignore`, relative to the repository, with a trailing slash unless it is the repository.
  base: string;
  patterns: Pattern[];
}

/* The patterns that apply in one folder: those of every `.gitignore` from the
   repository's folder down to it, the deepest last. */
class IgnoreRules {
  readonly #top: string;
  readonly #lists: readonly PatternList[];

  private constructor(top: string, lists: readonly PatternList[]) {
    this.#top = top;
    this.#lists = lists;
  }

  /* The rules in the root: its own `.gitignore` and those of the folders above
     it up to the one that holds `.git`, as git reads them; outside a
     repository, the root's alone. */
  static forRoot(root: string): IgnoreRules {
    const top = findRepository(root) ?? root;
    const folders: string[] = [];

    for (let folder = root; folder !== top; folder = path.dirname(folder)) {
      folders.unshift(folder);
    }

    let rules = new IgnoreRules(top, []).within(top);

    for (const folder of folders) {
      rules = rules.within(folder);
    }

    return rules;
  }

  // The rules inside `folder`, a child of the last folder these rules came from.
  within(folder: string): IgnoreRules {
    const patterns = readPatterns(path.join(folder, IGNORE_FILE));

    if (patterns.length === 0) {
      return this;
    }

    const relative = this.#relative(folder);

    return new IgnoreRules(this.#top, [...this.#lists, { base: relative === "" ? "" : `${relative}/`, patterns }]);
  }

  // git's `last_matching_pattern_from_lists`: the deepest file decides, and in it the last line that matches.
  isIgnored(file: string, isFolderPath: boolean): boolean {
    const name = this.#relative(file);
    const baseName = name.slice(name.lastIndexOf("/") + 1);

    for (let list = this.#lists.length - 1; list >= 0; list--) {
      const { base, patterns } = this.#lists[list];

      for (let index = patterns.length - 1; index >= 0; index--) {
        const pattern = patterns[index];

        if (pattern.isFolderOnly && !isFolderPath) {
          continue;
        }
        if (pattern.isBaseName ? matchBaseName(baseName, pattern) : matchPathName(name, base, pattern)) {
          return !pattern.isNegated;
        }
      }
    }

    return false;
  }

  #relative(file: string): string {
    return toBytes(path.relative(this.#top, file).split(path.sep).join("/"));
  }
}

function findRepository(root: string): string | undefined {
  for (let folder = root; ; folder = path.dirname(folder)) {
    // A worktree or a submodule has a `.git` file instead of a folder.
    if (fs.existsSync(path.join(folder, ".git"))) {
      return folder;
    }
    if (path.dirname(folder) === folder) {
      return undefined;
    }
  }
}

function toBytes(text: string): string {
  return Buffer.from(text, "utf8").toString("latin1");
}

// git's `add_patterns_from_buffer`.
function readPatterns(file: string): Pattern[] {
  let bytes: Buffer;

  try {
    bytes = fs.readFileSync(file);
  } catch (error) {
    const { code } = error as { code?: string };

    // Absent, or a folder by that name.
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") {
      return [];
    }

    throw unreadable(file, error);
  }

  let text = bytes.toString("latin1");

  if (text.startsWith(UTF8_BOM)) {
    text = text.slice(UTF8_BOM.length);
  }

  const patterns: Pattern[] = [];

  for (let line of text.split("\n")) {
    if (line.endsWith("\r")) {
      line = line.slice(0, -1);
    }
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const pattern = parsePattern(trimTrailingSpaces(line));

    if (pattern !== undefined) {
      patterns.push(pattern);
    }
  }

  return patterns;
}

// git's `trim_trailing_spaces`: spaces only, and not one escaped by a backslash.
function trimTrailingSpaces(line: string): string {
  let lastSpace = -1;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];

    if (character === " ") {
      if (lastSpace === -1) {
        lastSpace = index;
      }
    } else if (character === "\\" && index + 1 >= line.length) {
      return line;
    } else {
      if (character === "\\") {
        index++;
      }
      lastSpace = -1;
    }
  }

  return lastSpace === -1 ? line : line.slice(0, lastSpace);
}

// git's `parse_path_pattern`; a pattern left empty matches nothing, so it is dropped.
function parsePattern(line: string): Pattern | undefined {
  const isNegated = line.startsWith("!");
  let text = isNegated ? line.slice(1) : line;
  const isFolderOnly = text.endsWith("/");

  if (isFolderOnly) {
    text = text.slice(0, -1);
  }
  if (text === "") {
    return undefined;
  }

  return {
    text,
    isNegated,
    isFolderOnly,
    isBaseName: !text.includes("/"),
  };
}

// git's `is_glob_special`.
const GLOB_SPECIAL = new Set(["*", "?", "[", "\\"]);

// git's `match_basename`, which reaches `wildmatch` without `WM_PATHNAME`.
function matchBaseName(baseName: string, pattern: Pattern): boolean {
  return wildmatch(pattern.text, baseName, false);
}

// git's `match_pathname`: the pattern relative to the folder of its `.gitignore`.
function matchPathName(name: string, base: string, pattern: Pattern): boolean {
  if (!name.startsWith(base) || name.length <= base.length) {
    return false;
  }

  const text = pattern.text.startsWith("/") ? pattern.text.slice(1) : pattern.text;

  return wildmatch(text, name.slice(base.length), true);
}

const MATCH = 0;
const NO_MATCH = 1;
const ABORT_ALL = -1;
const ABORT_TO_STAR_STAR = -2;

type MatchResult = typeof MATCH | typeof NO_MATCH | typeof ABORT_ALL | typeof ABORT_TO_STAR_STAR;

function wildmatch(pattern: string, text: string, isPathName: boolean): boolean {
  return matchFrom({ pattern, text, isPathName }, 0, 0) === MATCH;
}

interface Wildmatch {
  pattern: string;
  text: string;
  // `WM_PATHNAME`: a wildcard does not match a slash, except as `**` between slashes.
  isPathName: boolean;
}

// git's `dowild`, with indexes for its pointers. An index past the end reads as `undefined`, its NUL.
function matchFrom(match: Wildmatch, patternStart: number, textStart: number): MatchResult {
  const { pattern, text, isPathName } = match;
  let p = patternStart;
  let t = textStart;

  for (; p < pattern.length; p++, t++) {
    let patternCharacter: string | undefined = pattern[p];
    let textCharacter: string | undefined = text[t];

    if (textCharacter === undefined && patternCharacter !== "*") {
      return ABORT_ALL;
    }

    switch (patternCharacter) {
      case "?": {
        if (isPathName && textCharacter === "/") {
          return NO_MATCH;
        }
        continue;
      }
      case "*": {
        let matchesSlash: boolean;

        if (pattern[++p] === "*") {
          const before = p - 2;

          while (pattern[++p] === "*") {
            // Any number of stars is two.
          }
          if (!isPathName) {
            matchesSlash = true;
          } else if (
            (before < patternStart || pattern[before] === "/") &&
            (p >= pattern.length || pattern[p] === "/" || (pattern[p] === "\\" && pattern[p + 1] === "/"))
          ) {
            // `**/` may match no folder at all: `a/**/b` matches `a/b`.
            if (pattern[p] === "/" && matchFrom(match, p + 1, t) === MATCH) {
              return MATCH;
            }
            matchesSlash = true;
          } else {
            matchesSlash = false;
          }
        } else {
          matchesSlash = !isPathName;
        }

        if (p >= pattern.length) {
          // A trailing `**` matches everything; a trailing `*` only what has no further slash.
          return !matchesSlash && text.includes("/", t) ? NO_MATCH : MATCH;
        }
        if (!matchesSlash && pattern[p] === "/") {
          // `*/` matches up to the next slash, which the loop then consumes.
          const slash = text.indexOf("/", t);

          if (slash === -1) {
            return NO_MATCH;
          }
          t = slash;
          break;
        }

        for (;;) {
          if (textCharacter === undefined) {
            break;
          }
          // Skip ahead to the next place the literal after the star could start.
          if (!GLOB_SPECIAL.has(pattern[p])) {
            patternCharacter = pattern[p];
            while ((textCharacter = text[t]) !== undefined && (matchesSlash || textCharacter !== "/")) {
              if (textCharacter === patternCharacter) {
                break;
              }
              t++;
            }
            if (textCharacter !== patternCharacter) {
              return matchesSlash ? ABORT_ALL : ABORT_TO_STAR_STAR;
            }
          }

          const matched = matchFrom(match, p, t);

          if (matched !== NO_MATCH) {
            if (!matchesSlash || matched !== ABORT_TO_STAR_STAR) {
              return matched;
            }
          } else if (!matchesSlash && textCharacter === "/") {
            return ABORT_TO_STAR_STAR;
          }
          textCharacter = text[++t];
        }

        return ABORT_ALL;
      }
      case "[": {
        const result = matchBracket(match, p, textCharacter as string);

        if (typeof result === "number") {
          return result;
        }
        p = result.end;
        continue;
      }
      case "\\": {
        patternCharacter = pattern[++p];
        if (textCharacter !== patternCharacter) {
          return NO_MATCH;
        }
        continue;
      }
      default: {
        if (textCharacter !== patternCharacter) {
          return NO_MATCH;
        }
        continue;
      }
    }
  }

  return t < text.length ? NO_MATCH : MATCH;
}

/* git's bracket expression, from the `[` at `start`: the index of its `]`
   when it matches the character, or the result that ends the match. */
function matchBracket(match: Wildmatch, start: number, textCharacter: string): MatchResult | { end: number } {
  const { pattern, isPathName } = match;
  const code = textCharacter.charCodeAt(0);
  let p = start + 1;
  let patternCharacter: string | undefined = pattern[p];

  if (patternCharacter === "^") {
    patternCharacter = "!";
  }

  const isNegated = patternCharacter === "!";

  if (isNegated) {
    patternCharacter = pattern[++p];
  }

  // The character before, for a range; empty after a range or a class, so `[a-c-e]` reads the second `-` literally.
  let previous = "";
  let isMatched = false;

  do {
    if (patternCharacter === undefined) {
      return ABORT_ALL;
    }
    if (patternCharacter === "\\") {
      patternCharacter = pattern[++p];
      if (patternCharacter === undefined) {
        return ABORT_ALL;
      }
      if (textCharacter === patternCharacter) {
        isMatched = true;
      }
    } else if (patternCharacter === "-" && previous !== "" && pattern[p + 1] !== undefined && pattern[p + 1] !== "]") {
      patternCharacter = pattern[++p];
      if (patternCharacter === "\\") {
        patternCharacter = pattern[++p];
        if (patternCharacter === undefined) {
          return ABORT_ALL;
        }
      }
      if (code <= patternCharacter.charCodeAt(0) && code >= previous.charCodeAt(0)) {
        isMatched = true;
      }
      patternCharacter = "";
    } else if (patternCharacter === "[" && pattern[p + 1] === ":") {
      const nameStart = p + 2;
      const close = pattern.indexOf("]", nameStart);

      if (close === -1) {
        return ABORT_ALL;
      }
      if (close - nameStart - 1 < 0 || pattern[close - 1] !== ":") {
        // No `:]`, so the `[` is a character of the set.
        if (textCharacter === "[") {
          isMatched = true;
        }
        patternCharacter = "[";
      } else {
        const inClass = CHARACTER_CLASSES.get(pattern.slice(nameStart, close - 1));

        if (inClass === undefined) {
          return ABORT_ALL;
        }
        if (inClass(code)) {
          isMatched = true;
        }
        p = close;
        patternCharacter = "";
      }
    } else if (textCharacter === patternCharacter) {
      isMatched = true;
    }
    previous = patternCharacter;
    patternCharacter = pattern[++p];
  } while (patternCharacter !== "]");

  if (isMatched === isNegated || (isPathName && textCharacter === "/")) {
    return NO_MATCH;
  }

  return { end: p };
}

const isUpper = (code: number): boolean => code >= 0x41 && code <= 0x5a;
const isLower = (code: number): boolean => code >= 0x61 && code <= 0x7a;
const isDigit = (code: number): boolean => code >= 0x30 && code <= 0x39;
const isAlpha = (code: number): boolean => isUpper(code) || isLower(code);
const isAlnum = (code: number): boolean => isAlpha(code) || isDigit(code);
const isGraph = (code: number): boolean => code >= 0x21 && code <= 0x7e;

// git's character classes, ASCII alone as its `sane_ctype` has them: its `space` leaves out `\v` and `\f`.
const CHARACTER_CLASSES = new Map<string, (code: number) => boolean>([
  ["alnum", isAlnum],
  ["alpha", isAlpha],
  ["blank", (code) => code === 0x20 || code === 0x09],
  ["cntrl", (code) => code < 0x20 || code === 0x7f],
  ["digit", isDigit],
  ["graph", isGraph],
  ["lower", isLower],
  ["print", (code) => code >= 0x20 && code <= 0x7e],
  ["punct", (code) => isGraph(code) && !isAlnum(code)],
  ["space", (code) => code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d],
  ["upper", isUpper],
  ["xdigit", (code) => isDigit(code) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66)],
]);
