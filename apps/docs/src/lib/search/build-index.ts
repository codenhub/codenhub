import type { SearchEntry } from "./search";

export interface IndexableHeading {
  depth: number;
  slug: string;
  text: string;
}

export interface IndexableDocument {
  /** Headings as parsed from the source, in document order. */
  headings: readonly IndexableHeading[];
  /** Compiled document HTML, as rendered into the page. */
  html: string;
  route: string;
  title: string;
}

export interface IndexablePackage {
  documents: readonly IndexableDocument[];
  label: string;
}

const HEADING_OPEN = /<h([23])[\s>]/g;
const TEXT_LIMIT = 600;

const decodeEntities = (value: string) =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");

/** Strips markup and collapses whitespace so prose is searchable as one line. */
const toText = (html: string) =>
  decodeEntities(html.replaceAll(/<[^>]*>/g, " "))
    .replaceAll(/\s+/g, " ")
    .trim();

/**
 * Locates where each `h2`/`h3` section's prose begins.
 *
 * Only the opening delimiter is matched, never the attributes: an id is allowed
 * to contain `>`, and a heading can wrap its text in an anchor or a code
 * element, both of which defeat a pattern that tries to read the tag. A literal
 * `<h2` cannot appear inside text or an attribute value, because the compiler
 * escapes `<` everywhere else, so scanning for it alone is exact.
 */
const findSectionBounds = (html: string) =>
  [...html.matchAll(HEADING_OPEN)].map((match) => {
    const openIndex = match.index ?? 0;
    const closeTag = `</h${match[1]}>`;
    const closeIndex = html.indexOf(closeTag, openIndex);

    return { bodyStart: closeIndex === -1 ? openIndex : closeIndex + closeTag.length, openIndex };
  });

/**
 * Flattens the package catalog into one search entry per document plus one per
 * `h2`/`h3` section.
 *
 * Sections are the useful unit: a reader searching for a token name wants the
 * heading that documents it, not the page it happens to live on. The document
 * entry stays so a package's page is still reachable by its own title, and
 * carries the prose above the first heading, which no section would otherwise
 * cover.
 *
 * Labels come from the parsed headings rather than the compiled HTML so the
 * result reads as the author wrote it. Those headings and the compiled sections
 * are both in document order, which is what pairs them.
 */
export function buildSearchIndex(packages: readonly IndexablePackage[]): SearchEntry[] {
  return packages.flatMap((packageEntry) =>
    packageEntry.documents.flatMap((document) => {
      const headings = document.headings.filter(({ depth }) => depth === 2 || depth === 3);
      const bounds = findSectionBounds(document.html);

      const documentEntry: SearchEntry = {
        packageLabel: packageEntry.label,
        route: document.route,
        text: toText(document.html.slice(0, bounds[0]?.openIndex ?? document.html.length)).slice(0, TEXT_LIMIT),
        title: document.title,
      };

      const sections = headings.flatMap((heading, order): SearchEntry[] => {
        const bound = bounds[order];
        if (bound === undefined) {
          return [];
        }

        const end = bounds[order + 1]?.openIndex ?? document.html.length;

        return [
          {
            packageLabel: packageEntry.label,
            route: `${document.route}#${heading.slug}`,
            section: heading.text,
            text: toText(document.html.slice(bound.bodyStart, end)).slice(0, TEXT_LIMIT),
            title: document.title,
          },
        ];
      });

      return [documentEntry, ...sections];
    }),
  );
}
