import type { APIRoute } from "astro";

import { buildLocaleSearchIndex } from "../lib/search/locale-search-index";

/**
 * Emits the English search index as a static asset.
 *
 * The palette fetches it on first open rather than shipping it in the page
 * bundle, so a reader who never searches never pays for it. Each locale has its
 * own at `/<locale>/search-index.json`.
 */
export const GET: APIRoute = () => Response.json(buildLocaleSearchIndex("en"));
