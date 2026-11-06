import type { APIRoute, GetStaticPaths } from "astro";

import { archivedPackages, packages, publishedPages, type PublicDocument } from "../../lib/catalog";

interface Props {
  document: PublicDocument;
}

/** Each page's Markdown, at `index.md` inside the page's own route. */
export const getStaticPaths = (() =>
  [...packages, ...archivedPackages].flatMap((packageEntry) =>
    publishedPages(packageEntry).map(({ document }) => ({
      params: { path: document.route.slice(1, -1) },
      props: { document },
    })),
  )) satisfies GetStaticPaths;

export const GET: APIRoute<Props> = ({ props }) =>
  new Response(props.document.markdown, { headers: { "content-type": "text/markdown; charset=utf-8" } });
