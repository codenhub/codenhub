import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import config from "./astro.config";
import { siteConfig } from "./src/site-config";

describe("Astro configuration", () => {
  it("sets the canonical site used by robots.txt and sitemap.xml", () => {
    expect(config.site).toBe(siteConfig.baseUrl);
  });

  it("installs the package demo aggregation integrations", () => {
    expect(config.integrations).toEqual([
      expect.objectContaining({ name: "codenhub-package-demos" }),
      expect.objectContaining({ name: "codenhub-package-demos-dev-proxy" }),
    ]);
  });

  it("matches demos only at the depth supported by the aggregator", () => {
    const workspaceConfig = readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8");

    expect(workspaceConfig).toContain('"packages/*/{dev,debug,demo}"');
    expect(workspaceConfig).toContain('"packages/*/{dev,debug}/*"');
    expect(workspaceConfig).not.toContain('"packages/*/{dev,debug,demo}/*"');
  });
});
