/**
 * Options for scanning content for icon class names.
 */
export interface ScanIconClassesOptions {
  /**
   * The prefix used for icon class names. Defaults to `"ic"`.
   */
  prefix?: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const pattern = new RegExp(`\\b${escapeRegExp(prefix)}-[a-zA-Z0-9_-]+\\b`, "g");
  const matches = content.match(pattern);

  if (!matches) {
    return new Set<string>();
  }

  return new Set<string>(matches);
}
