import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Workspace, WorkspacePackage } from "../workspace/discover.ts";
import { createReadmePackagesGenerator } from "./readme-packages-generator.ts";

interface PackageOverrides {
  description?: string;
  isPrivate?: boolean;
}

function createPackage(location: string, overrides: PackageOverrides = {}): WorkspacePackage {
  const directoryName = location.slice(location.lastIndexOf("/") + 1);
  return {
    directory: `/repo/${location}`,
    directoryName,
    isPrivate: overrides.isPrivate ?? false,
    location,
    manifest: overrides.description === undefined ? {} : { description: overrides.description },
    name: `@codenhub/${directoryName}`,
    scripts: {},
    unscopedName: directoryName,
    workspaceDependencies: [],
  };
}

const README_SOURCE = [
  "# CodenHub",
  "",
  "## Packages",
  "",
  "<!-- generated: packages start -->",
  "",
  "- stale",
  "",
  "<!-- generated: packages end -->",
  "",
  "## Commands",
].join("\n");

async function generate(packages: readonly WorkspacePackage[], isWholeWorkspace = true): Promise<string | undefined> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-readme-"));
  await writeFile(join(root, "README.md"), README_SOURCE, "utf8");
  const workspace: Workspace = { packages, root };
  const files = await createReadmePackagesGenerator().generate({ isWholeWorkspace, packages, workspace });
  return files[0]?.contents;
}

describe("readme packages generator", () => {
  it("groups packages into the sections the README renders", async () => {
    const contents = await generate([
      createPackage("apps/docs", { description: "Documentation site.", isPrivate: true }),
      createPackage("packages/error", { description: "Typed errors." }),
      createPackage("packages/plugins/vite/icons", { description: "Icon plugin." }),
      createPackage("packages/tools", { description: "Repository tooling.", isPrivate: true }),
    ]);

    expect(contents).toContain(
      [
        "### Applications",
        "",
        "- `apps/docs`: Documentation site.",
        "",
        "### Libraries & Primitives",
        "",
        "- `packages/error`: Typed errors.",
        "",
        "### Tooling",
        "",
        "- `packages/tools`: Repository tooling.",
        "",
        "### Plugins",
        "",
        "- `packages/plugins/vite/icons`: Icon plugin.",
      ].join("\n"),
    );
  });

  it("omits packages nested inside another package", async () => {
    const contents = await generate([
      createPackage("packages/theme", { description: "Theme helper." }),
      createPackage("packages/theme/dev", { description: "Theme playground.", isPrivate: true }),
    ]);

    expect(contents).toContain("- `packages/theme`: Theme helper.");
    expect(contents).not.toContain("packages/theme/dev");
  });

  it("omits sections that have no members", async () => {
    const contents = await generate([createPackage("packages/error", { description: "Typed errors." })]);

    expect(contents).not.toContain("### Applications");
    expect(contents).not.toContain("### Plugins");
  });

  it("lists a package without a description by location alone", async () => {
    const contents = await generate([createPackage("packages/error")]);

    expect(contents).toContain("- `packages/error`\n");
  });

  it("leaves the hand-written parts of the README untouched", async () => {
    const contents = await generate([createPackage("packages/error", { description: "Typed errors." })]);

    expect(contents).toContain("# CodenHub");
    expect(contents).toContain("## Commands");
    expect(contents).not.toContain("- stale");
  });

  it("skips the workspace-wide list when the selection is narrowed", async () => {
    expect(await generate([createPackage("packages/error", { description: "Typed errors." })], false)).toBeUndefined();
  });
});
