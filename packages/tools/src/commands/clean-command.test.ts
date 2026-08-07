import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createCleanCommand, findArtifactDirectories } from "./clean-command.ts";
import type { CommandContext } from "./definition.ts";

async function createWorkspaceFixture(directories: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "codenhub-clean-"));
  await Promise.all(
    directories.map(async (directory) => {
      await mkdir(join(root, directory), { recursive: true });
      await writeFile(join(root, directory, "artifact.txt"), "");
    }),
  );
  return root;
}

function createPackage(root: string, location: string): WorkspacePackage {
  return {
    directory: join(root, location),
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: true,
    location,
    manifest: {},
    name: `@codenhub/${location.slice(location.lastIndexOf("/") + 1)}`,
    scripts: {},
    unscopedName: location.slice(location.lastIndexOf("/") + 1),
    workspaceDependencies: [],
  };
}

async function runClean(root: string, packages: readonly WorkspacePackage[], argv: readonly string[]): Promise<string> {
  const lines: string[] = [];
  const context: CommandContext = {
    options: parseArguments(["clean", ...argv]).options,
    passthrough: [],
    reporter: createReporter({ useColor: false, write: (line) => lines.push(line), writeError: () => {} }),
    selection: {
      isImplicit: true,
      targets: packages.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      unownedPaths: [],
    },
    workspace: { packages, root },
  };

  await createCleanCommand().run(context);
  return lines.join("\n");
}

describe("findArtifactDirectories", () => {
  it("finds artifacts nested below the package root", async () => {
    const root = await createWorkspaceFixture(["packages/toast/dist", "packages/toast/playground/dist"]);

    const found = await findArtifactDirectories(join(root, "packages/toast"));

    expect(found.map((path) => path.slice(root.length + 1).replaceAll("\\", "/")).sort()).toEqual([
      "packages/toast/dist",
      "packages/toast/playground/dist",
    ]);
  });

  it("stops at an artifact rather than descending into it", async () => {
    const root = await createWorkspaceFixture(["packages/error/dist/coverage"]);

    const found = await findArtifactDirectories(join(root, "packages/error"));

    expect(found).toHaveLength(1);
    expect(found[0]?.endsWith("dist")).toBe(true);
  });

  it("never reports dependencies", async () => {
    const root = await createWorkspaceFixture(["packages/error/node_modules/left-pad/dist"]);

    await expect(findArtifactDirectories(join(root, "packages/error"))).resolves.toEqual([]);
  });
});

describe("hub clean", () => {
  it("removes every artifact directory of the selected packages", async () => {
    const root = await createWorkspaceFixture(["packages/error/dist", "packages/error/coverage", "packages/error/src"]);

    await runClean(root, [createPackage(root, "packages/error")], []);

    await expect(readdir(join(root, "packages/error"))).resolves.toEqual(["src"]);
  });

  it("leaves the tree untouched during a dry run", async () => {
    const root = await createWorkspaceFixture(["packages/error/dist"]);

    const output = await runClean(root, [createPackage(root, "packages/error")], ["--dry-run"]);

    expect(output).toContain("packages/error/dist");
    await expect(readdir(join(root, "packages/error/dist"))).resolves.toEqual(["artifact.txt"]);
  });

  it("reports a nested package artifact once when both packages are selected", async () => {
    const root = await createWorkspaceFixture(["packages/icons/dist", "packages/icons/demo/dist"]);
    const packages = [createPackage(root, "packages/icons"), createPackage(root, "packages/icons/demo")];

    const output = await runClean(root, packages, ["--dry-run"]);

    expect(output).toContain("Would remove 2 artifact directory(ies)");
  });

  it("reports nothing to clean on a fresh tree", async () => {
    const root = await createWorkspaceFixture(["packages/error/src"]);

    await expect(runClean(root, [createPackage(root, "packages/error")], [])).resolves.toContain("Nothing to clean.");
  });
});
