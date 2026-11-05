/**
 * The site's Markdown pipeline, shared by `astro.config.ts`, which compiles
 * every document in its own language, and the catalog, which renders an
 * English document again for each locale it is shown under untranslated.
 */
import { rehypeHeadingIds, unified, type MarkdownRenderer, type ShikiConfig } from "@astrojs/markdown-remark";
import { remarkAlerts } from "@codenhub/app-shell/remark-alerts";

import type { Locale } from "../../i18n";
import { createCodeBlockTransformer } from "./code-blocks";
import { rehypeMarkdownEnhancements } from "./rehype-enhancements";

export const shikiConfig: ShikiConfig = {
  theme: "github-dark-default",
  transformers: [createCodeBlockTransformer()],
};

/**
 * The Markdown processor, with its added controls in a page language.
 * @param locale The page's language; omitted, each document's own language.
 * @returns The processor.
 */
export function markdownProcessor(locale?: Locale) {
  return unified({
    rehypePlugins: [
      rehypeHeadingIds,
      locale === undefined ? rehypeMarkdownEnhancements : [rehypeMarkdownEnhancements, { locale }],
    ],
    remarkPlugins: [remarkAlerts],
  });
}

const renderers = new Map<Locale, Promise<MarkdownRenderer>>();

/**
 * A renderer whose added controls speak `locale`, one per locale for the build.
 * @param locale The page's language.
 * @returns The renderer.
 */
export function rendererFor(locale: Locale): Promise<MarkdownRenderer> {
  let renderer = renderers.get(locale);
  if (renderer === undefined) {
    renderer = markdownProcessor(locale).createRenderer({ shikiConfig });
    renderers.set(locale, renderer);
  }
  return renderer;
}
