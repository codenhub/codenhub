import { buildSitemapXml } from "@codenhub/app-shell/seo";
import type { APIRoute } from "astro";

import { packages, publishedPages } from "../lib/catalog";
import { siteConfig } from "../site-config";

// Every page the site publishes in its own language: each package's English
// documents in catalog order, then its translations. An untranslated page under
// a locale prefix names the English page as canonical, so it is left out.
// `documents` already excludes the siblings a curated `index.md` does not link,
// so an unpublished version never reaches the sitemap.
const routePaths = packages.flatMap((entry) =>
  publishedPages(entry)
    .filter(({ document, locale }) => document.lang === locale)
    .map(({ document }) => document.route),
);

export const GET: APIRoute = () =>
  new Response(buildSitemapXml(siteConfig.siteUrl, routePaths), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
