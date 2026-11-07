import type { MarkdownHeading } from "astro";

type Heading = Pick<MarkdownHeading, "depth" | "slug">;

/**
 * Maps each English heading id of a page to its translation's heading id at
 * the same position, so an English section link still reaches its section on
 * the translated page (`docs/specs/packages-translations.md`, "Section links").
 * Ids that are the same in both languages are left out.
 * @param english The English page's headings, in document order.
 * @param translated The translation's headings, in document order.
 * @returns Translated ids by English id; empty when the heading structures differ.
 */
export function translatedFragments(
  english: readonly Heading[],
  translated: readonly Heading[],
): Record<string, string> {
  if (english.length !== translated.length || english.some(({ depth }, index) => depth !== translated[index]!.depth)) {
    return {};
  }
  return Object.fromEntries(
    english.flatMap(({ slug }, index) => {
      const target = translated[index]!.slug;
      return slug === target ? [] : [[slug, target]];
    }),
  );
}
