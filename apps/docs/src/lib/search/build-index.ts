import type { SearchEntry } from "@codenhub/app-shell/search";

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
  relativePath: string;
  route: string;
  title: string;
}

export interface IndexablePackage {
  documents: readonly IndexableDocument[];
  label: string;
}

const TEXT_LIMIT = 600;

/** Search and previews include reference members, qualified by their nearest owner. */
export function indexableHeadings(document: Pick<IndexableDocument, "headings" | "relativePath">): IndexableHeading[] {
  const isReference = document.relativePath.startsWith("reference/");
  const owners: IndexableHeading[] = [];
  return document.headings.flatMap((heading) => {
    if (heading.depth < 2 || heading.depth > (isReference ? 6 : 3)) {
      return [];
    }
    while (owners.length > 0 && (owners.at(-1)?.depth ?? 0) >= heading.depth) {
      owners.pop();
    }
    const owner = owners.at(-1);
    // Generated headings already name their owner: a member as `Owner › member`,
    // labelled `Owner.member` like the code that reads it, an index signature as
    // `Owner index signature`, and a namespace member as `Owner.member`. Only
    // prose headings inside a member still need their owner prefixed.
    const separator = `${owner?.text} › `;
    const text =
      heading.depth <= 3 || owner === undefined
        ? heading.text
        : heading.text.startsWith(separator)
          ? `${owner.text}.${heading.text.slice(separator.length)}`
          : heading.text.startsWith(`${owner.text}.`) || heading.text.startsWith(`${owner.text} `)
            ? heading.text
            : `${owner.text}.${heading.text}`;
    const qualified = { ...heading, text };
    owners.push(qualified);
    return [qualified];
  });
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", gt: ">", lt: "<", nbsp: " ", quot: '"' };

const decodeEntities = (value: string) =>
  value.replaceAll(
    /&(?:#([xX][\da-fA-F]+|\d+)|(amp|gt|lt|nbsp|quot));/g,
    (_reference, numeric: string | undefined, named: string) => {
      if (numeric === undefined) {
        return NAMED_ENTITIES[named] ?? _reference;
      }

      const isHex = /^[xX]/.test(numeric);
      const codePoint = Number.parseInt(isHex ? numeric.slice(1) : numeric, isHex ? 16 : 10);

      return codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? String.fromCodePoint(codePoint)
        : "\uFFFD";
    },
  );

/* Inline elements join their text to the neighbouring text: highlighted code
   is one span per token, and `Readonly<ErrorFeedback>` must stay one string. */
const INLINE_TAG = /^<\/?(?:a|abbr|b|code|em|i|kbd|mark|s|small|span|strong|sub|sup|wbr)\b/;

/** Strips markup and collapses whitespace so prose is searchable as one line. */
export const toText = (html: string) =>
  decodeEntities(
    html
      // A code block's header holds its language label and copy button, not content.
      .replaceAll(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/g, " ")
      // One pass over every tag: removing inline tags in a pass of their own
      // can join `<` and the text after a tag into a new tag, as in `<<span>script`.
      .replaceAll(/<[^>]*>/g, (tag) => (INLINE_TAG.test(tag) ? "" : " ")),
  )
    .replaceAll(/\s+/g, " ")
    .trim();

/**
 * Locates where each section's prose begins, including H4–H6 in reference pages.
 *
 * Only the opening delimiter is matched, never the attributes: an id is allowed
 * to contain `>`, and a heading can wrap its text in an anchor or a code
 * element, both of which defeat a pattern that tries to read the tag. A literal
 * `<h2` cannot appear inside text or an attribute value, because the compiler
 * escapes `<` everywhere else, so scanning for it alone is exact.
 */
export const findSectionBounds = (html: string, isReference = false) =>
  [...html.matchAll(isReference ? /<h([2-6])[\s>]/g : /<h([23])[\s>]/g)].map((match) => {
    const openIndex = match.index ?? 0;
    const closeTag = `</h${match[1]}>`;
    const closeIndex = html.indexOf(closeTag, openIndex);

    return { bodyStart: closeIndex === -1 ? openIndex : closeIndex + closeTag.length, openIndex };
  });

/**
 * Flattens the package catalog into one search entry per document plus one per
 * `h2`/`h3` section, plus H4–H6 members on generated reference pages.
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
      const headings = indexableHeadings(document);
      const bounds = findSectionBounds(document.html, document.relativePath.startsWith("reference/"));

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
