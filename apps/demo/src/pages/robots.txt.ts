import type { APIRoute } from "astro";

import { buildRobotsTxt } from "../lib/seo";
import { siteConfig } from "../site-config";

export const GET: APIRoute = () =>
  new Response(buildRobotsTxt(siteConfig.baseUrl), { headers: { "content-type": "text/plain; charset=utf-8" } });
