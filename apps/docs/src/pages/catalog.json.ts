import { resolveDocsVersionRedirects } from "@codenhub/tools/release";
import type { APIRoute } from "astro";

import { archivedPackages, packages, versionRedirectSources, type PublicPackage } from "../lib/catalog";
import { buildSiteCatalog, type CatalogVersionSource } from "../lib/site-catalog";
import { siteConfig } from "../site-config";

const versionSource = (publicPackage: PublicPackage): CatalogVersionSource[] =>
  publicPackage.version === undefined
    ? []
    : [
        {
          archived: publicPackage.archivedVersion !== undefined,
          documents: publicPackage.documents,
          localeDocuments: publicPackage.localeDocuments,
          version: publicPackage.version,
        },
      ];

/**
 * Emits the site's machine-readable catalog of packages, served versions, pages,
 * and translations (`docs/specs/packages-documentation.md`, "Catalog").
 */
export const GET: APIRoute = () =>
  Response.json(
    buildSiteCatalog(
      siteConfig.siteUrl,
      packages.map((publicPackage) => {
        const redirectSource = versionRedirectSources.find(({ slug }) => slug === publicPackage.slug);
        return {
          ...publicPackage,
          redirects:
            redirectSource === undefined
              ? []
              : resolveDocsVersionRedirects(redirectSource.versions, {
                  archived: redirectSource.archived,
                  current: redirectSource.current,
                }),
          versions: [
            ...versionSource(publicPackage),
            ...archivedPackages.filter(({ slug }) => slug === publicPackage.slug).flatMap(versionSource),
          ],
        };
      }),
    ),
  );
