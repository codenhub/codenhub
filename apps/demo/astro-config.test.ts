import { describe, expect, it } from "vitest";

import config from "./astro.config";
import { siteConfig } from "./src/site-config";

describe("Astro configuration", () => {
  it("sets the canonical site used by robots.txt and sitemap.xml", () => {
    expect(config.site).toBe(siteConfig.baseUrl);
  });

  it("installs the package demo aggregation integration", () => {
    expect(config.integrations).toEqual([expect.objectContaining({ name: "codenhub-package-demos" })]);
  });
});
