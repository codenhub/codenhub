import { buildSitemapXml } from "@codenhub/app-shell/seo";
import type { APIRoute } from "astro";

import { packages } from "../lib/catalog";
import { siteConfig } from "../site-config";

// Every page the site publishes: the package index, then each package's
// documents in catalog order. `documents` already excludes a curated changelog
// `index.md`, so an unpublished entrypoint never reaches the sitemap.
const routePaths = ["/", ...packages.flatMap((entry) => entry.documents.map((document) => document.route))];

export const GET: APIRoute = () =>
  new Response(buildSitemapXml(siteConfig.siteUrl, routePaths), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
