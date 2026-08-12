import { describe, expect, it } from "vitest";

import {
  findDependencyCycles,
  groupByDependencyLevel,
  orderByDependencies,
  withWorkspaceDependencies,
} from "./dependency-order.ts";
import type { WorkspacePackage } from "./discover.ts";

function createPackage(name: string, workspaceDependencies: string[] = []): WorkspacePackage {
  return {
    directory: `/repo/packages/${name}`,
    directoryName: name,
    isPrivate: false,
    manifest: {},
    location: `packages/${name}`,
    name,
    scripts: {},
    unscopedName: name,
    workspaceDependencies,
  };
}

const styles = createPackage("styles");
const theme = createPackage("theme");
const uiKit = createPackage("ui-kit", ["styles", "theme"]);

describe("orderByDependencies", () => {
  it("shouldPlaceDependenciesBeforeDependents", () => {
    const ordered = orderByDependencies([uiKit, theme, styles]).map(({ name }) => name);

    expect(ordered.indexOf("styles")).toBeLessThan(ordered.indexOf("ui-kit"));
    expect(ordered.indexOf("theme")).toBeLessThan(ordered.indexOf("ui-kit"));
  });

  it("shouldIgnoreDependenciesOutsideTheGivenSet", () => {
    expect(orderByDependencies([uiKit]).map(({ name }) => name)).toEqual(["ui-kit"]);
  });

  it("shouldNotLoopOnCyclicDependencies", () => {
    const first = createPackage("first", ["second"]);
    const second = createPackage("second", ["first"]);

    expect(orderByDependencies([first, second]).map(({ name }) => name)).toHaveLength(2);
  });
});

describe("withWorkspaceDependencies", () => {
  it("shouldAddTransitiveWorkspaceDependencies", () => {
    const expanded = withWorkspaceDependencies([uiKit], [styles, theme, uiKit]).map(({ name }) => name);

    expect(expanded).toEqual(["styles", "theme", "ui-kit"]);
  });

  it("shouldNotDuplicateAlreadySelectedPackages", () => {
    const expanded = withWorkspaceDependencies([styles, uiKit], [styles, theme, uiKit]);

    expect(expanded.filter(({ name }) => name === "styles")).toHaveLength(1);
  });

  it("shouldAddWhatANestedDevEnvironmentNeedsBuilt", () => {
    const plugin = createPackage("vite-plugin-icons");
    const themeDev = { ...createPackage("theme-dev", ["theme", "vite-plugin-icons"]), location: "packages/theme/dev" };
    const expanded = withWorkspaceDependencies([theme], [plugin, styles, theme, themeDev]).map(({ name }) => name);

    expect(expanded).toContain("vite-plugin-icons");
    expect(expanded.indexOf("vite-plugin-icons")).toBeLessThan(expanded.indexOf("theme-dev"));
  });

  it("shouldNotPullInAnUnrelatedPackageThatSharesANamePrefix", () => {
    const themeDev = { ...createPackage("theme-dev", ["absent"]), location: "packages/theme-dev" };
    const expanded = withWorkspaceDependencies([theme], [theme, themeDev]).map(({ name }) => name);

    expect(expanded).toEqual(["theme"]);
  });
});

describe("findDependencyCycles", () => {
  it("shouldReportNothingForAnAcyclicGraph", () => {
    expect(findDependencyCycles([styles, theme, uiKit])).toEqual([]);
  });

  it("shouldReportADirectCycleWithBothMembers", () => {
    const first = createPackage("first", ["second"]);
    const second = createPackage("second", ["first"]);

    expect(findDependencyCycles([first, second])).toEqual([["first", "second"]]);
  });

  it("shouldReportALongerCycleInDependencyOrder", () => {
    const first = createPackage("first", ["second"]);
    const second = createPackage("second", ["third"]);
    const third = createPackage("third", ["first"]);

    expect(findDependencyCycles([first, second, third])).toEqual([["first", "second", "third"]]);
  });

  it("shouldReportARotationOfTheSameCycleOnlyOnce", () => {
    const first = createPackage("first", ["second"]);
    const second = createPackage("second", ["first"]);

    expect(findDependencyCycles([second, first])).toHaveLength(1);
  });

  it("shouldIgnoreDependenciesOutsideTheGivenSet", () => {
    expect(findDependencyCycles([createPackage("first", ["absent"])])).toEqual([]);
  });

  it("shouldReportSeveralIndependentCycles", () => {
    const packages = [
      createPackage("first", ["second"]),
      createPackage("second", ["first"]),
      createPackage("third", ["fourth"]),
      createPackage("fourth", ["third"]),
    ];

    expect(findDependencyCycles(packages)).toEqual([
      ["first", "second"],
      ["third", "fourth"],
    ]);
  });
});

describe("groupByDependencyLevel", () => {
  it("shouldPutIndependentPackagesInOneLevel", () => {
    const levels = groupByDependencyLevel([createPackage("a"), createPackage("b"), createPackage("c")]);

    expect(levels).toHaveLength(1);
    expect(levels[0]?.map(({ name }) => name)).toEqual(["a", "b", "c"]);
  });

  it("shouldHoldADependentBackUntilItsDependencyLevelIsDone", () => {
    const base = createPackage("base");
    const middle = createPackage("middle", ["base"]);
    const top = createPackage("top", ["middle"]);

    expect(groupByDependencyLevel([top, middle, base]).map((level) => level.map(({ name }) => name))).toEqual([
      ["base"],
      ["middle"],
      ["top"],
    ]);
  });

  it("shouldWidenALevelWithEverySiblingThatIsReady", () => {
    const base = createPackage("base");
    const left = createPackage("left", ["base"]);
    const right = createPackage("right", ["base"]);

    expect(groupByDependencyLevel([base, left, right]).map((level) => level.map(({ name }) => name))).toEqual([
      ["base"],
      ["left", "right"],
    ]);
  });

  it("shouldIgnoreDependenciesOutsideTheGivenSet", () => {
    expect(groupByDependencyLevel([createPackage("only", ["absent"])])).toHaveLength(1);
  });

  it("shouldCoverEveryPackageExactlyOnce", () => {
    const base = createPackage("base");
    const middle = createPackage("middle", ["base"]);
    const top = createPackage("top", ["middle", "base"]);
    const names = groupByDependencyLevel([top, middle, base])
      .flat()
      .map(({ name }) => name);

    expect(names.toSorted()).toEqual(["base", "middle", "top"]);
  });

  it("shouldFallBackToOneLevelForACycle", () => {
    const first = createPackage("first", ["second"]);
    const second = createPackage("second", ["first"]);
    const levels = groupByDependencyLevel([first, second]);

    // A cycle has no order to respect, so the survivors go out together rather
    // than being spread over levels that would each wait on the next.
    expect(levels).toHaveLength(1);
    expect(
      levels
        .flat()
        .map(({ name }) => name)
        .toSorted(),
    ).toEqual(["first", "second"]);
  });
});
