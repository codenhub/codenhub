import type { APIRoute } from "astro";

import { buildLocaleLinkPreviewIndex } from "../lib/link-preview/locale-link-preview-index";

/**
 * Emits the English link-preview data as a static asset.
 *
 * Like the search index, a page fetches it the first time a reader points at a
 * link, so a reader who never does never pays for it. Each locale has its own
 * at `/<locale>/link-previews.json`.
 */
export const GET: APIRoute = () => Response.json(buildLocaleLinkPreviewIndex("en"));
