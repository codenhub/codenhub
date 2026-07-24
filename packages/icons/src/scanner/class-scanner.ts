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
    pattern = new RegExp(`\\b${escapeRegExp(prefix)}-[a-zA-Z0-9_-]+\\b`, "g");
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
 * Scans multiple file paths on disk for icon class usages matching the given prefix.
 * Safely ignores non-existent or unreadable files.
 *
 * @param filePaths - Iterable collection of file system paths to scan.
 * @param options - Options specifying the icon class prefix.
 * @param targetSet - Optional existing `Set` to populate with extracted class names.
 * @returns `Set` containing unique extracted icon class names.
 */
export function scanFiles(
  filePaths: Iterable<string>,
  options?: ScanIconClassesOptions,
  targetSet: Set<string> = new Set<string>(),
): Set<string> {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const content = fs.readFileSync(filePath, "utf-8");
        const matches = scanIconClasses(content, options);
        for (const cls of matches) {
          targetSet.add(cls);
        }
      }
    } catch {
      // Ignore unreadable files gracefully
    }
  }

  return targetSet;
}
