import type { APIRoute } from "astro";

import { packages } from "../lib/catalog";
import { buildSearchIndex } from "../lib/search/build-index";

/**
 * Emits the search index as a static asset.
 *
 * The palette fetches it on first open rather than shipping it in the page
 * bundle, so a reader who never searches never pays for it.
 */
export const GET: APIRoute = () =>
  Response.json(
    buildSearchIndex(
      packages.map(({ documents, label }) => ({
        documents: documents.map(({ headings, html, route, title }) => ({ headings, html, route, title })),
        label,
      })),
    ),
  );
