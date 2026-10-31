import type { APIRoute } from "astro";

import { packages } from "../lib/catalog";
import { buildSearchIndex } from "../lib/search/build-index";

/**
 * Emits the search index as a static asset.
 *
 * The palette fetches it on first open rather than shipping it in the page
 * bundle, so a reader who never searches never pays for it. A curated
 * overview page is left out: each line on it repeats a sibling's own entry.
 */
export const GET: APIRoute = () =>
  Response.json(
    buildSearchIndex(
      packages.map(({ documents, label }) => ({
        documents: documents
          .filter((document) => document.curated !== true)
          .map(({ headings, html, relativePath, route, title }) => ({ headings, html, relativePath, route, title })),
        label,
      })),
    ),
  );
