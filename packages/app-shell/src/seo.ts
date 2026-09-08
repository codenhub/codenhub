/**
 * Builds a `robots.txt` body that allows every crawler and points at the
 * sitemap for `baseUrl`.
 *
 * @param baseUrl - Canonical origin of the surface, without a trailing slash.
 * @returns The file body, newline-terminated.
 */
export function buildRobotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

/**
 * Builds a `sitemap.xml` body listing each supplied route under `baseUrl`.
 *
 * The caller passes every path it wants listed, root included, so the helper
 * stays agnostic about how a surface enumerates its own pages. Paths are used
 * verbatim, so they carry their own leading slash.
 *
 * @param baseUrl - Canonical origin of the surface, without a trailing slash.
 * @param routePaths - Absolute paths to list, such as `["/", "/about/"]`.
 * @returns The XML body, newline-terminated.
 */
export function buildSitemapXml(baseUrl: string, routePaths: readonly string[]): string {
  const urls = routePaths.map((routePath) => `  <url><loc>${baseUrl}${routePath}</loc></url>`);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
