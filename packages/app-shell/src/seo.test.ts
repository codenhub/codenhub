import { describe, expect, it } from "vitest";

import { buildRobotsTxt, buildSitemapXml } from "./seo.ts";

describe("buildRobotsTxt", () => {
  it("allows every crawler and points at the sitemap", () => {
    expect(buildRobotsTxt("https://codenhub.dev")).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://codenhub.dev/sitemap.xml\n",
    );
  });
});

describe("buildSitemapXml", () => {
  it("lists every supplied route under the base URL", () => {
    const body = buildSitemapXml("https://codenhub.dev", ["/", "/about/"]);

    expect(body).toContain("<loc>https://codenhub.dev/</loc>");
    expect(body).toContain("<loc>https://codenhub.dev/about/</loc>");
  });

  it("emits a well-formed urlset when only the root is listed", () => {
    const body = buildSitemapXml("https://codenhub.dev", ["/"]);

    expect(body).toContain("<url><loc>https://codenhub.dev/</loc></url>");
    expect(body.match(/<url>/g)).toHaveLength(1);
    expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("XML-escapes a route so an ampersand does not break the document", () => {
    const body = buildSitemapXml("https://codenhub.dev", ["/r&d/"]);

    expect(body).toContain("<loc>https://codenhub.dev/r&amp;d/</loc>");
    expect(body).not.toContain("/r&d/");
  });
});
