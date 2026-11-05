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
 * replaced only where the generator writes it: a group H2 whose whole text it
 * is, a bold label opening a paragraph, or the start of a sentence the
 * generator writes.
 * @param html The page's rendered HTML.
 * @param labels The labels in the page's language.
 * @returns The HTML with its labels translated.
 */
export function localizeReferenceHtml(html: string, labels: Labels): string {
  let localized = html;
  for (const key of REFERENCE_GROUP_LABELS) {
    // The site appends an anchor link after the heading text.
    const heading = new RegExp(`(<h2\\b[^>]*>)${escapeRegExp(REFERENCE_LABELS[key])}(?=<)`, "g");
    localized = localized.replace(heading, (_match, open: string) => `${open}${labels[key]}`);
  }
  for (const key of REFERENCE_LEAD_LABELS) {
    localized = localized.replaceAll(
      `<p><strong>${REFERENCE_LABELS[key]}</strong>`,
      `<p><strong>${labels[key]}</strong>`,
    );
  }
  for (const key of REFERENCE_SENTENCE_LABELS) {
    localized = localized.replaceAll(`<p>${REFERENCE_LABELS[key]} `, `<p>${labels[key]} `);
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
