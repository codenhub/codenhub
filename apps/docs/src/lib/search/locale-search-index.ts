import type { SearchEntry } from "@codenhub/app-shell/search";
import type { TranslationLocale } from "@codenhub/tools/documentation";

import type { Locale } from "../../i18n";
import { navigationDocuments, packages } from "../catalog";
import { buildSearchIndex } from "./build-index";

/**
 * Builds the search index for one page language.
 *
 * It covers what that language's navigation lists in every package: the
 * translation where one exists, and the English page otherwise
 * (`docs/specs/packages-translations.md`, "Documentation site"). A curated
 * overview page is left out: each line on it repeats a sibling's own entry.
 * @param locale The page language.
 * @returns The language's search entries.
 */
export function buildLocaleSearchIndex(locale: Locale): SearchEntry[] {
  return buildSearchIndex(
    packages.map((publicPackage) => ({
      documents: navigationDocuments(publicPackage, locale)
        .filter((document) => document.curated !== true)
        .map(({ headings, html, relativePath, route, title }) => ({ headings, html, relativePath, route, title })),
      label: publicPackage.label,
    })),
  );
}

/**
 * The locales any package has a translation in, which are the locales that have pages.
 * @returns Those locales, without duplicates.
 */
export function translatedLocales(): TranslationLocale[] {
  return [
    ...new Set(packages.flatMap((publicPackage) => Object.keys(publicPackage.localeDocuments) as TranslationLocale[])),
  ];
}
