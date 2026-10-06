import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createChangelogRules } from "./changelog-rules.ts";

const [rule] = createChangelogRules();

const COMPLETE_FRONTMATTER = "date: 2026-09-05\ndescription: What the release changes.\n";

async function createPackageOnDisk(
  version: string,
  changelog?: { index?: string; pages?: readonly string[]; frontmatter?: string },
): Promise<WorkspacePackage> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-changelog-"));
  if (changelog !== undefined) {
    await mkdir(join(directory, "docs/changelog"), { recursive: true });
    if (changelog.index !== undefined) {
      await writeFile(join(directory, "docs/changelog/index.md"), changelog.index);
    }
    await Promise.all(
      (changelog.pages ?? []).map(async (page) => {
        const title = page.replace(/\.md$/u, "");
        const frontmatter = changelog.frontmatter ?? COMPLETE_FRONTMATTER;
        return writeFile(
          join(directory, "docs/changelog", page),
          `---\ntitle: ${title}\n${frontmatter}---\n\n# ${title}\n`,
        );
      }),
    );
  }
  return {
    directory,
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest: { name: "@codenhub/example", version },
    name: "@codenhub/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

async function run(workspacePackage: WorkspacePackage) {
  return (rule as { run: (context: { package: WorkspacePackage; includePack: boolean }) => Promise<unknown> }).run({
    includePack: false,
    package: workspacePackage,
  }) as Promise<{ code: string }[]>;
}

describe("changelog rule appliesTo", () => {
  it("applies to a public package", async () => {
    expect(rule.appliesTo(await createPackageOnDisk("1.0.0"))).toBe(true);
  });

  it("does not apply to a private package", async () => {
    const workspacePackage = { ...(await createPackageOnDisk("1.0.0")), isPrivate: true };

    expect(rule.appliesTo(workspacePackage)).toBe(false);
  });
});

describe("changelog rule run", () => {
  it("says nothing about a package that keeps no changelog", async () => {
    expect(await run(await createPackageOnDisk("1.0.0"))).toEqual([]);
  });

  it("accepts a version that has a page and a link", async () => {
    const workspacePackage = await createPackageOnDisk("1.2.0", {
      index: "# Changelog\n\n- [1.2.0](1.2.0.md)\n- [1.1.0](1.1.0.md)\n",
      pages: ["1.2.0.md", "1.1.0.md"],
    });

    expect(await run(workspacePackage)).toEqual([]);
  });

  it("reports a version with no page at all", async () => {
    const workspacePackage = await createPackageOnDisk("1.2.0", {
      index: "# Changelog\n\n- [1.1.0](1.1.0.md)\n",
      pages: ["1.1.0.md"],
    });

    expect(await run(workspacePackage)).toMatchObject([{ code: "changelog/missing-entry" }]);
  });

  it("reports a version whose page the index does not link", async () => {
    const workspacePackage = await createPackageOnDisk("1.2.0", {
      index: "# Changelog\n\n- [1.1.0](1.1.0.md)\n",
      pages: ["1.2.0.md", "1.1.0.md"],
    });

    expect(await run(workspacePackage)).toMatchObject([{ code: "changelog/unlinked-entry" }]);
  });

  it("leaves an older version unlinked without complaint", async () => {
    const workspacePackage = await createPackageOnDisk("1.2.0", {
      index: "# Changelog\n\n- [1.2.0](1.2.0.md)\n",
      pages: ["1.2.0.md", "0.1.0.md"],
    });

    expect(await run(workspacePackage)).toEqual([]);
  });

  it("reports a current version page with no date or description", async () => {
    const workspacePackage = await createPackageOnDisk("1.2.0", {
      frontmatter: "",
      index: "# Changelog\n\n- [1.2.0](1.2.0.md)\n",
      pages: ["1.2.0.md"],
    });

    expect(await run(workspacePackage)).toMatchObject([
      { code: "changelog/missing-date" },
      { code: "changelog/missing-description" },
    ]);
  });

  it("reports a description the cut scaffold left as a TODO", async () => {
    const workspacePackage = await createPackageOnDisk("1.2.0", {
      frontmatter: "date: 2026-09-05\ndescription: TODO: one sentence.\n",
      index: "# Changelog\n\n- [1.2.0](1.2.0.md)\n",
      pages: ["1.2.0.md"],
    });

    expect(await run(workspacePackage)).toMatchObject([{ code: "changelog/missing-description" }]);
  });

  it("leaves an older version page without them alone", async () => {
    const workspacePackage = await createPackageOnDisk("1.2.0", {
      frontmatter: "",
      index: "# Changelog\n\n- [1.2.0](1.2.0.md)\n- [1.1.0](1.1.0.md)\n",
      pages: ["1.1.0.md"],
    });
    await writeFile(
      join(workspacePackage.directory, "docs/changelog/1.2.0.md"),
      `---\ntitle: 1.2.0\n${COMPLETE_FRONTMATTER}---\n\n# 1.2.0\n`,
    );

    expect(await run(workspacePackage)).toEqual([]);
  });

  it("reports a changelog directory with no index to publish it", async () => {
    const workspacePackage = await createPackageOnDisk("1.0.0", { pages: ["1.0.0.md"] });

    expect(await run(workspacePackage)).toMatchObject([{ code: "changelog/missing-index" }]);
  });
});
