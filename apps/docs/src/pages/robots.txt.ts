import { buildRobotsTxt } from "@codenhub/app-shell/seo";
import type { APIRoute } from "astro";

import { siteConfig } from "../site-config";

export const GET: APIRoute = () =>
  new Response(buildRobotsTxt(siteConfig.siteUrl), { headers: { "content-type": "text/plain; charset=utf-8" } });
