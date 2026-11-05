import { messagesFor, type Locale } from "../../i18n";
import { navigationDocuments, packages } from "../catalog";
import { sectionOf } from "../document-section";
import { buildLinkPreviewIndex, type LinkPreviewIndex } from "./build-index";

/**
 * Builds the link-preview data for one page language.
 *
 * It covers what that language's navigation lists in every package, the pages
 * its links can lead to: the translation where one exists, and the English page
 * otherwise. Each trail names the page's section in that language.
 * @param locale The page language.
 * @returns The language's previews, keyed by route.
 */
export function buildLocaleLinkPreviewIndex(locale: Locale): LinkPreviewIndex {
  const { sections } = messagesFor(locale);
  return buildLinkPreviewIndex(
    packages.map((publicPackage) => ({
      documents: navigationDocuments(publicPackage, locale).map((document) => ({
        description: document.description,
        headings: document.headings,
        html: document.html,
        relativePath: document.relativePath,
        route: document.route,
        sectionLabel: sections[sectionOf(document)],
        title: document.title,
      })),
      label: publicPackage.label,
    })),
  );
}
