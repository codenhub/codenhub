import * as fs from "fs";
import * as path from "path";

/**
 * Represents a skill read from a skill directory.
 */
export interface Skill {
  /** Unique identifier derived from the skill directory name. */
  id: string;
  /** Display name from `SKILL.md` frontmatter; falls back to `id`. */
  name: string;
  /** Short description from `SKILL.md` frontmatter. */
  description: string;
  /** Absolute path to the skill directory. */
  path: string;
}

/**
 * Options for {@link copyRecursiveSync}.
 */
export interface CopyRecursiveOptions {
  /** Absolute path to the source file or directory. */
  src: string;
  /** Absolute path to the copy destination. */
  dest: string;
  /**
   * Base names of files or directories to exclude at every depth of
   * the copy. Only base names are matched — path segments are not
   * supported. For example, `["agents"]` skips every entry named
   * `agents` at any level of the directory tree.
   */
  ignoreList?: string[];
}

/**
 * Parses YAML frontmatter from a markdown string.
 *
 * Recognises blocks bounded by `---` at the start of the content.
 * Strips a leading BOM if present. Removes surrounding single or
 * double quotes from parsed values.
 *
 * @param content - Raw markdown file content.
 * @returns Key-value map of frontmatter fields. Returns an empty
 *   object when no frontmatter block is found or if parsing fails.
 */
export function parseFrontmatter(content: string): Record<string, string> {
  const normalized = content.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  const metadata: Record<string, string> = {};
  if (!match) {
    return metadata;
  }

  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim();
      const rawValue = line.slice(colonIndex + 1).trim();
      // Strip matching surrounding quotes when present.
      const value = rawValue.replace(/^(['"])([\s\S]*)\1$/, "$2");
      metadata[key] = value;
    }
  }
  return metadata;
}

/**
 * Internal helper to read the beginning of a file.
 */
function readFileHeader(filePath: string, bytesCount = 4096): string {
  const buffer = Buffer.alloc(bytesCount);
  const fd = fs.openSync(filePath, "r");
  try {
    const bytesRead = fs.readSync(fd, buffer, 0, bytesCount, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Reads all valid skills from `srcDir`.
 *
 * A subdirectory is treated as a skill when it contains a `SKILL.md`
 * file. Name and description are read from the file's YAML
 * frontmatter.
 *
 * @param srcDir - Absolute path to the directory containing skill
 *   subdirectories.
 * @returns Array of {@link Skill} objects. Returns an empty array when
 *   `srcDir` does not exist.
 * @throws {Error} If filesystem operations fail (e.g., permission issues).
 */
export function getSkills(srcDir: string): Skill[] {
  if (!fs.existsSync(srcDir)) {
    return [];
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const itemPath = path.join(srcDir, entry.name);
      const skillMdPath = path.join(itemPath, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        const content = readFileHeader(skillMdPath);
        const meta = parseFrontmatter(content);
        skills.push({
          id: entry.name,
          name: meta.name || entry.name,
          description: meta.description || "",
          path: itemPath,
        });
      }
    }
  }

  return skills;
}

/**
 * Recursively copies a file or directory.
 *
 * When the source is a directory, its contents are copied into destination,
 * creating destination and any missing parent directories as needed. When
 * the source is a file, it is copied directly to destination.
 *
 * The `ignoreList` option filters by **base name only** — not by
 * path. Passing `"agents"` skips every entry named `agents` at any
 * depth, regardless of where it appears in the tree.
 *
 * @param options - Copy configuration options.
 * @throws {Error} When source does not exist, target is a subdirectory of source,
 *   or directory traversal is detected.
 */
export function copyRecursiveSync(options: CopyRecursiveOptions): void {
  const { src, dest, ignoreList = [] } = options;
  if (!fs.existsSync(src)) {
    throw new Error(`Source path "${src}" does not exist`);
  }

  // Guard against self-copying recursion
  const resolvedSrc = path.resolve(src);
  const resolvedDest = path.resolve(dest);
  const relative = path.relative(resolvedSrc, resolvedDest);
  const isSubdir = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (isSubdir) {
    throw new Error(`Cannot copy source "${src}" to a subdirectory of itself "${dest}"`);
  }

  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    copyDirectoryInternal({
      srcDir: src,
      destDir: dest,
      resolvedSrc,
      ignoreList,
    });
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

/**
 * Internal helper to copy directory contents without redundant checks.
 */
function copyDirectoryInternal(options: {
  srcDir: string;
  destDir: string;
  resolvedSrc: string;
  ignoreList: string[];
  visited?: Set<string>;
}): void {
  const { srcDir, destDir, resolvedSrc, ignoreList, visited = new Set<string>() } = options;

  const realSrcDir = fs.realpathSync(srcDir);
  if (visited.has(realSrcDir)) {
    return;
  }
  visited.add(realSrcDir);

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreList.includes(entry.name)) {
      continue;
    }
    const srcChild = path.join(srcDir, entry.name);
    const destChild = path.join(destDir, entry.name);

    if (entry.isSymbolicLink()) {
      const realChild = fs.realpathSync(srcChild);
      const relativeToSrc = path.relative(resolvedSrc, realChild);
      const isOutside =
        relativeToSrc === ".." ||
        relativeToSrc.startsWith("../") ||
        relativeToSrc.startsWith("..\\") ||
        path.isAbsolute(relativeToSrc);
      if (isOutside) {
        throw new Error(
          `Directory traversal detected: "${srcChild}" resolves to "${realChild}" which is outside "${resolvedSrc}"`,
        );
      }
    }

    const stats = fs.statSync(srcChild);
    if (stats.isDirectory()) {
      if (!fs.existsSync(destChild)) {
        fs.mkdirSync(destChild);
      }
      copyDirectoryInternal({
        srcDir: srcChild,
        destDir: destChild,
        resolvedSrc,
        ignoreList,
        visited,
      });
    } else {
      fs.copyFileSync(srcChild, destChild);
    }
  }
}
