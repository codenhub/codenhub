import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import {
  applyBump,
  buildChangelogIndex,
  buildChangelogPage,
  cutRelease,
  insertChangelogLink,
  isVersionBump,
  replaceManifestVersion,
  resolveNextVersion,
} from "./cut.ts";

describe("applyBump", () => {
  it("raises each part and zeroes the ones below it", () => {
    expect(applyBump("1.2.3", "major")).toBe("2.0.0");
    expect(applyBump("1.2.3", "minor")).toBe("1.3.0");
    expect(applyBump("1.2.3", "patch")).toBe("1.2.4");
  });

  it("leaves a pre-release behind rather than continuing it", () => {
    expect(applyBump("1.0.0-beta.1", "patch")).toBe("1.0.1");
  });

  it("refuses a version it cannot read", () => {
    expect(() => applyBump("1.2", "patch")).toThrow("expected a major.minor.patch version");
  });
});

describe("isVersionBump", () => {
  it("recognizes the three bump names and nothing else", () => {
    expect(isVersionBump("minor")).toBe(true);
    expect(isVersionBump("0.4.0")).toBe(false);
  });
});

describe("resolveNextVersion", () => {
  it("takes an explicit version as written", () => {
    expect(resolveNextVersion("0.3.0", "1.0.0-rc.1")).toBe("1.0.0-rc.1");
  });

  it("refuses a version that does not move forward", () => {
    expect(() => resolveNextVersion("0.3.0", "0.3.0")).toThrow("does not come after");
    expect(() => resolveNextVersion("0.3.0", "0.2.0")).toThrow("does not come after");
  });
});

describe("replaceManifestVersion", () => {
  it("replaces the field and leaves the rest byte-identical", () => {
    const manifest = '{\n  "name": "@codenhub/error",\n  "version": "0.3.0",\n  "type": "module"\n}\n';

    expect(replaceManifestVersion(manifest, "0.4.0")).toBe(
      '{\n  "name": "@codenhub/error",\n  "version": "0.4.0",\n  "type": "module"\n}\n',
    );
  });

  it("refuses a manifest with no version field", () => {
    expect(() => replaceManifestVersion('{"name":"x"}', "1.0.0")).toThrow('No "version" field');
  });
});

describe("insertChangelogLink", () => {
  it("puts the new version above the newest existing one", () => {
    const index = "# Changelog\n\n- [1.1.0](1.1.0.md)\n- [1.0.0](1.0.0.md)\n";

    expect(insertChangelogLink(index, "1.2.0")).toContain("- [1.2.0](1.2.0.md)\n- [1.1.0](1.1.0.md)");
  });

  it("starts a list when the index has none", () => {
    expect(insertChangelogLink("# Changelog\n", "1.0.0")).toContain("- [1.0.0](1.0.0.md)");
  });

  it("leaves an index that already links the version untouched", () => {
    const index = "# Changelog\n\n- [1.0.0](1.0.0.md)\n";

    expect(insertChangelogLink(index, "1.0.0")).toBe(index);
  });
});

describe("buildChangelogPage", () => {
  it("carries the version, the date, and headings left to be filled in", () => {
    const page = buildChangelogPage("1.2.0", "2026-09-07");

    expect(page).toContain("title: 1.2.0");
    expect(page).toContain("date: 2026-09-07");
    expect(page).toContain("## Added");
    expect(page).toContain("TODO");
  });
});

describe("buildChangelogIndex", () => {
  it("is curated, so only the versions it links get published", () => {
    expect(buildChangelogIndex("1.0.0")).toContain("curated: true");
  });
});

async function createPackageOnDisk(version: string): Promise<WorkspacePackage> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-cut-"));
  await writeFile(join(directory, "package.json"), `{\n  "name": "@codenhub/error",\n  "version": "${version}"\n}\n`);
  return {
    directory,
    directoryName: "error",
    isPrivate: false,
    location: "packages/error",
    manifest: { name: "@codenhub/error", version },
    name: "@codenhub/error",
    scripts: {},
    unscopedName: "error",
    workspaceDependencies: [],
  };
}

describe("cutRelease", () => {
  it("bumps the manifest and scaffolds a changelog the package did not have", async () => {
    const workspacePackage = await createPackageOnDisk("0.3.0");

    const result = await cutRelease(workspacePackage, "minor", "2026-09-07");

    expect(result.version).toBe("0.4.0");
    expect(result.tag).toBe("@codenhub/error@0.4.0");
    expect(await readFile(join(workspacePackage.directory, "package.json"), "utf8")).toContain('"version": "0.4.0"');
    expect(await readFile(join(workspacePackage.directory, "docs/changelog/0.4.0.md"), "utf8")).toContain("# 0.4.0");
    expect(await readFile(join(workspacePackage.directory, "docs/changelog/index.md"), "utf8")).toContain(
      "- [0.4.0](0.4.0.md)",
    );
  });

  it("adds to an existing changelog rather than replacing it", async () => {
    const workspacePackage = await createPackageOnDisk("1.0.0");
    await mkdir(join(workspacePackage.directory, "docs/changelog"), { recursive: true });
    await writeFile(
      join(workspacePackage.directory, "docs/changelog/index.md"),
      "---\ntitle: Changelog\ncurated: true\n---\n\n# Changelog\n\n- [1.0.0](1.0.0.md)\n",
    );

    const result = await cutRelease(workspacePackage, "patch", "2026-09-07");

    const index = await readFile(join(workspacePackage.directory, "docs/changelog/index.md"), "utf8");
    expect(result.version).toBe("1.0.1");
    expect(index).toContain("- [1.0.1](1.0.1.md)\n- [1.0.0](1.0.0.md)");
  });

  it("refuses a version that does not move forward, writing nothing", async () => {
    const workspacePackage = await createPackageOnDisk("1.0.0");

    await expect(cutRelease(workspacePackage, "0.9.0", "2026-09-07")).rejects.toThrow("does not come after");
    expect(await readFile(join(workspacePackage.directory, "package.json"), "utf8")).toContain('"version": "1.0.0"');
  });
});
