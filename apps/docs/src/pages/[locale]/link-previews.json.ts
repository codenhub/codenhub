import { TRANSLATION_LOCALES, type TranslationLocale } from "@codenhub/tools/documentation";
import type { APIRoute, GetStaticPaths } from "astro";

import { buildLocaleLinkPreviewIndex } from "../../lib/link-preview/locale-link-preview-index";

interface Props {
  locale: TranslationLocale;
}

/** One link-preview index per locale, covering what its navigation lists. */
export const getStaticPaths = (() =>
  TRANSLATION_LOCALES.map((locale) => ({ params: { locale }, props: { locale } }))) satisfies GetStaticPaths;

export const GET: APIRoute<Props> = ({ props }) => Response.json(buildLocaleLinkPreviewIndex(props.locale));
