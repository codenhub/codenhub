import { orderDocumentSections } from "@codenhub/tools/documentation";

import type { PublicDocument } from "./catalog";
import { DOCUMENT_SECTIONS, type DocumentSection, SECTION_LABELS, sectionOf } from "./document-section";

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

/** One entry in the sidebar's section strip. */
export interface SidebarTab {
  /** Whether the current page is in this section. */
  current: boolean;
  id: DocumentSection;
  label: string;
  /** The section's first page — where the tab points. */
  route: string;
}

export interface PackageSidebar {
  /** The active section's navigation tree. */
  tree: NavNode[];
  /**
   * The section strip, holding only sections the package has pages for. A strip
   * of one is left for the caller to hide: a lone tab is not a choice.
   */
  tabs: SidebarTab[];
}

function toLink(document: PublicDocument): NavLink {
  return { kind: "link", route: document.route, title: document.title };
}

/**
 * Builds a package's two-level sidebar.
 *
 * Root pages and folder groups share one ordering: the package `index.md` is
 * always first, then entries with a frontmatter `order` in that order, then the
 * rest — page links before groups — by path. A folder group takes its position
 * from its `index.md` `order` and its label from that page's `group` field,
 * falling back to the title-cased folder name. Inside a group the folder
 * `index.md` leads, then its siblings by the same `order`-then-path rule.
 * @param documents Package documents; order is recomputed here.
 * @returns Ordered sidebar nodes.
 */
export function buildNavigationTree(documents: readonly PublicDocument[]): NavNode[] {
  return orderDocumentSections(documents).map(
    (section): NavNode =>
      section.segment === ""
        ? toLink(section.documents[0])
        : { items: section.documents.map(toLink), kind: "group", title: section.label },
  );
}

/**
 * Re-labels a reference folder from its `index.md` page's title and drops that
 * prefix from every sibling, so `@codenhub/error`'s `/registries/browser` reads
 * as `/browser` under a `/registries` group and the folder index becomes `/`.
 *
 * Reference titles are import subpaths the generator writes (`/`, `/registries`,
 * `/registries/browser`); this only changes how the sidebar shows them, and a
 * folder with no index page is left as `orderDocumentSections` labels it.
 * @param documents Reference-section documents with the `reference/` prefix
 *   already stripped from their paths.
 * @returns The same documents with folder titles reframed.
 */
function reframeReferenceSubpaths(documents: readonly PublicDocument[]): PublicDocument[] {
  const folderTitle = new Map<string, string>();
  for (const document of documents) {
    const slash = document.relativePath.indexOf("/");
    if (slash !== -1 && document.relativePath.slice(slash + 1) === "index.md") {
      folderTitle.set(document.relativePath.slice(0, slash), document.title);
    }
  }

  return documents.map((document) => {
    const slash = document.relativePath.indexOf("/");
    if (slash === -1) {
      return document;
    }
    const prefix = folderTitle.get(document.relativePath.slice(0, slash));
    if (prefix === undefined) {
      return document;
    }
    const isIndex = document.relativePath.slice(slash + 1) === "index.md";
    const stripped = document.title.startsWith(prefix) ? document.title.slice(prefix.length) : document.title;
    return { ...document, group: isIndex ? prefix : document.group, title: stripped === "" ? "/" : stripped };
  });
}

/**
 * Splits a package's documents into the sidebar's section strip and the tree for
 * the section the current page sits in.
 *
 * Each tab points at its section's first document in catalog order — the package
 * overview for Guides, the reference entrypoint for Reference, the newest
 * version for Changelog. The tree is `buildNavigationTree` over just the active
 * section's pages, with the `reference/` or `changelog/` path prefix removed so
 * a nested folder (error's `registries/`) still groups; links keep their real
 * routes and titles.
 * @param documents The package's published documents, already in catalog order.
 * @param currentRoute The route of the page being rendered, when there is one.
 * @returns The section strip and the active section's navigation tree.
 */
export function buildPackageSidebar(
  documents: readonly PublicDocument[],
  currentRoute: string | undefined,
): PackageSidebar {
  const bySection = new Map<DocumentSection, PublicDocument[]>();
  for (const document of documents) {
    const section = sectionOf(document);
    const bucket = bySection.get(section);
    if (bucket === undefined) {
      bySection.set(section, [document]);
    } else {
      bucket.push(document);
    }
  }

  const currentDocument = documents.find((document) => document.route === currentRoute);
  const activeSection = currentDocument === undefined ? "guides" : sectionOf(currentDocument);

  // A section's pages address as `reference/x` or `changelog/x`; strip that so a
  // nested folder inside a section still groups. Guides carry no prefix.
  const relativeTo = (section: DocumentSection, relativePath: string): string => {
    const prefix = `${section}/`;
    return section !== "guides" && relativePath.startsWith(prefix) ? relativePath.slice(prefix.length) : relativePath;
  };

  const tabs = DOCUMENT_SECTIONS.flatMap((id): SidebarTab[] => {
    const sectionDocuments = bySection.get(id);
    if (sectionDocuments === undefined || sectionDocuments.length === 0) {
      return [];
    }
    // Point the tab at the section's own entry page — `reference/index.md`, a
    // bare `reference.md`, the package overview — not whatever sorts first once
    // the entrypoints carry their own `order`. Changelog has no index page
    // (its `index.md` is curated away), so its newest version leads.
    const landing =
      sectionDocuments.find((document) => {
        const path = relativeTo(id, document.relativePath);
        return path === "index.md" || path === `${id}.md`;
      }) ?? sectionDocuments[0];
    return [{ current: id === activeSection, id, label: SECTION_LABELS[id], route: landing.route }];
  });

  const sectionDocuments = (bySection.get(activeSection) ?? []).map((document) => {
    const relativePath = relativeTo(activeSection, document.relativePath);
    return relativePath === document.relativePath ? document : { ...document, relativePath };
  });
  const treeDocuments = activeSection === "reference" ? reframeReferenceSubpaths(sectionDocuments) : sectionDocuments;

  return { tabs, tree: buildNavigationTree(treeDocuments) };
}

/** Whether `route` names one of the pages inside `group`. */
export function groupContainsRoute(group: NavGroup, route: string | undefined): boolean {
  return route !== undefined && group.items.some((item) => item.route === route);
}
