import { TRANSLATION_LOCALES, type TranslationLocale } from "@codenhub/tools/documentation";
import type { APIRoute, GetStaticPaths } from "astro";

import { buildLocaleSearchIndex } from "../../lib/search/locale-search-index";

interface Props {
  locale: TranslationLocale;
}

/** One search index per locale, covering what its navigation lists. */
export const getStaticPaths = (() =>
  TRANSLATION_LOCALES.map((locale) => ({ params: { locale }, props: { locale } }))) satisfies GetStaticPaths;

export const GET: APIRoute<Props> = ({ props }) => Response.json(buildLocaleSearchIndex(props.locale));
