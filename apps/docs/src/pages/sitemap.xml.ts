import { buildSitemapXml } from "@codenhub/app-shell/seo";
import type { APIRoute } from "astro";

import { packages } from "../lib/catalog";
import { siteConfig } from "../site-config";

// Every page the site publishes: each package's documents in catalog order.
// `documents` already excludes the siblings a curated `index.md` does not link,
// so an unpublished version never reaches the sitemap.
const routePaths = packages.flatMap((entry) => entry.documents.map((document) => document.route));

export const GET: APIRoute = () =>
  new Response(buildSitemapXml(siteConfig.siteUrl, routePaths), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
