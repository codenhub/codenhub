import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { createDemoIntegration, discoverBuiltDemos } from "./demo-integration";

describe("discoverBuiltDemos", () => {
  it("finds only packages with a demo/package.json, sorted by slug", async () => {
    const packagesRoot = await mkdtemp(path.join(tmpdir(), "codenhub-demo-discovery-"));
    await mkdir(path.join(packagesRoot, "icons", "demo"), { recursive: true });
    await writeFile(path.join(packagesRoot, "icons", "demo", "package.json"), "{}");
    await mkdir(path.join(packagesRoot, "error", "demo"), { recursive: true });
    await writeFile(path.join(packagesRoot, "error", "demo", "package.json"), "{}");
    await mkdir(path.join(packagesRoot, "store"), { recursive: true });

    expect(discoverBuiltDemos(packagesRoot)).toEqual([
      { distPath: path.join(packagesRoot, "error", "demo", "dist"), slug: "error" },
      { distPath: path.join(packagesRoot, "icons", "demo", "dist"), slug: "icons" },
    ]);
  });
});

describe("createDemoIntegration", () => {
  it("copies every discovered demo's dist/ into dist/<slug>/", async () => {
    const demoDist = await mkdtemp(path.join(tmpdir(), "codenhub-demo-source-"));
    await writeFile(path.join(demoDist, "index.html"), "<p>icons demo</p>");
    const outputRoot = await mkdtemp(path.join(tmpdir(), "codenhub-demo-output-"));
    const integration = createDemoIntegration({
      discoverBuiltDemos: () => [{ distPath: demoDist, slug: "icons" }],
      packagesRoot: "C:/repo/packages",
    });

    await integration.hooks["astro:build:done"]!({ dir: pathToFileURL(`${outputRoot}/`) } as never);

    const copied = await readdir(path.join(outputRoot, "icons"));
    expect(copied).toEqual(["index.html"]);
  });

  it("fails the build when a discovered demo has no built dist/ output", async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), "codenhub-demo-output-"));
    const integration = createDemoIntegration({
      discoverBuiltDemos: () => [{ distPath: "C:/repo/packages/icons/demo/dist", slug: "icons" }],
      packagesRoot: "C:/repo/packages",
    });

    await expect(
      integration.hooks["astro:build:done"]!({ dir: pathToFileURL(`${outputRoot}/`) } as never),
    ).rejects.toThrow("icons demo has no built dist/ output");
  });

  it("passes the configured packagesRoot to discovery", async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), "codenhub-demo-output-"));
    const discoverBuiltDemos = vi.fn().mockReturnValue([]);
    const integration = createDemoIntegration({ discoverBuiltDemos, packagesRoot: "C:/repo/packages" });

    await integration.hooks["astro:build:done"]!({ dir: pathToFileURL(`${outputRoot}/`) } as never);

    expect(discoverBuiltDemos).toHaveBeenCalledWith("C:/repo/packages");
  });
});
