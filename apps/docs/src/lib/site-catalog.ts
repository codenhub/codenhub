import { TRANSLATION_LOCALES, type PackageStatus, type TranslationLocale } from "@codenhub/tools/documentation";
import type { DocsVersionRedirect } from "@codenhub/tools/release";

import { locales, type Locale } from "../i18n";
import type { PublicDocument } from "./catalog";
import { documentMarkdownRoute } from "./document-markdown";
import { sectionOf, type DocumentSection } from "./document-section";

/** One version of a package as the catalog reads it. */
export interface CatalogVersionSource {
  /** Whether this is an archived version, served under `/<slug>/<version>/`. */
  archived?: boolean;
  /** The English pages, in the order the site sorts them. */
  documents: readonly Pick<PublicDocument, "description" | "relativePath" | "routePath" | "title">[];
  /** Each locale's pages; one whose `lang` is the locale is a translation. */
  localeDocuments: Record<TranslationLocale, readonly Pick<PublicDocument, "lang" | "relativePath">[]>;
  version: string;
}

/** One package as the catalog reads it. */
export interface CatalogPackageSource {
  description?: string;
  label: string;
  name?: string;
  /** Where each release the site does not serve redirects (`resolveDocsVersionRedirects`). */
  redirects: readonly DocsVersionRedirect[];
  slug: string;
  status: PackageStatus;
  /** The current version first, then each archived one, newest first. */
  versions: readonly CatalogVersionSource[];
}

/** One published page of a version. */
export interface CatalogPage {
  description?: string;
  /** Markdown URL of the English page. */
  markdown: string;
  /** Route path inside the version, `""` for the documentation index. */
  path: string;
  section: DocumentSection;
  title: string;
  /** Locales that translate the page; under any other locale it shows the English body. */
  translations: TranslationLocale[];
  /** URL of the English page. */
  url: string;
}

/** One version the site serves. */
export interface CatalogVersion {
  llms: string;
  llmsFull: string;
  pages: CatalogPage[];
  /** URL of the version's English documentation index. */
  url: string;
  version: string;
}

/** One documented package. */
export interface CatalogPackage {
  /** The version served at the unversioned URL. */
  current: string;
  description?: string;
  label: string;
  name?: string;
  /** Each other stable release, and the served version its URLs redirect to. */
  redirects: Record<string, string>;
  slug: string;
  status: PackageStatus;
  /** The current version first, then each archived one, newest first. */
  versions: CatalogVersion[];
}

/** The site's `catalog.json` (`docs/specs/packages-documentation.md`, "Catalog"). */
export interface SiteCatalog {
  /** Every page language, English first; any other is a URL prefix. */
  locales: Locale[];
  packages: CatalogPackage[];
}

function catalogVersion(siteUrl: string, slug: string, source: CatalogVersionSource): CatalogVersion {
  const routeSlug = source.archived === true ? `${slug}/${source.version}` : slug;
  const url = (path: string): string => new URL(`/${routeSlug}/${path}`, siteUrl).href;
  const translated = (relativePath: string): TranslationLocale[] =>
    TRANSLATION_LOCALES.filter((locale) =>
      source.localeDocuments[locale].some(
        (document) => document.relativePath === relativePath && document.lang === locale,
      ),
    );
  return {
    llms: url("llms.txt"),
    llmsFull: url("llms-full.txt"),
    pages: source.documents.map((document) => {
      const route = `/${routeSlug}/${document.routePath}`.replace(/\/$/, "") + "/";
      return {
        description: document.description,
        markdown: new URL(documentMarkdownRoute(route), siteUrl).href,
        path: document.routePath,
        section: sectionOf(document),
        title: document.title,
        translations: translated(document.relativePath),
        url: new URL(route, siteUrl).href,
      };
    }),
    url: url(""),
    version: source.version,
  };
}

/**
 * Builds the site's machine-readable catalog: every package, the versions the
 * site serves, each version's pages and their translations, and where each
 * release the site does not serve redirects.
 * @param siteUrl Site origin, which every URL is absolute against.
 * @param packages Documented packages in catalog order.
 * @returns The catalog.
 */
export function buildSiteCatalog(siteUrl: string, packages: readonly CatalogPackageSource[]): SiteCatalog {
  return {
    locales: [...locales],
    packages: packages.flatMap((source) => {
      const current = source.versions[0]?.version;
      if (current === undefined) {
        return [];
      }
      return [
        {
          current,
          description: source.description,
          label: source.label,
          name: source.name,
          redirects: Object.fromEntries(
            source.redirects
              .filter(({ from }) => from !== current)
              .map(({ from, to }) => [from, to ?? current] as const),
          ),
          slug: source.slug,
          status: source.status,
          versions: source.versions.map((version) => catalogVersion(siteUrl, source.slug, version)),
        },
      ];
    }),
  };
}
