import type { DemoPackage } from "./catalog";

export function buildRobotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

export function buildSitemapXml(baseUrl: string, demoPackages: DemoPackage[]): string {
  const urlEntry = (routePath: string) => `  <url><loc>${baseUrl}${routePath}</loc></url>`;
  const urls = [urlEntry("/"), ...demoPackages.map((demoPackage) => urlEntry(`/demo/${demoPackage.slug}/`))];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
