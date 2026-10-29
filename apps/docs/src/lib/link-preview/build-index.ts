import { findSectionBounds, toText, type IndexableHeading } from "../search/build-index";

/** What a link preview shows about one page or one section of a page. */
export interface LinkPreviewEntry {
  /** Where the target sits, outermost first, such as `["SGF", "Guides"]`. */
  trail: string[];
  title: string;
  summary?: string;
}

/** Previews keyed by route, and by `route#slug` for each `h2`/`h3` section. */
export type LinkPreviewIndex = Record<string, LinkPreviewEntry>;

export interface PreviewableDocument {
  description?: string;
  headings: readonly IndexableHeading[];
  html: string;
  route: string;
  /** Sidebar section the page sits in, such as `Guides`. */
  sectionLabel: string;
  title: string;
}

export interface PreviewablePackage {
  documents: readonly PreviewableDocument[];
  label: string;
}

/** Long enough for two or three lines on the card, short enough to read at a glance. */
const SUMMARY_LIMIT = 200;
const PARAGRAPH = /<p[\s>][\s\S]*?<\/p>/;

/** Shortens text to the limit at a word boundary, marking the cut with an ellipsis. */
function clip(text: string): string {
  if (text.length <= SUMMARY_LIMIT) {
    return text;
  }
  const cut = text.slice(0, SUMMARY_LIMIT);
  const wordEnd = cut.lastIndexOf(" ");
  return `${(wordEnd > 0 ? cut.slice(0, wordEnd) : cut).replace(/[\s,.;:]+$/, "")}…`;
}

/** The first paragraph's text, so a summary reads as prose rather than a code block or a list. */
function firstParagraph(html: string): string | undefined {
  const paragraph = PARAGRAPH.exec(html)?.[0];
  const text = paragraph === undefined ? "" : toText(paragraph);
  return text === "" ? undefined : clip(text);
}

/**
 * Builds the data behind the docs site's link previews: one entry per page and
 * one per `h2`/`h3` section, the same units search indexes.
 *
 * A page's summary is its frontmatter `description`, written for exactly this,
 * and otherwise its first paragraph. A section's summary is the first paragraph
 * under its heading.
 */
export function buildLinkPreviewIndex(packages: readonly PreviewablePackage[]): LinkPreviewIndex {
  const entries = packages.flatMap((packageEntry) =>
    packageEntry.documents.flatMap((document): [string, LinkPreviewEntry][] => {
      const headings = document.headings.filter(({ depth }) => depth === 2 || depth === 3);
      const bounds = findSectionBounds(document.html);
      const summary = document.description === undefined ? firstParagraph(document.html) : clip(document.description);

      const page: [string, LinkPreviewEntry] = [
        document.route,
        { summary, title: document.title, trail: [packageEntry.label, document.sectionLabel] },
      ];

      const sections = headings.flatMap((heading, order): [string, LinkPreviewEntry][] => {
        const bound = bounds[order];
        if (bound === undefined) {
          return [];
        }
        const end = bounds[order + 1]?.openIndex ?? document.html.length;
        return [
          [
            `${document.route}#${heading.slug}`,
            {
              summary: firstParagraph(document.html.slice(bound.bodyStart, end)),
              title: heading.text,
              trail: [packageEntry.label, document.title],
            },
          ],
        ];
      });

      return [page, ...sections];
    }),
  );

  return Object.fromEntries(entries);
}
