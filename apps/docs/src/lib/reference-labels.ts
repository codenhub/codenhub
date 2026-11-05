import {
  REFERENCE_GROUP_LABELS,
  REFERENCE_LABELS,
  REFERENCE_LEAD_LABELS,
  REFERENCE_SENTENCE_LABELS,
  type ReferenceLabel,
} from "@codenhub/tools/documentation";
import type { MarkdownHeading } from "astro";

type Labels = Readonly<Record<ReferenceLabel, string>>;

const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Translates the generator's fixed labels on a rendered reference page
 * (`REFERENCE_LABELS`), leaving the TSDoc it frames, the signatures, and every
 * heading id as they are, so anchors match across languages. Each label is
 * replaced only in the exact shape the generator writes it, so TSDoc prose
 * that opens with the same words stays English:
 *
 * - a group H2 whose whole text it is, with its anchor link's label;
 * - a bold label alone in its paragraph or before " — ", or opening a
 *   deprecation quote;
 * - a whole sentence the generator writes, such as "Inherited from" and a
 *   link to the declaring type.
 * @param html The page's rendered HTML.
 * @param labels The labels in the page's language.
 * @param lang The page's language, set as `lang` on each translated label
 * when the body around it is in another one.
 * @returns The HTML with its labels translated.
 */
export function localizeReferenceHtml(html: string, labels: Labels, lang?: string): string {
  const langAttribute = lang === undefined ? "" : ` lang="${lang}"`;
  let localized = html;
  for (const key of REFERENCE_GROUP_LABELS) {
    const english = escapeRegExp(REFERENCE_LABELS[key]);
    // The site appends an anchor link after the heading text, labelled with it.
    const heading = new RegExp(`<h2\\b([^>]*)>${english}(<[^]*?)</h2>`, "g");
    const anchorLabel = new RegExp(`(aria-label="[^"]*)${english}"`);
    localized = localized.replace(heading, (_match, attributes: string, rest: string) => {
      const anchor = rest.replace(anchorLabel, (_label, start: string) => `${start}${labels[key]}"`);
      return `<h2${attributes}${langAttribute}>${labels[key]}${anchor}</h2>`;
    });
  }
  for (const key of REFERENCE_LEAD_LABELS) {
    const english = escapeRegExp(REFERENCE_LABELS[key]);
    const lead =
      key === "deprecated"
        ? new RegExp(`(<blockquote>\\s*<p>)<strong>${english}</strong>`, "g")
        : new RegExp(`(<p>)<strong>${english}</strong>(?=</p>| —)`, "g");
    localized = localized.replace(
      lead,
      (_match, open: string) => `${open}<strong${langAttribute}>${labels[key]}</strong>`,
    );
  }
  // What a generated sentence names: links and code spans, comma-separated.
  const item = "(?:<a\\b[^>]*>(?:<code>[^<]*</code>|[^<]*)</a>|<code>[^<]*</code>)";
  for (const key of REFERENCE_SENTENCE_LABELS) {
    const sentence = new RegExp(`<p>${escapeRegExp(REFERENCE_LABELS[key])} (${item}(?:, ${item})*\\.</p>)`, "g");
    // Only the label: the names after it are code, in no human language.
    const label = lang === undefined ? labels[key] : `<span${langAttribute}>${labels[key]}</span>`;
    localized = localized.replace(sentence, (_match, rest: string) => `<p>${label} ${rest}`);
  }
  return localized;
}

/**
 * Translates the group headings in a reference page's outline, as
 * {@link localizeReferenceHtml} does in its body.
 * @param headings The page's headings.
 * @param labels The labels in the page's language.
 * @returns The headings, group H2s translated.
 */
export function localizeReferenceHeadings(headings: readonly MarkdownHeading[], labels: Labels): MarkdownHeading[] {
  return headings.map((heading) => {
    const key =
      heading.depth === 2
        ? REFERENCE_GROUP_LABELS.find((group) => REFERENCE_LABELS[group] === heading.text)
        : undefined;
    return key === undefined ? heading : { ...heading, text: labels[key] };
  });
}
