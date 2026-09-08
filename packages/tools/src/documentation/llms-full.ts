import { glob, readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import remarkParse from "remark-parse";
import { unified } from "unified";

import { orderDocumentSections } from "./document-order.ts";
import {
  coercePublicDocumentCurated,
  coercePublicDocumentOrder,
  comparePublicDocumentPaths,
  parseMarkdown,
} from "./document-policy.ts";

const SOURCE_MARKER = "<!-- Source: %s -->";
const CODE_TYPES = new Set(["code", "inlineCode"]);
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

/** A `docs/` document awaiting its place in a compilation. */
export interface LlmsFullDocument extends LlmsFullSection {
  /** Frontmatter `order`, when the document sets one. */
  order?: number;
  /** Frontmatter `curated`, set only on a folder `index.md` that routes rather than reads. */
  curated?: boolean;
}

/**
 * Orders the `docs/` documents of a compilation the way the sidebar orders them:
 * the package `index.md` first, then root pages and folder sections by
 * frontmatter `order`, then path, with each folder's pages inlined after its
 * `index.md`.
 * @param documents Documents whose `sourcePath` starts with `docs/`.
 * @returns The same documents in reading order.
 */
export function orderLlmsFullDocuments(documents: readonly LlmsFullDocument[]): LlmsFullDocument[] {
  const placeable = documents.map((document) => ({
    ...document,
    relativePath: document.sourcePath.slice("docs/".length),
  }));
  return orderDocumentSections(placeable).flatMap((section) => section.documents);
}

/** Reduces a link target to the sibling filename it points at, dropping `./`, a query, or a fragment. */
function linkedSiblingName(target: string): string {
  return (
    target
      .replace(/^\.\//, "")
      .replace(/[?#].*$/, "")
      .split("/")
      .at(-1) ?? ""
  );
}

/**
 * Applies curated-folder membership to a compilation, matching what the
 * documentation site publishes: a folder whose `index.md` sets `curated: true`
 * (per `docs/specs/packages-documentation.md`) contributes only the sibling
 * pages that index links, in link order, and the index itself — a router, not a
 * page — is left out. A folder with no curated index is untouched.
 * @param documents Parsed `docs/` documents.
 * @returns The documents a curated folder actually publishes, others unchanged.
 */
export function curateLlmsFullDocuments(documents: readonly LlmsFullDocument[]): LlmsFullDocument[] {
  const rootDocuments: LlmsFullDocument[] = [];
  const folderSegments: string[] = [];
  const folderDocuments = new Map<string, LlmsFullDocument[]>();

  for (const document of documents) {
    const relativePath = document.sourcePath.slice("docs/".length);
    const separator = relativePath.lastIndexOf("/");
    if (separator === -1) {
      rootDocuments.push(document);
      continue;
    }
    const segment = relativePath.slice(0, separator);
    let bucket = folderDocuments.get(segment);
    if (bucket === undefined) {
      bucket = [];
      folderDocuments.set(segment, bucket);
      folderSegments.push(segment);
    }
    bucket.push(document);
  }

  const result: LlmsFullDocument[] = [...rootDocuments];
  for (const segment of folderSegments) {
    const bucket = folderDocuments.get(segment) ?? [];
    const indexDocument = bucket.find((document) => document.sourcePath === `docs/${segment}/index.md`);
    if (indexDocument?.curated !== true) {
      result.push(...bucket);
      continue;
    }

    const siblingsByName = new Map(
      bucket
        .filter((document) => document !== indexDocument)
        .map((document) => [linkedSiblingName(document.sourcePath), document]),
    );
    const linkedNames = new Set<string>();
    for (const pattern of [INLINE_TARGET, DEFINITION_TARGET]) {
      for (const match of indexDocument.body.matchAll(pattern)) {
        linkedNames.add(linkedSiblingName(match.groups?.target ?? ""));
      }
    }

    let position = 0;
    for (const name of linkedNames) {
      const sibling = siblingsByName.get(name);
      if (sibling !== undefined) {
        result.push({ ...sibling, order: position });
        position += 1;
      }
    }
  }

  return result;
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

interface CodeRange {
  start: number;
  end: number;
}

interface PositionedNode {
  children?: PositionedNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  type: string;
}

/**
 * Locates every code span and code block in a Markdown body.
 *
 * The Markdown parser is asked rather than matched with a regular expression
 * because indented code blocks, fenced blocks, and inline spans have no single
 * lexical shape and each of them must keep the paths their authors wrote.
 * @param body Authored Markdown body.
 * @returns Ranges of the body that hold code, ordered by offset.
 */
function findCodeRanges(body: string): CodeRange[] {
  const tree = unified().use(remarkParse).parse(body) as PositionedNode;
  const ranges: CodeRange[] = [];

  function visit(node: PositionedNode): void {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (CODE_TYPES.has(node.type) && start !== undefined && end !== undefined) {
      ranges.push({ end, start });
      return;
    }
    node.children?.forEach(visit);
  }

  visit(tree);
  return ranges.sort((left, right) => left.start - right.start);
}

/**
 * Rewrites package-relative link targets so they resolve from the package root.
 *
 * Code blocks and inline code spans are left untouched so example snippets keep
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
  for (const { end, start } of findCodeRanges(body)) {
    parts.push(rebaseText(body.slice(cursor, start)), body.slice(start, end));
    cursor = end;
  }
  parts.push(rebaseText(body.slice(cursor)));
  return parts.join("");
}

/**
 * Orders the documents that make up an `llms-full.txt` compilation.
 *
 * The README comes first, then `docs/index.md`, then every remaining public
 * document by path, which is the deterministic order the documentation spec
 * requires. `docs/internal/` is maintainer-only and `docs/reference/` is a
 * generated area (per `docs/specs/packages-reference.md`); both are excluded.
 * @param packageFiles Every package-relative file path.
 * @returns Package-relative document paths in compilation order.
 */
export function orderLlmsFullSources(packageFiles: readonly string[]): string[] {
  const documents = packageFiles
    .filter(
      (packagePath) =>
        packagePath.startsWith("docs/") &&
        packagePath.endsWith(".md") &&
        !packagePath.startsWith("docs/internal/") &&
        !packagePath.startsWith("docs/reference/"),
    )
    .map((packagePath) => packagePath.slice("docs/".length))
    .sort(comparePublicDocumentPaths)
    .map((relativePath) => `docs/${relativePath}`);
  return packageFiles.includes("README.md") ? ["README.md", ...documents] : documents;
}

/**
 * Lists the documents an `llms-full.txt` compilation is generated from.
 * @param rootPath Absolute package directory.
 * @returns Package-relative POSIX paths, including `README.md` when it exists.
 */
export async function listLlmsFullSources(rootPath: string): Promise<string[]> {
  const [documents, hasReadme] = await Promise.all([
    Array.fromAsync(glob("docs/**/*.md", { cwd: rootPath })),
    readFile(join(rootPath, "README.md"), "utf8").then(
      () => true,
      () => false,
    ),
  ]);
  const paths = documents.map((path) => path.replaceAll("\\", "/"));
  return hasReadme ? ["README.md", ...paths] : paths;
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
  const parsed = await Promise.all(
    sourcePaths.map(async (sourcePath): Promise<LlmsFullSection | LlmsFullDocument> => {
      const source = await readFile(join(rootPath, sourcePath), "utf8");
      if (sourcePath === "README.md") {
        return { body: source, sourcePath };
      }
      const { body, frontmatter } = parseMarkdown(source);
      return {
        body,
        curated: coercePublicDocumentCurated(frontmatter.curated),
        order: coercePublicDocumentOrder(frontmatter.order),
        sourcePath,
      };
    }),
  );
  const readme = parsed.filter((section): section is LlmsFullSection => section.sourcePath === "README.md");
  const documents = parsed.filter((section): section is LlmsFullDocument => section.sourcePath !== "README.md");
  return renderLlmsFull([...readme, ...orderLlmsFullDocuments(curateLlmsFullDocuments(documents))]);
}
