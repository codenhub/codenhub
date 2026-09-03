import { orderDocumentSections } from "@codenhub/tools/documentation";

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

/** Whether `route` names one of the pages inside `group`. */
export function groupContainsRoute(group: NavGroup, route: string | undefined): boolean {
  return route !== undefined && group.items.some((item) => item.route === route);
}
