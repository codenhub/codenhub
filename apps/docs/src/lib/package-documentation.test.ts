import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadPackageDocumentation, loadWorkspaceDocumentation } from "./package-documentation";

async function createPackageFixture(): Promise<string> {
  const rootPath = await mkdtemp(path.join(tmpdir(), "codenhub-package-docs-"));
  await mkdir(path.join(rootPath, "docs", "assets"), { recursive: true });
  await Promise.all([
    writeFile(path.join(rootPath, "README.md"), "# Example\n\n[Docs](docs/index.md)"),
    writeFile(path.join(rootPath, "llms.txt"), "# Example\n\n[Docs](docs/index.md)"),
    writeFile(path.join(rootPath, "llms-full.txt"), "# Example\n\n[Docs](docs/index.md)"),
    writeFile(path.join(rootPath, "docs", "index.md"), "# Example"),
    writeFile(path.join(rootPath, "docs", "assets", "diagram.svg"), "<svg/>"),
  ]);
  return rootPath;
}

describe("package documentation loading", () => {
  it("validates source files against pack output and returns public resources", async () => {
    const rootPath = await createPackageFixture();
    const runCommand = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([
        {
          files: ["README.md", "llms.txt", "llms-full.txt", "docs/index.md", "docs/assets/diagram.svg"].map(
            (filePath) => ({ path: filePath }),
          ),
        },
      ]),
    });

    await expect(loadPackageDocumentation({ rootPath, runCommand, slug: "example" })).resolves.toEqual([
      {
        packagePath: "docs/assets/diagram.svg",
        rootPath,
        routePath: "/example/assets/diagram.svg",
      },
    ]);
  });

  it("fails with source and target context when validation finds issues", async () => {
    const rootPath = await createPackageFixture();
    await writeFile(path.join(rootPath, "README.md"), "# Example\n\n[Missing](docs/missing.md)");
    const runCommand = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([
        {
          files: ["README.md", "llms.txt", "llms-full.txt", "docs/index.md"].map((filePath) => ({ path: filePath })),
        },
      ]),
    });

    await expect(loadPackageDocumentation({ rootPath, runCommand, slug: "example" })).rejects.toThrow(
      "README.md: missing-target (docs/missing.md)",
    );
  });

  it("aggregates workspace package failures in deterministic order", async () => {
    const packagesRoot = await mkdtemp(path.join(tmpdir(), "codenhub-workspace-docs-"));
    await Promise.all(
      ["beta", "alpha"].map(async (name) => {
        const rootPath = path.join(packagesRoot, name);
        await mkdir(rootPath);
        await writeFile(
          path.join(rootPath, "package.json"),
          JSON.stringify({
            codenhub: { docs: { label: name, status: "active" } },
            name: `@codenhub/${name}`,
          }),
        );
      }),
    );
    const loadPackage = vi.fn(async ({ rootPath }: { rootPath: string }) => {
      throw new Error(`Invalid ${path.basename(rootPath)}`);
    });

    await expect(loadWorkspaceDocumentation(packagesRoot, loadPackage)).rejects.toThrow("Invalid alpha\nInvalid beta");
  });
});
