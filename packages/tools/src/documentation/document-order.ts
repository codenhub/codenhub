import { comparePublicDocuments, type OrderablePublicDocument } from "./document-policy.ts";

// A root page or folder section without an explicit `order` sorts after every
// one that has an order, keeping its path order among the rest.
const UNORDERED_POSITION = Number.MAX_SAFE_INTEGER;

/** A public document with the fields that place it in the sidebar. */
export interface PlaceablePublicDocument extends OrderablePublicDocument {
  /** Section label from a folder `index.md`, when it sets one. */
  group?: string;
}

/** One top-level sidebar entry: a root page, or a folder and its pages. */
export interface DocumentSection<T> {
  /** Folder segment, or `""` for a root-level page. */
  segment: string;
  /**
   * Section label for a folder — its `index.md` `group`, else the title-cased
   * folder name. Empty for a root-level page.
   */
  label: string;
  /** The folder's pages with its `index.md` first, or the single root page. */
  documents: T[];
}

/** Title-cases a `kebab-case` or `snake_case` folder segment. */
export function titleCaseSegment(segment: string): string {
  return segment
    .split(/[-_]/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface PositionedSection<T> {
  section: DocumentSection<T>;
  isPackageIndex: boolean;
  order?: number;
  /** `0` for a root page, `1` for a folder section: orders unordered siblings. */
  kind: 0 | 1;
  /** Final stable tie-break: the root page's path, or the folder segment. */
  sortKey: string;
}

function comparePositioned<T>(left: PositionedSection<T>, right: PositionedSection<T>): number {
  if (left.isPackageIndex !== right.isPackageIndex) {
    return left.isPackageIndex ? -1 : 1;
  }
  const byOrder = (left.order ?? UNORDERED_POSITION) - (right.order ?? UNORDERED_POSITION);
  if (byOrder !== 0) {
    return byOrder;
  }
  const leftKind = left.order === undefined ? left.kind : 0;
  const rightKind = right.order === undefined ? right.kind : 0;
  if (leftKind !== rightKind) {
    return leftKind - rightKind;
  }
  return left.sortKey < right.sortKey ? -1 : left.sortKey > right.sortKey ? 1 : 0;
}

/**
 * Groups a package's public documents into ordered top-level sidebar sections.
 *
 * Root pages and folder sections share one ordering: the package `index.md`
 * first, then entries with a frontmatter `order` ascending, then the rest — root
 * pages before folder sections — by path. A folder section takes its position
 * from its `index.md` `order` and its label from that page's `group`, falling
 * back to the title-cased folder name. Inside a folder the `index.md` leads,
 * then its siblings by the same `order`-then-path rule.
 *
 * Flatten the result for a linear reading order; keep the grouping to render a
 * two-level sidebar. Both stay in the same order.
 * @param documents Package documents; order is recomputed here.
 * @returns Ordered sections, each holding its documents in order.
 */
export function orderDocumentSections<T extends PlaceablePublicDocument>(
  documents: readonly T[],
): DocumentSection<T>[] {
  const rootDocuments: T[] = [];
  const folderSegments: string[] = [];
  const folderDocuments = new Map<string, T[]>();

  for (const document of documents) {
    const separator = document.relativePath.indexOf("/");
    if (separator === -1) {
      rootDocuments.push(document);
      continue;
    }
    const segment = document.relativePath.slice(0, separator);
    let bucket = folderDocuments.get(segment);
    if (bucket === undefined) {
      bucket = [];
      folderDocuments.set(segment, bucket);
      folderSegments.push(segment);
    }
    bucket.push(document);
  }

  const positioned: PositionedSection<T>[] = rootDocuments.map((document) => ({
    isPackageIndex: document.relativePath === "index.md",
    kind: 0,
    order: document.order,
    section: { documents: [document], label: "", segment: "" },
    sortKey: document.relativePath,
  }));

  for (const segment of folderSegments) {
    const bucket = folderDocuments.get(segment) ?? [];
    const indexDocument = bucket.find((document) => document.relativePath === `${segment}/index.md`);
    const rest = bucket.filter((document) => document !== indexDocument).sort(comparePublicDocuments);
    positioned.push({
      isPackageIndex: false,
      kind: 1,
      order: indexDocument?.order,
      section: {
        documents: indexDocument === undefined ? rest : [indexDocument, ...rest],
        label: indexDocument?.group ?? titleCaseSegment(segment),
        segment,
      },
      sortKey: segment,
    });
  }

  return positioned.sort(comparePositioned).map((entry) => entry.section);
}
