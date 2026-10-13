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

async function runClean(
  root: string,
  packages: readonly WorkspacePackage[],
  argv: readonly string[],
  selected: readonly WorkspacePackage[] = packages,
): Promise<string> {
  const lines: string[] = [];
  const context: CommandContext = {
    options: parseArguments(["clean", ...argv]).options,
    passthrough: [],
    reporter: createReporter({ useColor: false, write: (line) => lines.push(line), writeError: () => {} }),
    selection: {
      isImplicit: true,
      targets: selected.map((workspacePackage) => ({ package: workspacePackage, paths: [] })),
      unownedPaths: [],
    },
    tokens: [],
    workspace: { packages, root },
  };

  await createCleanCommand().run(context);
  return lines.join("\n");
}

function relativePaths(root: string, paths: readonly string[]): string[] {
  return paths.map((path) => path.slice(root.length + 1).replaceAll("\\", "/")).sort();
}

describe("findArtifactDirectories", () => {
  it("finds an artifact at the package root", async () => {
    const root = await createWorkspaceFixture(["packages/toast/dist"]);

    const found = await findArtifactDirectories(join(root, "packages/toast"), new Set([join(root, "packages/toast")]));

    expect(relativePaths(root, found)).toEqual(["packages/toast/dist"]);
  });

  it("keeps an artifact-named source folder that is not at a package root", async () => {
    const root = await createWorkspaceFixture(["packages/error/src/coverage"]);

    const found = await findArtifactDirectories(join(root, "packages/error"), new Set([join(root, "packages/error")]));

    expect(found).toEqual([]);
  });

  it("still finds a build record deep in a source folder that is not a package root", async () => {
    const root = await createWorkspaceFixture(["packages/error/src/coverage"]);
    await writeFile(join(root, "packages/error/src/coverage/tsconfig.tsbuildinfo"), "");

    const found = await findArtifactDirectories(join(root, "packages/error"), new Set([join(root, "packages/error")]));

    expect(relativePaths(root, found)).toEqual(["packages/error/src/coverage/tsconfig.tsbuildinfo"]);
  });

  it("stops at an artifact rather than descending into it", async () => {
    const root = await createWorkspaceFixture(["packages/error/dist/coverage"]);

    const found = await findArtifactDirectories(join(root, "packages/error"), new Set([join(root, "packages/error")]));

    expect(found).toHaveLength(1);
    expect(found[0]?.endsWith("dist")).toBe(true);
  });

  it("reports the record the compiler keeps of a project it checked", async () => {
    const root = await createWorkspaceFixture(["packages/error/src"]);
    await writeFile(join(root, "packages/error/tsconfig.tsbuildinfo"), "");

    const found = await findArtifactDirectories(join(root, "packages/error"), new Set([join(root, "packages/error")]));

    expect(relativePaths(root, found)).toEqual(["packages/error/tsconfig.tsbuildinfo"]);
  });

  it("never reports dependencies", async () => {
    const root = await createWorkspaceFixture(["packages/error/node_modules/left-pad/dist"]);

    await expect(
      findArtifactDirectories(join(root, "packages/error"), new Set([join(root, "packages/error")])),
    ).resolves.toEqual([]);
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

    expect(output).toContain("Would remove 2 artifact(s)");
  });

  it("removes the artifacts of a nested workspace package when its parent is selected", async () => {
    const root = await createWorkspaceFixture(["packages/icons/dist", "packages/icons/demo/dist"]);
    const packages = [createPackage(root, "packages/icons"), createPackage(root, "packages/icons/demo")];

    const output = await runClean(root, packages, ["--dry-run"], packages.slice(0, 1));

    expect(output).toContain("packages/icons/demo/dist");
  });

  it("leaves an artifact directory that is not at a package root", async () => {
    const root = await createWorkspaceFixture(["packages/error/playground/dist"]);

    await expect(runClean(root, [createPackage(root, "packages/error")], [])).resolves.toContain("Nothing to clean.");
  });

  it("reports nothing to clean on a fresh tree", async () => {
    const root = await createWorkspaceFixture(["packages/error/src"]);

    await expect(runClean(root, [createPackage(root, "packages/error")], [])).resolves.toContain("Nothing to clean.");
  });
});
