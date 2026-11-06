import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { snapshotDocsVersionsPath } from "@codenhub/tools/release";
import { describe, expect, it } from "vitest";

import { loadArchivedResources } from "./archived-resources";

describe("loadArchivedResources", () => {
  it("has nothing to publish when the snapshot lists no versions", async () => {
    const snapshotRoot = await mkdtemp(path.join(tmpdir(), "codenhub-archived-none-"));

    await expect(loadArchivedResources(snapshotRoot)).resolves.toEqual({ resources: [], warnings: [] });
  });

  it("publishes each archived version's resources under its version's route and leaves out one it cannot list", async () => {
    const snapshotRoot = await mkdtemp(path.join(tmpdir(), "codenhub-archived-"));
    const versionRoot = path.join(snapshotRoot, "archived", "packages", "example", "1.0.0");
    await mkdir(versionRoot, { recursive: true });
    await writeFile(path.join(versionRoot, "llms.txt"), "- [Overview](docs/index.md)\n");
    await writeFile(
      snapshotDocsVersionsPath(snapshotRoot),
      JSON.stringify({
        "@codenhub/example": {
          archived: ["1.0.0", "0.9.0"],
          current: "2.0.0",
          location: "packages/example",
          slug: "example",
          versions: ["0.9.0", "1.0.0", "2.0.0"],
        },
      }),
    );

    const { resources, warnings } = await loadArchivedResources(snapshotRoot);

    expect(resources).toEqual([
      { packagePath: "llms.txt", rootPath: versionRoot, routePath: "/example/1.0.0/llms.txt" },
    ]);
    expect(warnings).toEqual([expect.stringContaining("Left out the archived resources of @codenhub/example@0.9.0")]);
  });
});
