import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  copyPublicResources,
  createResourceMiddleware,
  discoverPublicResources,
  type PublicResource,
} from "./resource-publisher";

describe("package documentation resources", () => {
  it("discovers public non-Markdown docs and package legal files with stable routes", () => {
    expect(
      discoverPublicResources("example", [
        "LICENSE",
        "README.md",
        "docs/.npmignore",
        "docs/assets/diagram.svg",
        "docs/internal/secret.txt",
        "docs/reference.md",
      ]).map(({ packagePath, routePath }) => ({ packagePath, routePath })),
    ).toEqual([
      { packagePath: "LICENSE", routePath: "/example/LICENSE" },
      { packagePath: "docs/assets/diagram.svg", routePath: "/example/assets/diagram.svg" },
    ]);
  });

  it("rejects resources that collide with generated document output", () => {
    expect(() => discoverPublicResources("example", ["docs/index.md", "docs/index.html"])).toThrow(
      "collides with a documentation page",
    );
    expect(() => discoverPublicResources("example", ["docs/guides/index.md", "docs/guides"])).toThrow(
      "collides with a documentation page",
    );
    expect(() =>
      discoverPublicResources("example", ["docs/reference.md", "docs/reference/index.html/details.txt"]),
    ).toThrow("collides with a documentation page");
  });

  it("rejects duplicate resource routes using portable casing", () => {
    expect(() => discoverPublicResources("example", ["NOTICE", "docs/notice"])).toThrow(
      "Duplicate public resource route",
    );
  });

  it("serves discovered resources in development", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "codenhub-resource-"));
    await mkdir(path.join(rootPath, "docs", "assets"), { recursive: true });
    await writeFile(path.join(rootPath, "docs", "assets", "diagram.svg"), "<svg/>");
    const resources = discoverPublicResources("example", ["docs/assets/diagram.svg"]).map((resource) => ({
      ...resource,
      rootPath,
    }));
    const middleware = createResourceMiddleware(resources);
    const response = await middleware(new Request("http://localhost/example/assets/diagram.svg"));

    expect(await response?.text()).toBe("<svg/>");
    expect(response?.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("does not serve undiscovered package files", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "codenhub-resource-traversal-"));
    await writeFile(path.join(rootPath, "NOTICE"), "Notice");
    const resources: PublicResource[] = [{ packagePath: "NOTICE", rootPath, routePath: "/example/NOTICE" }];
    const middleware = createResourceMiddleware(resources);

    await expect(middleware(new Request("http://localhost/example/%2e%2e/package.json"))).resolves.toBeUndefined();
  });

  it("copies resources to their production output routes", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "codenhub-resource-source-"));
    const outputPath = await mkdtemp(path.join(tmpdir(), "codenhub-resource-output-"));
    await mkdir(path.join(rootPath, "docs", "assets"), { recursive: true });
    await writeFile(path.join(rootPath, "docs", "assets", "diagram.svg"), "<svg/>");
    const resources = discoverPublicResources("example", ["docs/assets/diagram.svg"]).map((resource) => ({
      ...resource,
      rootPath,
    }));

    await copyPublicResources(resources, outputPath);

    await expect(readFile(path.join(outputPath, "example", "assets", "diagram.svg"), "utf8")).resolves.toBe("<svg/>");
  });
});
