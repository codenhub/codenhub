import type { PublicDocument } from "./catalog";

/** A single documentation page in the package sidebar. */
export interface NavLink {
  kind: "link";
  route: string;
  title: string;
}

/** A folder of documentation pages, rendered as a collapsible section. */
export interface NavGroup {
  items: NavLink[];
  kind: "group";
  title: string;
}

export type NavNode = NavGroup | NavLink;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function titleCase(segment: string): string {
  return segment
    .split(/[-_]/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Splits a package's flat document list into a two-level sidebar: root pages
 * first in their existing order, then one collapsible group per top-level
 * folder, ordered by folder name.
 *
 * Only the first path segment groups the sidebar. No package nests its docs
 * deeper than one folder today; a deeper file would still list flat inside its
 * top-level group rather than nesting further.
 * @param documents Package documents, already sorted by the catalog.
 * @returns Ordered sidebar nodes.
 */
export function buildNavigationTree(documents: readonly PublicDocument[]): NavNode[] {
  const rootLinks: NavLink[] = [];
  const groupOrder: string[] = [];
  const groupDocuments = new Map<string, PublicDocument[]>();

  for (const document of documents) {
    const separator = document.relativePath.indexOf("/");
    if (separator === -1) {
      rootLinks.push({ kind: "link", route: document.route, title: document.title });
      continue;
    }

    const segment = document.relativePath.slice(0, separator);
    let bucket = groupDocuments.get(segment);
    if (bucket === undefined) {
      bucket = [];
      groupDocuments.set(segment, bucket);
      groupOrder.push(segment);
    }
    bucket.push(document);
  }

  const groups: NavGroup[] = [...groupOrder].sort(compareText).map((segment) => {
    const bucket = groupDocuments.get(segment) ?? [];
    const indexPath = `${segment}/index.md`;
    const indexDocument = bucket.find((document) => document.relativePath === indexPath);
    const rest = bucket.filter((document) => document.relativePath !== indexPath);
    const ordered = indexDocument === undefined ? rest : [indexDocument, ...rest];

    return {
      items: ordered.map((document) => ({
        kind: "link" as const,
        route: document.route,
        title: document.title,
      })),
      kind: "group",
      title: indexDocument?.title ?? titleCase(segment),
    };
  });

  return [...rootLinks, ...groups];
}

/** Whether `route` names one of the pages inside `group`. */
export function groupContainsRoute(group: NavGroup, route: string | undefined): boolean {
  return route !== undefined && group.items.some((item) => item.route === route);
}
