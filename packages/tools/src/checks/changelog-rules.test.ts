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

  it("reports a version page whose body still carries a cut TODO bullet, but ignores fenced code", async () => {
    const workspacePackage = await createPackageOnDisk("1.2.0", {
      index: "# Changelog\n\n- [1.2.0](1.2.0.md)\n",
      pages: ["1.2.0.md"],
    });
    await writeFile(
      join(workspacePackage.directory, "docs/changelog/1.2.0.md"),
      `---\ntitle: 1.2.0\n${COMPLETE_FRONTMATTER}---\n\n# 1.2.0\n\n## Added\n\n- TODO: feat(example): add widget\n`,
    );

    expect(await run(workspacePackage)).toMatchObject([{ code: "changelog/unfinished-entry" }]);

    await writeFile(
      join(workspacePackage.directory, "docs/changelog/1.2.0.md"),
      `---\ntitle: 1.2.0\n${COMPLETE_FRONTMATTER}---\n\n# 1.2.0\n\n## Added\n\n- Added example.\n\n\`\`\`md\n- TODO: example inside code block\n\`\`\`\n`,
    );

    expect(await run(workspacePackage)).toEqual([]);
  });

  it("accepts a link with a fragment or leading ./ and rejects an unused definition or cross-directory link", async () => {
    const withFragment = await createPackageOnDisk("1.2.0", {
      index: "# Changelog\n\n- [1.2.0](./1.2.0.md#added)\n",
      pages: ["1.2.0.md"],
    });
    const wrongDirectory = await createPackageOnDisk("1.2.0", {
      index: "# Changelog\n\n- [1.2.0](../other/1.2.0.md)\n",
      pages: ["1.2.0.md"],
    });
    const unusedDefinition = await createPackageOnDisk("1.2.0", {
      index: "# Changelog\n\n[unused]: 1.2.0.md\n",
      pages: ["1.2.0.md"],
    });

    expect(await run(withFragment)).toEqual([]);
    expect(await run(wrongDirectory)).toMatchObject([{ code: "changelog/unlinked-entry" }]);
    expect(await run(unusedDefinition)).toMatchObject([{ code: "changelog/unlinked-entry" }]);
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

describe("changelog rule for a package that keeps an archived version", () => {
  const TAGS = [
    "@codenhub/example@0.4.1",
    "@codenhub/example@0.5.0",
    "@codenhub/example@1.3.0",
    "@codenhub/other@2.0.0",
  ];
  const [archivingRule] = createChangelogRules(async () => TAGS);

  async function runArchiving(
    version: string,
    docsVersions?: readonly string[],
    changelog?: { index: string; pages: string[] },
  ) {
    const workspacePackage = await createPackageOnDisk(version, changelog);
    const manifest = {
      ...workspacePackage.manifest,
      codenhub: {
        docs: docsVersions === undefined ? {} : { versions: docsVersions },
        label: "Example",
        status: "active",
      },
    };
    return (
      archivingRule as { run: (context: { package: WorkspacePackage; includePack: boolean }) => Promise<unknown> }
    ).run({ includePack: false, package: { ...workspacePackage, manifest } }) as Promise<{ code: string }[]>;
  }

  it("requires a changelog when codenhub.docs.versions keeps an earlier release", async () => {
    expect(await runArchiving("1.3.0", ["^0.4.0"])).toMatchObject([{ code: "changelog/required" }]);
  });

  it("requires a changelog when an earlier major from 1.0 is archived by rule", async () => {
    const [majorRule] = createChangelogRules(async () => ["@codenhub/example@1.2.0", "@codenhub/example@2.0.0"]);
    const workspacePackage = await createPackageOnDisk("2.0.0");

    expect(
      await (
        majorRule as { run: (context: { package: WorkspacePackage; includePack: boolean }) => Promise<unknown> }
      ).run({
        includePack: false,
        package: workspacePackage,
      }),
    ).toMatchObject([{ code: "changelog/required" }]);
  });

  it("still applies the major rule when codenhub.docs.versions is malformed", async () => {
    const [majorRule] = createChangelogRules(async () => ["@codenhub/example@1.2.0", "@codenhub/example@2.0.0"]);
    const workspacePackage = await createPackageOnDisk("2.0.0");
    const manifest = {
      ...workspacePackage.manifest,
      codenhub: { docs: { versions: "^1.0.0" }, label: "Example", status: "active" },
    };

    expect(
      await (
        majorRule as { run: (context: { package: WorkspacePackage; includePack: boolean }) => Promise<unknown> }
      ).run({ includePack: false, package: { ...workspacePackage, manifest } }),
    ).toMatchObject([{ code: "changelog/required" }]);
  });

  it("stays optional when nothing earlier is kept", async () => {
    expect(await runArchiving("1.3.0")).toEqual([]);
    expect(await runArchiving("1.3.0", ["^1.3.0"])).toEqual([]);
  });

  it("checks a kept changelog as usual", async () => {
    expect(
      await runArchiving("1.3.0", ["^0.4.0"], { index: "# Changelog\n\n- [1.3.0](1.3.0.md)\n", pages: ["1.3.0.md"] }),
    ).toEqual([]);
  });
});
