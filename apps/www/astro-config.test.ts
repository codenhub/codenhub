import { describe, expect, it } from "vitest";

import config from "./astro.config";
import { siteConfig } from "./src/site-config";

describe("Astro configuration", () => {
  it("sets the canonical site used by robots.txt and sitemap.xml", () => {
    expect(config.site).toBe(siteConfig.siteUrl);
  });

  it("delivers icons in CSS mode so the shared shell's markup resolves", () => {
    const iconsPlugin = (config.vite?.plugins as { name?: string }[] | undefined)?.find(
      (plugin) => plugin?.name === "codenhub-icons",
    );

    expect(iconsPlugin).toBeDefined();
  });
});
