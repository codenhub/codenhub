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
export interface CopyOptions {
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
 *   object when no frontmatter block is found.
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
 */
export function getSkills(srcDir: string): Skill[] {
  if (!fs.existsSync(srcDir)) {
    return [];
  }

  const items = fs.readdirSync(srcDir);
  const skills: Skill[] = [];

  for (const item of items) {
    const itemPath = path.join(srcDir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      const skillMdPath = path.join(itemPath, "SKILL.md");
      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, "utf8");
        const meta = parseFrontmatter(content);
        skills.push({
          id: item,
          name: meta.name || item,
          description: meta.description || "",
          path: itemPath,
        });
      }
    }
  }

  return skills;
}

/**
 * Recursively copies `src` to `dest`.
 *
 * When `src` is a directory, its contents are copied into `dest`,
 * creating `dest` and any missing parent directories as needed. When
 * `src` is a file, it is copied directly to `dest`.
 *
 * The `ignoreList` option filters by **base name only** — not by
 * path. Passing `"agents"` skips every entry named `agents` at any
 * depth, regardless of where it appears in the tree.
 *
 * @param src - Absolute path to the source file or directory.
 * @param dest - Absolute path to the copy destination.
 * @param options - Optional copy configuration.
 * @throws {Error} When `src` does not exist.
 */
export function copyRecursiveSync(src: string, dest: string, options: CopyOptions = {}): void {
  const { ignoreList = [] } = options;
  if (!fs.existsSync(src)) {
    throw new Error(`Source path "${src}" does not exist`);
  }
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const childItemName of fs.readdirSync(src)) {
      if (ignoreList.includes(childItemName)) {
        continue;
      }
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName), options);
    }
  } else {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}
