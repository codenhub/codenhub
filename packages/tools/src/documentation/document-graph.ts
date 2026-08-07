import GithubSlugger from "github-slugger";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { assertSingleH1, parseMarkdown, parsePublicDocumentFrontmatter } from "./document-policy.ts";
import { getDocumentRoute } from "./package-metadata.ts";

interface MarkdownNode {
  children?: MarkdownNode[];
  depth?: number;
  identifier?: string;
  type: string;
  url?: string;
  value?: string;
}

interface DocumentLink {
  target: string;
}

/** A heading found in a document body. */
export interface DocumentHeading {
  /** Heading level, where `1` is an H1. */
  depth: number;
  /** Rendered heading text. */
  text: string;
}

/** One validation surface parsed into links, fragments, and headings. */
export interface GraphDocument {
  /** Heading anchors generated for the document body. */
  fragments: Set<string>;
  /** Frontmatter fields declared by the document. */
  frontmatter: Record<string, unknown>;
  /** Headings in document order. */
  headings: DocumentHeading[];
  /** Every link and image target found in the document. */
  links: DocumentLink[];
  /** Package-relative document path. */
  path: string;
}

/** Every validation surface of a package plus the files it may link to. */
export interface DocumentGraph {
  /** Parsed validation surfaces ordered by path. */
  documents: GraphDocument[];
  /** Every package-relative file path. */
  files: Set<string>;
}

/** A documentation problem found while validating a package. */
export interface ValidationIssue {
  /** Machine-readable problem kind. */
  code:
    | "duplicate-document-identifier"
    | "internal-published"
    | "internal-target"
    | "invalid-docs-escape"
    | "invalid-docs-readme"
    | "invalid-external-url"
    | "invalid-frontmatter"
    | "invalid-fragment"
    | "invalid-heading-count"
    | "missing-required-surface"
    | "missing-target"
    | "npm-unpublished-target"
    | "package-root-escape"
    | "site-unpublished-target";
  /** Human-readable explanation. */
  message: string;
  /** Document the problem was found in, when it belongs to one. */
  sourcePath?: string;
  /** Link or file path the problem refers to. */
  target?: string;
}

/**
 * File sets a package publishes, used to check that link targets ship.
 *
 * An omitted set disables its checks rather than approximating them, because the
 * documentation spec requires real `npm pack --dry-run --json` output.
 */
export interface PublicationInventories {
  /** Files included by `npm pack`, or `undefined` to skip tarball checks. */
  npmFiles?: Set<string>;
  /** Files published by the documentation site, or `undefined` to skip site checks. */
  siteFiles?: Set<string>;
}

const REQUIRED_SURFACES = ["README.md", "docs/index.md", "llms.txt", "llms-full.txt"];
const DOCS_PREFIX = "docs/";
const DOCS_README = "docs/README.md";
// `llms-full.txt` is deliberately absent: it concatenates every document, so it
// carries one H1 per source by design.
const SINGLE_H1_SURFACES = new Set(["README.md", "llms.txt"]);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * Reports whether a package-relative path is validated as public documentation.
 * @param filePath Package-relative POSIX path.
 * @returns `true` for the README, LLM files, and public `docs/` Markdown.
 */
export function isValidationSurface(filePath: string): boolean {
  return (
    filePath === "README.md" ||
    filePath === "llms.txt" ||
    filePath === "llms-full.txt" ||
    (filePath.startsWith("docs/") && filePath.endsWith(".md") && !filePath.startsWith("docs/internal/"))
  );
}

function getNodeText(node: MarkdownNode): string {
  if (node.type === "html") {
    return "";
  }
  if (typeof node.value === "string") {
    return node.value;
  }
  return node.children?.map(getNodeText).join("") ?? "";
}

function parseDocument(path: string, source: string): GraphDocument {
  const { body, frontmatter } = parseMarkdown(source);
  const tree = unified().use(remarkParse).parse(body) as MarkdownNode;
  const definitions = new Map<string, string>();
  const links: DocumentLink[] = [];
  const headings: DocumentHeading[] = [];
  const fragments = new Set<string>();
  const slugger = new GithubSlugger();

  function visit(node: MarkdownNode): void {
    if (
      node.type === "definition" &&
      node.identifier !== undefined &&
      node.url !== undefined &&
      !definitions.has(node.identifier.toLowerCase())
    ) {
      definitions.set(node.identifier.toLowerCase(), node.url);
    }
    if ((node.type === "link" || node.type === "image") && node.url !== undefined) {
      links.push({ target: node.url });
    }
    if (node.type === "html" && node.value !== undefined) {
      for (const match of node.value.matchAll(/(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
        const target = match[1] ?? match[2] ?? match[3];
        if (target !== undefined) {
          links.push({ target });
        }
      }
    }
    if (node.type === "heading") {
      const text = getNodeText(node);
      headings.push({ depth: node.depth ?? 1, text });
      fragments.add(slugger.slug(text));
    }
    node.children?.forEach(visit);
  }

  visit(tree);
  function resolveReferences(node: MarkdownNode): void {
    if ((node.type === "linkReference" || node.type === "imageReference") && node.identifier !== undefined) {
      const target = definitions.get(node.identifier.toLowerCase());
      if (target !== undefined) {
        links.push({ target });
      }
    }
    node.children?.forEach(resolveReferences);
  }
  resolveReferences(tree);

  return { fragments, frontmatter, headings, links, path };
}

/**
 * Parses every validation surface of a package into a linkable graph.
 * @param packageFiles Package-relative paths mapped to file contents. Non-surfaces may map to an empty string.
 * @returns Parsed documents and the set of files they may link to.
 */
export function createDocumentGraph(packageFiles: Record<string, string>): DocumentGraph {
  const normalizedFiles = Object.fromEntries(
    Object.entries(packageFiles).map(([filePath, source]) => [normalizePath(filePath), source]),
  );
  const documents = Object.entries(normalizedFiles)
    .filter(([filePath]) => isValidationSurface(filePath))
    .map(([filePath, source]) => parseDocument(filePath, source))
    .sort((left, right) => compareText(left.path, right.path));
  return { documents, files: new Set(Object.keys(normalizedFiles)) };
}

function resolveLocalPath(sourcePath: string, target: string): { fragment?: string; path?: string } {
  const hashIndex = target.indexOf("#");
  const rawPath = (hashIndex === -1 ? target : target.slice(0, hashIndex)).split("?", 1)[0]!;
  const fragment = hashIndex === -1 ? undefined : target.slice(hashIndex + 1);
  // A target without a path part, such as `#section`, points at the document it
  // was written in. Resolving it through the segment walk below would yield the
  // document's directory instead.
  if (rawPath === "") {
    return { fragment, path: sourcePath };
  }
  try {
    const decodedPath = decodeURIComponent(rawPath);
    if (decodedPath.startsWith("/")) {
      return {};
    }
    const baseSegments = sourcePath.split("/").slice(0, -1);
    const segments = baseSegments;
    for (const segment of decodedPath.split("/")) {
      if (segment === "" || segment === ".") {
        continue;
      }
      if (segment === "..") {
        if (segments.length === 0) {
          return {};
        }
        segments.pop();
      } else {
        segments.push(segment);
      }
    }
    return { fragment, path: segments.join("/") || sourcePath };
  } catch {
    return {};
  }
}

function isExternalTarget(target: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("//");
}

interface LinkContext {
  graph: DocumentGraph;
  npmFiles?: Set<string>;
  siteFiles?: Set<string>;
}

function addLinkIssues(
  context: LinkContext,
  document: GraphDocument,
  link: DocumentLink,
  issues: ValidationIssue[],
): void {
  if (isExternalTarget(link.target)) {
    try {
      new URL(link.target.startsWith("//") ? `https:${link.target}` : link.target);
    } catch {
      issues.push({
        code: "invalid-external-url",
        message: `Invalid external URL ${link.target}.`,
        sourcePath: document.path,
      });
    }
    return;
  }

  const resolved = resolveLocalPath(document.path, link.target);
  if (resolved.path === undefined) {
    issues.push({
      code: "package-root-escape",
      message: `Link escapes the package root.`,
      sourcePath: document.path,
      target: link.target,
    });
    return;
  }
  if (resolved.path.startsWith("docs/internal/")) {
    issues.push({
      code: "internal-target",
      message: `Link targets internal documentation.`,
      sourcePath: document.path,
      target: resolved.path,
    });
    return;
  }
  if (
    document.path.startsWith("docs/") &&
    !resolved.path.startsWith("docs/") &&
    !["LICENSE", "NOTICE"].includes(resolved.path)
  ) {
    issues.push({
      code: "invalid-docs-escape",
      message: `Public docs may escape docs only for LICENSE or NOTICE.`,
      sourcePath: document.path,
      target: resolved.path,
    });
    return;
  }
  if (!context.graph.files.has(resolved.path)) {
    issues.push({
      code: "missing-target",
      message: `Local link target does not exist.`,
      sourcePath: document.path,
      target: resolved.path,
    });
    return;
  }
  if (context.siteFiles !== undefined && document.path.startsWith("docs/") && !context.siteFiles.has(resolved.path)) {
    issues.push({
      code: "site-unpublished-target",
      message: `Local link target is not published by the site.`,
      sourcePath: document.path,
      target: resolved.path,
    });
  }
  if (context.npmFiles !== undefined && !context.npmFiles.has(resolved.path)) {
    issues.push({
      code: "npm-unpublished-target",
      message: `Local link target is absent from npm pack.`,
      sourcePath: document.path,
      target: resolved.path,
    });
  }
  if (resolved.fragment !== undefined && resolved.fragment !== "") {
    const targetDocument = context.graph.documents.find(({ path }) => path === resolved.path);
    let fragment = resolved.fragment;
    try {
      fragment = decodeURIComponent(fragment);
    } catch {
      // The undecoded value cannot match a generated heading id.
    }
    if (targetDocument === undefined || !targetDocument.fragments.has(fragment)) {
      issues.push({
        code: "invalid-fragment",
        message: `Heading fragment does not exist.`,
        sourcePath: document.path,
        target: link.target,
      });
    }
  }
}

function addDocumentPolicyIssues(document: GraphDocument, issues: ValidationIssue[]): void {
  const isPublicDocument = document.path.startsWith(DOCS_PREFIX);
  if (!isPublicDocument && !SINGLE_H1_SURFACES.has(document.path)) {
    return;
  }
  if (isPublicDocument) {
    try {
      parsePublicDocumentFrontmatter(document.frontmatter, document.path);
    } catch (cause) {
      issues.push({ code: "invalid-frontmatter", message: (cause as Error).message, sourcePath: document.path });
    }
  }
  try {
    assertSingleH1(document.headings, document.path);
  } catch (cause) {
    issues.push({ code: "invalid-heading-count", message: (cause as Error).message, sourcePath: document.path });
  }
}

/**
 * Reports public documents whose relative paths collapse to the same identifier.
 *
 * `docs/guides/index.md` identifies the `guides` area and `docs/guides.md`
 * identifies the `guides` document, so a package holding both has no stable name
 * for either.
 * @param graph Parsed documents of one package.
 * @param issues Collector the problems are appended to.
 */
function addDocumentIdentifierIssues(graph: DocumentGraph, issues: ValidationIssue[]): void {
  const owners = new Map<string, string>();
  for (const { path } of graph.documents) {
    if (!path.startsWith(DOCS_PREFIX)) {
      continue;
    }
    const identifier = getDocumentRoute(path.slice(DOCS_PREFIX.length));
    const owner = owners.get(identifier);
    if (owner === undefined) {
      owners.set(identifier, path);
    } else {
      issues.push({
        code: "duplicate-document-identifier",
        message: `Documents ${owner} and ${path} share the identifier "${identifier || "index"}".`,
        sourcePath: path,
        target: owner,
      });
    }
  }
}

/**
 * Validates required surfaces, document policy, and every link of a package.
 * @param graph Parsed documents produced by {@link createDocumentGraph}.
 * @param inventories Published file sets. Omitted sets disable their checks.
 * @returns Every problem found, in discovery order.
 */
export function validateDocumentGraph(
  graph: DocumentGraph,
  inventories: PublicationInventories = {},
): ValidationIssue[] {
  const npmFiles =
    inventories.npmFiles === undefined ? undefined : new Set([...inventories.npmFiles].map(normalizePath));
  const siteFiles =
    inventories.siteFiles === undefined ? undefined : new Set([...inventories.siteFiles].map(normalizePath));
  const issues: ValidationIssue[] = [];
  for (const requiredPath of REQUIRED_SURFACES) {
    if (!graph.files.has(requiredPath)) {
      issues.push({ code: "missing-required-surface", message: `Missing ${requiredPath}.`, target: requiredPath });
    } else if (npmFiles !== undefined && !npmFiles.has(requiredPath)) {
      issues.push({
        code: "npm-unpublished-target",
        message: `${requiredPath} is absent from npm pack.`,
        target: requiredPath,
      });
    }
  }
  if (graph.files.has(DOCS_README)) {
    issues.push({
      code: "invalid-docs-readme",
      message: `Remove ${DOCS_README}; docs/index.md owns the documentation entrypoint.`,
      target: DOCS_README,
    });
  }
  addDocumentIdentifierIssues(graph, issues);
  for (const filePath of npmFiles ?? []) {
    if (filePath.startsWith("docs/internal/")) {
      issues.push({ code: "internal-published", message: `Internal documentation is published.`, target: filePath });
    }
  }
  for (const filePath of siteFiles ?? []) {
    if (npmFiles !== undefined && !npmFiles.has(filePath)) {
      issues.push({
        code: "npm-unpublished-target",
        message: `${filePath} is absent from npm pack.`,
        target: filePath,
      });
    }
  }
  const context: LinkContext = { graph, npmFiles, siteFiles };
  for (const document of graph.documents) {
    addDocumentPolicyIssues(document, issues);
    for (const link of document.links) {
      addLinkIssues(context, document, link, issues);
    }
  }
  return issues;
}
