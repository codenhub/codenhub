import { describe, expect, it } from "vitest";

import { orderByDependencies, withWorkspaceDependencies } from "./dependency-order.ts";
import type { WorkspacePackage } from "./discover.ts";

function createPackage(name: string, workspaceDependencies: string[] = []): WorkspacePackage {
  return {
    directory: `/repo/packages/${name}`,
    directoryName: name,
    isPrivate: false,
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
});
