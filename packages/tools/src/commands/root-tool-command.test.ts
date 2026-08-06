import { describe, expect, it } from "vitest";

import { parseArguments } from "../cli/parse-arguments.ts";
import { createReporter } from "../reporting/reporter.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { Selection } from "../workspace/select-packages.ts";
import type { CommandContext } from "./definition.ts";
import { resolveToolPaths } from "./root-tool-command.ts";

function createPackage(name: string, location: string): WorkspacePackage {
  return {
    directory: `/repo/${location}`,
    directoryName: location.slice(location.lastIndexOf("/") + 1),
    isPrivate: false,
    manifest: {},
    location,
    name,
    scripts: {},
    unscopedName: name,
    workspaceDependencies: [],
  };
}

const error = createPackage("error", "packages/error");
const kbd = createPackage("kbd", "packages/kbd");

function createContext(selection: Selection): CommandContext {
  return {
    options: parseArguments(["lint"]).options,
    passthrough: [],
    reporter: createReporter({ useColor: false, write: () => {}, writeError: () => {} }),
    selection,
    workspace: { packages: [error, kbd], root: "/repo" },
  };
}

describe("resolveToolPaths", () => {
  it("shouldFallBackToTheDefaultPathsWhenNothingWasSelected", () => {
    const context = createContext({ isImplicit: true, targets: [{ package: error, paths: [] }], unownedPaths: [] });

    expect(resolveToolPaths(context, ["."])).toEqual(["."]);
  });

  it("shouldUsePackageDirectoriesForWholePackageSelections", () => {
    const context = createContext({
      isImplicit: false,
      targets: [
        { package: error, paths: [] },
        { package: kbd, paths: [] },
      ],
      unownedPaths: [],
    });

    expect(resolveToolPaths(context, ["."])).toEqual(["packages/error", "packages/kbd"]);
  });

  it("shouldUseRepositoryRelativePathsForNarrowedSelections", () => {
    const context = createContext({
      isImplicit: false,
      targets: [{ package: error, paths: ["src/index.ts", "src/result.ts"] }],
      unownedPaths: [],
    });

    expect(resolveToolPaths(context, ["."])).toEqual(["packages/error/src/index.ts", "packages/error/src/result.ts"]);
  });

  it("shouldIncludePathsOutsideEveryPackage", () => {
    const context = createContext({
      isImplicit: false,
      targets: [{ package: error, paths: [] }],
      unownedPaths: ["docs/tooling.md"],
    });

    expect(resolveToolPaths(context, ["."])).toEqual(["packages/error", "docs/tooling.md"]);
  });
});
