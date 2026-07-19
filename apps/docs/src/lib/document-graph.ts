import GithubSlugger from "github-slugger";
import remarkParse from "remark-parse";
import { unified } from "unified";

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

export interface GraphDocument {
  fragments: Set<string>;
  links: DocumentLink[];
  path: string;
}

export interface DocumentGraph {
  documents: GraphDocument[];
  files: Set<string>;
}

export interface ValidationIssue {
  code:
    | "internal-published"
    | "internal-target"
    | "invalid-docs-escape"
    | "invalid-external-url"
    | "invalid-fragment"
    | "missing-required-surface"
    | "missing-target"
    | "npm-unpublished-target"
    | "package-root-escape"
    | "site-unpublished-target";
  message: string;
  sourcePath?: string;
  target?: string;
}

export interface PublicationInventories {
  npmFiles: Set<string>;
  siteFiles: Set<string>;
}

const REQUIRED_SURFACES = ["README.md", "docs/index.md", "llms.txt", "llms-full.txt"];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isValidationSurface(filePath: string): boolean {
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
  const tree = unified().use(remarkParse).parse(source) as MarkdownNode;
  const definitions = new Map<string, string>();
  const links: DocumentLink[] = [];
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
      fragments.add(slugger.slug(getNodeText(node)));
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

  return { fragments, links, path };
}

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

function addLinkIssues(
  graph: DocumentGraph,
  npmFiles: Set<string>,
  siteFiles: Set<string>,
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
  if (!graph.files.has(resolved.path)) {
    issues.push({
      code: "missing-target",
      message: `Local link target does not exist.`,
      sourcePath: document.path,
      target: resolved.path,
    });
    return;
  }
  if (document.path.startsWith("docs/") && link.target.split(/[?#]/, 1)[0] !== "" && !siteFiles.has(resolved.path)) {
    issues.push({
      code: "site-unpublished-target",
      message: `Local link target is not published by the site.`,
      sourcePath: document.path,
      target: resolved.path,
    });
  }
  if (!npmFiles.has(resolved.path)) {
    issues.push({
      code: "npm-unpublished-target",
      message: `Local link target is absent from npm pack.`,
      sourcePath: document.path,
      target: resolved.path,
    });
  }
  if (resolved.fragment !== undefined && resolved.fragment !== "") {
    const targetDocument = graph.documents.find(({ path }) => path === resolved.path);
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

export function validateDocumentGraph(graph: DocumentGraph, inventories: PublicationInventories): ValidationIssue[] {
  const npmFiles = new Set([...inventories.npmFiles].map(normalizePath));
  const siteFiles = new Set([...inventories.siteFiles].map(normalizePath));
  const issues: ValidationIssue[] = [];
  for (const requiredPath of REQUIRED_SURFACES) {
    if (!graph.files.has(requiredPath)) {
      issues.push({ code: "missing-required-surface", message: `Missing ${requiredPath}.`, target: requiredPath });
    } else if (!npmFiles.has(requiredPath)) {
      issues.push({
        code: "npm-unpublished-target",
        message: `${requiredPath} is absent from npm pack.`,
        target: requiredPath,
      });
    }
  }
  for (const filePath of npmFiles) {
    if (filePath.startsWith("docs/internal/")) {
      issues.push({ code: "internal-published", message: `Internal documentation is published.`, target: filePath });
    }
  }
  for (const filePath of siteFiles) {
    if (!npmFiles.has(filePath)) {
      issues.push({
        code: "npm-unpublished-target",
        message: `${filePath} is absent from npm pack.`,
        target: filePath,
      });
    }
  }
  for (const document of graph.documents) {
    for (const link of document.links) {
      addLinkIssues(graph, npmFiles, siteFiles, document, link, issues);
    }
  }
  return issues;
}
