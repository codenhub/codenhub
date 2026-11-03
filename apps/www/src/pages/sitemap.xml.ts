import { buildSitemapXml } from "@codenhub/app-shell/seo";
import type { APIRoute } from "astro";

import { routing } from "../i18n";
import { catalogPackages } from "../lib/catalog";
import { siteConfig } from "../site-config";

// The landing page, the package list, and one page per listed package, in every
// locale. Documentation and demos live on other origins, so their URLs belong to
// their own sitemaps, not this one.
export const GET: APIRoute = () =>
  new Response(
    buildSitemapXml(
      siteConfig.siteUrl,
      ["/", "/packages/", ...catalogPackages.map(({ slug }) => `/packages/${slug}/`)].flatMap((path) =>
        routing.localizeAll(path).map(({ pathname }) => pathname),
      ),
    ),
    {
      headers: { "content-type": "application/xml; charset=utf-8" },
    },
  );
