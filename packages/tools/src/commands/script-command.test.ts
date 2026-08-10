import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { PackageSelection } from "../workspace/select-packages.ts";
import type { CommandContext } from "./definition.ts";
import { createScriptCommand } from "./script-command.ts";

function createPackage(name: string, location: string, workspaceDependencies: readonly string[]): WorkspacePackage {
  return {
    directory: `/repo/${location}`,
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: false,
    location,
    manifest: {},
    name,
    scripts: { build: "vite build" },
    unscopedName: name,
    workspaceDependencies,
  };
}

const styles = createPackage("styles", "packages/styles", []);
const kbd = createPackage("kbd", "packages/kbd", []);
const docs = createPackage("docs", "apps/docs", ["styles", "kbd"]);

interface RunOptions {
  targets: readonly PackageSelection[];
  flags?: readonly string[];
  includesDependencies?: boolean;
}

/**
 * Plans a `build` run and returns the package locations it would build, in order.
 *
 * `--dry-run` reports the plan without spawning package managers, which is the
 * whole of what dependency ordering decides.
 */
async function planBuild({ flags = [], includesDependencies = true, targets }: RunOptions): Promise<string[]> {
  const lines: string[] = [];
  const context: CommandContext = {
    options: parseArguments(["build", "--dry-run", ...flags]).options,
    passthrough: [],
    reporter: createReporter({
      useColor: false,
      write: (message) => lines.push(message),
      writeError: (message) => lines.push(message),
    }),
    selection: { isImplicit: false, targets, unownedPaths: [] },
    tokens: [],
    // Discovery orders packages by location, which lists the dependent first.
    workspace: { packages: [docs, kbd, styles], root: "/repo" },
  };
  await createScriptCommand({ includesDependencies, name: "build", summary: "Build the selected packages." }).run(
    context,
  );

  return lines
    .filter((line) => line.includes("pnpm run build"))
    .map((line) => line.trim().split(":")[0] as string)
    .map((directory) => directory.replace("/repo/", ""));
}

describe("createScriptCommand", () => {
  it("shouldBuildWorkspaceDependenciesBeforeTheSelectedPackage", async () => {
    expect(await planBuild({ targets: [{ package: docs, paths: [] }] })).toEqual([
      "packages/styles",
      "packages/kbd",
      "apps/docs",
    ]);
  });

  it("shouldOrderTheSelectionDependencyFirstWithoutExpandingIt", async () => {
    const locations = await planBuild({
      flags: ["--no-deps"],
      targets: [
        { package: docs, paths: [] },
        { package: kbd, paths: [] },
        { package: styles, paths: [] },
      ],
    });

    expect(locations).toEqual(["packages/styles", "packages/kbd", "apps/docs"]);
  });

  it("shouldNarrowToTheSelectedPackagesWithNoDeps", async () => {
    expect(await planBuild({ flags: ["--no-deps"], targets: [{ package: docs, paths: [] }] })).toEqual(["apps/docs"]);
  });

  it("shouldLeaveTheSelectionAloneForCommandsThatDoNotOwnBuildOrder", async () => {
    const locations = await planBuild({
      includesDependencies: false,
      targets: [
        { package: docs, paths: [] },
        { package: styles, paths: [] },
      ],
    });

    expect(locations).toEqual(["apps/docs", "packages/styles"]);
  });
});
