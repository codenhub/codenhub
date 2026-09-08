import { buildSitemapXml } from "@codenhub/app-shell/seo";
import type { APIRoute } from "astro";

import { siteConfig } from "../site-config";

// The index is a single page. The package list links out to other origins, so
// those URLs belong to their own sitemaps, not this one.
export const GET: APIRoute = () =>
  new Response(buildSitemapXml(siteConfig.siteUrl, ["/"]), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
