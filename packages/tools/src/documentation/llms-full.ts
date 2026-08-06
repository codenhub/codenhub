import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import { comparePublicDocumentPaths, parseMarkdown } from "./document-policy.ts";

const SOURCE_MARKER = "<!-- Source: %s -->";
const CODE_SEGMENT = /^ {0,3}(?<fence>```|~~~)[^\n]*\n[\s\S]*?^ {0,3}\k<fence>[^\n]*$|`+[^`\n]*`+/gm;
const INLINE_TARGET = /(?<prefix>\]\(\s*)(?<target>[^)\s]+)/g;
const DEFINITION_TARGET = /(?<prefix>^ {0,3}\[[^\]\n]+\]:[^\S\n]*)(?<target>\S+)/gm;
const ATTRIBUTE_TARGET = /(?<prefix>\b(?:href|src)\s*=\s*["'])(?<target>[^"']+)/g;
const TARGET_PATTERNS = [INLINE_TARGET, DEFINITION_TARGET, ATTRIBUTE_TARGET];

/** One document copied into an `llms-full.txt` compilation. */
export interface LlmsFullSection {
  /** Package-relative POSIX path the body came from. */
  sourcePath: string;
  /** Authored Markdown body without its presentation frontmatter. */
  body: string;
}

function isRebasable(target: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i.test(target) && target.trim() !== "";
}

function rebaseTarget(target: string, sourceDirectory: string): string {
  if (!isRebasable(target)) {
    return target;
  }
  const hashIndex = target.indexOf("#");
  const path = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const suffix = hashIndex === -1 ? "" : target.slice(hashIndex);
  if (path === "") {
    return target;
  }
  const rebased = posix.normalize(posix.join(sourceDirectory, path));
  return rebased.startsWith("../") ? target : `${rebased}${suffix}`;
}

/**
 * Rewrites package-relative link targets so they resolve from the package root.
 *
 * Code fences and inline code spans are left untouched so example snippets keep
 * the paths their authors wrote.
 * @param body Authored Markdown body.
 * @param sourceDirectory Package-relative directory the body was authored in.
 * @returns Body with relative link and image targets rebased.
 */
export function rebaseMarkdownTargets(body: string, sourceDirectory: string): string {
  if (sourceDirectory === "" || sourceDirectory === ".") {
    return body;
  }

  const rebaseText = (text: string): string =>
    TARGET_PATTERNS.reduce(
      (current, pattern) =>
        current.replaceAll(pattern, (_match, ...groups) => {
          const named = groups.at(-1) as { prefix: string; target: string };
          return `${named.prefix}${rebaseTarget(named.target, sourceDirectory)}`;
        }),
      text,
    );

  const parts: string[] = [];
  let cursor = 0;
  for (const match of body.matchAll(CODE_SEGMENT)) {
    parts.push(rebaseText(body.slice(cursor, match.index)), match[0]);
    cursor = match.index + match[0].length;
  }
  parts.push(rebaseText(body.slice(cursor)));
  return parts.join("");
}

/**
 * Orders the documents that make up an `llms-full.txt` compilation.
 *
 * The README comes first, then `docs/index.md`, then every remaining public
 * document by path, which is the deterministic order the documentation spec
 * requires.
 * @param packageFiles Every package-relative file path.
 * @returns Package-relative document paths in compilation order.
 */
export function orderLlmsFullSources(packageFiles: readonly string[]): string[] {
  const documents = packageFiles
    .filter(
      (packagePath) =>
        packagePath.startsWith("docs/") && packagePath.endsWith(".md") && !packagePath.startsWith("docs/internal/"),
    )
    .map((packagePath) => packagePath.slice("docs/".length))
    .sort(comparePublicDocumentPaths)
    .map((relativePath) => `docs/${relativePath}`);
  return packageFiles.includes("README.md") ? ["README.md", ...documents] : documents;
}

/**
 * Renders an `llms-full.txt` body from its source documents.
 * @param sections Documents in compilation order.
 * @returns Compilation text with one source marker per document.
 */
export function renderLlmsFull(sections: readonly LlmsFullSection[]): string {
  return sections
    .map(({ body, sourcePath }) => {
      const directory = sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : "";
      return `${SOURCE_MARKER.replace("%s", sourcePath)}\n\n${rebaseMarkdownTargets(body, directory).trim()}\n`;
    })
    .join("\n");
}

/**
 * Builds the `llms-full.txt` a package should publish.
 * @param rootPath Absolute package directory.
 * @param packageFiles Every package-relative file path.
 * @returns Generated compilation text.
 * @throws When a source document cannot be read.
 */
export async function buildLlmsFull(rootPath: string, packageFiles: readonly string[]): Promise<string> {
  const sourcePaths = orderLlmsFullSources(packageFiles);
  const sections = await Promise.all(
    sourcePaths.map(async (sourcePath): Promise<LlmsFullSection> => {
      const source = await readFile(join(rootPath, sourcePath), "utf8");
      return { body: sourcePath === "README.md" ? source : parseMarkdown(source).body, sourcePath };
    }),
  );
  return renderLlmsFull(sections);
}

/**
 * Compares generated and authored text while ignoring line-ending differences.
 * @param generated Freshly generated text.
 * @param authored Text currently on disk.
 * @returns `true` when the two differ in anything but line endings.
 */
export function hasContentDrift(generated: string, authored: string): boolean {
  return generated.replaceAll("\r\n", "\n") !== authored.replaceAll("\r\n", "\n");
}
