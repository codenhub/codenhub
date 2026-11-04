import type { TranslationLocale } from "@codenhub/tools/documentation";
import type { APIRoute, GetStaticPaths } from "astro";

import { buildLocaleSearchIndex, translatedLocales } from "../../lib/search/locale-search-index";

interface Props {
  locale: TranslationLocale;
}

/** One search index per locale that has pages, covering what its navigation lists. */
export const getStaticPaths = (() =>
  translatedLocales().map((locale) => ({ params: { locale }, props: { locale } }))) satisfies GetStaticPaths;

export const GET: APIRoute<Props> = ({ props }) => Response.json(buildLocaleSearchIndex(props.locale));
