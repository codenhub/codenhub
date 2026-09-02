import fs from "node:fs";

/**
 * Options for scanning content for icon class names.
 */
export interface ScanIconClassesOptions {
  /**
   * The prefix used for icon class names. Defaults to `"ic"`.
   */
  prefix?: string;
}

const regexCache = new Map<string, RegExp>();

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPatternForPrefix(prefix: string): RegExp {
  let pattern = regexCache.get(prefix);
  if (!pattern) {
    // The stroke modifier is part of the class, not a class beside it, so it is
    // matched here rather than left for a second pass: `ic-heart/1.5` is one
    // token addressing one icon at one width.
    pattern = new RegExp(`\\b${escapeRegExp(prefix)}-[a-zA-Z0-9_-]+(?:/[0-9]+(?:\\.[0-9]+)?)?`, "g");
    regexCache.set(prefix, pattern);
  }
  return pattern;
}

/**
 * Scans a file or code content string and extracts all class names matching the icon prefix format (e.g. `ic-*`).
 *
 * @param content - Source code or markup string to scan.
 * @param options - Options specifying the icon class prefix.
 * @returns Set containing unique extracted icon class names.
 */
export function scanIconClasses(content: string, options?: ScanIconClassesOptions): Set<string> {
  const prefix = options?.prefix ?? "ic";
  const pattern = getPatternForPrefix(prefix);
  const matches = content.match(pattern);

  if (!matches) {
    return new Set<string>();
  }

  return new Set<string>(matches);
}

const GLOB_CHARACTERS = /[*?[\]{}]/;

/**
 * Resolves one entry into the files it names.
 *
 * An entry is tried as a literal path first, so a real file whose name contains
 * a bracket is read rather than treated as a pattern. Only when no such file
 * exists is the entry expanded as a glob.
 *
 * @param entry - Literal file path or glob pattern.
 * @returns The files the entry names, which may be none.
 */
function resolveEntry(entry: string): string[] {
  try {
    if (fs.existsSync(entry)) {
      return fs.statSync(entry).isFile() ? [entry] : [];
    }
    if (!GLOB_CHARACTERS.test(entry)) {
      return [];
    }
    return fs.globSync(entry);
  } catch {
    // An unreadable path or a pattern the platform rejects contributes nothing,
    // the same as a path that names no file.
    return [];
  }
}

/**
 * Scans file paths and glob patterns on disk for icon class usages matching the
 * given prefix.
 *
 * Patterns are expanded here rather than by the caller, because every
 * integration takes the same `content` option and none of them should have to
 * carry a matcher of its own. Non-existent and unreadable files are ignored.
 *
 * @param filePaths - File paths or glob patterns, such as `src/**\/*.{html,tsx}`.
 * @param options - Options specifying the icon class prefix.
 * @param targetSet - Optional existing `Set` to populate with extracted class names.
 * @returns `Set` containing unique extracted icon class names.
 */
export function scanFiles(
  filePaths: Iterable<string>,
  options?: ScanIconClassesOptions,
  targetSet: Set<string> = new Set<string>(),
): Set<string> {
  for (const entry of filePaths) {
    for (const filePath of resolveEntry(entry)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        for (const cls of scanIconClasses(content, options)) {
          targetSet.add(cls);
        }
      } catch {
        // Ignore unreadable files gracefully
      }
    }
  }

  return targetSet;
}
