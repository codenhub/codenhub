import type { PublicDocument } from "./catalog";

/** A top-level division of a package's documentation, surfaced as a sidebar tab. */
export type DocumentSection = "guides" | "reference" | "changelog";

/** The sections in the fixed order their tabs appear. */
export const DOCUMENT_SECTIONS: readonly DocumentSection[] = ["guides", "reference", "changelog"];

/** The tab label for each section. */
export const SECTION_LABELS: Record<DocumentSection, string> = {
  changelog: "Changelog",
  guides: "Guides",
  reference: "Reference",
};

/**
 * Which sidebar section a page belongs to.
 *
 * `reference` is a package's generated `docs/reference/` tree or a single
 * hand-authored `docs/reference.md`; `changelog` is a `docs/changelog/` folder
 * per `docs/specs/packages-changelog.md`. Everything else, the package overview
 * included, is a guide.
 */
export function sectionOf(document: Pick<PublicDocument, "relativePath">): DocumentSection {
  const { relativePath } = document;
  if (relativePath === "changelog.md" || relativePath.startsWith("changelog/")) {
    return "changelog";
  }
  if (relativePath === "reference.md" || relativePath.startsWith("reference/")) {
    return "reference";
  }
  return "guides";
}
