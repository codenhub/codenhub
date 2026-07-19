import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { createDocumentationIntegration } from "./documentation-integration";

describe("Astro package documentation integration", () => {
  it("loads validated documentation and installs the resource dev plugin", async () => {
    const loadDocumentation = vi.fn().mockResolvedValue([]);
    const updateConfig = vi.fn();
    const integration = createDocumentationIntegration({ loadDocumentation, packagesRoot: "C:/repo/packages" });

    await integration.hooks["astro:config:setup"]!({ updateConfig } as never);

    expect(loadDocumentation).toHaveBeenCalledWith("C:/repo/packages");
    expect(updateConfig).toHaveBeenCalledWith({
      vite: { plugins: [expect.objectContaining({ name: "codenhub-public-document-resources" })] },
    });
  });

  it("fails config setup when package documentation validation fails", async () => {
    const loadDocumentation = vi.fn().mockRejectedValue(new Error("Invalid package documentation"));
    const integration = createDocumentationIntegration({ loadDocumentation, packagesRoot: "C:/repo/packages" });

    await expect(integration.hooks["astro:config:setup"]!({ updateConfig: vi.fn() } as never)).rejects.toThrow(
      "Invalid package documentation",
    );
  });

  it("publishes validated resources in the production output", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "codenhub-integration-source-"));
    const outputPath = await mkdtemp(path.join(tmpdir(), "codenhub-integration-output-"));
    await mkdir(path.join(rootPath, "docs", "assets"), { recursive: true });
    await writeFile(path.join(rootPath, "docs", "assets", "diagram.svg"), "<svg/>");
    const integration = createDocumentationIntegration({
      loadDocumentation: async () => [
        {
          packagePath: "docs/assets/diagram.svg",
          rootPath,
          routePath: "/example/assets/diagram.svg",
        },
      ],
      packagesRoot: "C:/repo/packages",
    });
    await integration.hooks["astro:config:setup"]!({ updateConfig: vi.fn() } as never);

    await integration.hooks["astro:build:done"]!({ dir: pathToFileURL(`${outputPath}/`) } as never);

    await expect(readFile(path.join(outputPath, "example", "assets", "diagram.svg"), "utf8")).resolves.toBe("<svg/>");
  });
});
