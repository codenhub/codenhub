import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { discoverPublicResources, type PublicResource } from "@codenhub/tools/documentation";
import { describe, expect, it } from "vitest";

import { copyPublicResources, createResourceMiddleware } from "./resource-publisher";

describe("package documentation resources", () => {
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
