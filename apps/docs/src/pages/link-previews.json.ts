import type { APIRoute } from "astro";

import { packages } from "../lib/catalog";
import { SECTION_LABELS, sectionOf } from "../lib/document-section";
import { buildLinkPreviewIndex } from "../lib/link-preview/build-index";

/**
 * Emits the link-preview data as a static asset.
 *
 * Like the search index, a page fetches it the first time a reader points at a
 * link, so a reader who never does never pays for it.
 */
export const GET: APIRoute = () =>
  Response.json(
    buildLinkPreviewIndex(
      packages.map(({ documents, label }) => ({
        documents: documents.map((document) => ({
          description: document.description,
          headings: document.headings,
          html: document.html,
          relativePath: document.relativePath,
          route: document.route,
          sectionLabel: SECTION_LABELS[sectionOf(document)],
          title: document.title,
        })),
        label,
      })),
    ),
  );
