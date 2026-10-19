import { buildSitemapXml } from "@codenhub/app-shell/seo";
import type { APIRoute } from "astro";

import { demoSlugs } from "../lib/catalog";
import { siteConfig } from "../site-config";

const routePaths = demoSlugs.map((slug) => `/${slug}/`);

export const GET: APIRoute = () =>
  new Response(buildSitemapXml(siteConfig.siteUrl, routePaths), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
