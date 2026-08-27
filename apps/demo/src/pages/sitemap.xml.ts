import type { APIRoute } from "astro";

import { demoPackages } from "../lib/catalog";
import { buildSitemapXml } from "../lib/seo";
import { siteConfig } from "../site-config";

export const GET: APIRoute = () =>
  new Response(buildSitemapXml(siteConfig.baseUrl, demoPackages), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
