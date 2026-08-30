import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { planAssetSyncs } from "./prepare.ts";

const BIN_NAME = process.platform === "win32" ? "hub.CMD" : "hub";

function createPackage(root: string, location: string, manifest: Record<string, unknown>): WorkspacePackage {
  const name = location.slice(location.lastIndexOf("/") + 1);
  return {
    directory: join(root, location),
    directoryName: name,
    isPrivate: true,
    location,
    manifest,
    name: `@codenhub/${name}`,
    scripts: {},
    unscopedName: name,
    workspaceDependencies: [],
  };
}

async function installHubBinary(root: string): Promise<void> {
  const binDirectory = join(root, "node_modules", ".bin");
  await mkdir(binDirectory, { recursive: true });
  await writeFile(join(binDirectory, BIN_NAME), "");
}

describe("planAssetSyncs", () => {
  it("returns nothing when no selected package declares codenhub.assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "codenhub-assets-prepare-"));
    const packages = [createPackage(root, "apps/demo", {})];

    await expect(planAssetSyncs(root, packages)).resolves.toEqual([]);
  });

  it("builds one hub assets invocation per declaring package", async () => {
    const root = await mkdtemp(join(tmpdir(), "codenhub-assets-prepare-"));
    await installHubBinary(root);
    const packages = [
      createPackage(root, "apps/demo", {
        codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
      }),
      createPackage(root, "apps/docs", {}),
    ];

    const specs = await planAssetSyncs(root, packages);

    expect(specs).toEqual([
      { args: ["assets", "@codenhub/demo"], command: join(root, "node_modules", ".bin", BIN_NAME), cwd: root },
    ]);
  });

  it("throws when no hub binary is installed", async () => {
    const root = await mkdtemp(join(tmpdir(), "codenhub-assets-prepare-"));
    const packages = [
      createPackage(root, "apps/demo", {
        codenhub: { assets: [{ from: "favicon/favicon.ico", to: "public/favicon.ico" }] },
      }),
    ];

    await expect(planAssetSyncs(root, packages)).rejects.toThrow(/Could not find the `hub` binary/);
  });
});
