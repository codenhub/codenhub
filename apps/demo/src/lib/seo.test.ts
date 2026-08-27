import { describe, expect, it } from "vitest";

import { buildRobotsTxt, buildSitemapXml } from "./seo";

describe("buildRobotsTxt", () => {
  it("allows every crawler and points at the sitemap", () => {
    expect(buildRobotsTxt("https://demo.codenhub.dev")).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://demo.codenhub.dev/sitemap.xml\n",
    );
  });
});

describe("buildSitemapXml", () => {
  it("lists the shell root and every mounted demo", () => {
    const body = buildSitemapXml("https://demo.codenhub.dev", [
      { label: "icons", slug: "icons" },
      { label: "error", slug: "error" },
    ]);

    expect(body).toContain("<loc>https://demo.codenhub.dev/</loc>");
    expect(body).toContain("<loc>https://demo.codenhub.dev/demo/icons/</loc>");
    expect(body).toContain("<loc>https://demo.codenhub.dev/demo/error/</loc>");
  });

  it("lists only the shell root when no demo is mounted", () => {
    const body = buildSitemapXml("https://demo.codenhub.dev", []);

    expect(body).toContain("<loc>https://demo.codenhub.dev/</loc>");
    expect(body).not.toContain("/demo/");
  });
});
