import { buildSitemapXml } from "@codenhub/app-shell/seo";
import type { APIRoute } from "astro";

import { catalogPackages } from "../lib/catalog";
import { siteConfig } from "../site-config";

// The index and one page per listed package. Documentation and demos live on
// other origins, so their URLs belong to their own sitemaps, not this one.
export const GET: APIRoute = () =>
  new Response(buildSitemapXml(siteConfig.siteUrl, ["/", ...catalogPackages.map(({ slug }) => `/${slug}/`)]), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
