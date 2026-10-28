import type { APIRoute } from "astro";

import { packages } from "../lib/catalog";
import { buildSiteLlmsTxt } from "../lib/site-llms";
import { siteConfig } from "../site-config";

// Every catalog package publishes both LLM files: `hub check` requires them, and
// the documentation loader fails the build without them.
export const GET: APIRoute = () =>
  new Response(buildSiteLlmsTxt(siteConfig, packages), { headers: { "content-type": "text/plain; charset=utf-8" } });
