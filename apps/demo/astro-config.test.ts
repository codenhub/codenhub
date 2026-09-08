import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import config from "./astro.config";
import { siteConfig } from "./src/site-config";

describe("Astro configuration", () => {
  it("sets the canonical site used by robots.txt and sitemap.xml", () => {
    expect(config.site).toBe(siteConfig.siteUrl);
  });

  it("installs the package demo aggregation integrations", () => {
    expect(config.integrations).toEqual([
      expect.objectContaining({ name: "codenhub-package-demos" }),
      expect.objectContaining({ name: "codenhub-package-demos-dev-proxy" }),
    ]);
  });

  it("delivers icons in CSS mode so the shared shell's markup resolves", () => {
    const iconsPlugin = (config.vite?.plugins as { name?: string }[] | undefined)?.find(
      (plugin) => plugin?.name === "codenhub-icons",
    );

    expect(iconsPlugin).toBeDefined();
  });

  it("matches demos only at the depth supported by the aggregator", () => {
    const workspaceConfig = readFileSync(new URL("../../pnpm-workspace.yaml", import.meta.url), "utf8");

    expect(workspaceConfig).toContain('"packages/*/{dev,debug,demo}"');
    expect(workspaceConfig).toContain('"packages/*/{dev,debug}/*"');
    expect(workspaceConfig).not.toContain('"packages/*/{dev,debug,demo}/*"');
  });
});
