import { readFiles } from "@codenhub/scan";

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
  // An entry that names no file, or a file that cannot be read, contributes nothing.
  for (const content of readFiles(filePaths)) {
    for (const cls of scanIconClasses(content, options)) {
      targetSet.add(cls);
    }
  }

  return targetSet;
}
