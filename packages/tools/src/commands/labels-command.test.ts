import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { buildGhSpec, deriveWorkspaceLabels, parseLabels } from "./labels-command.ts";

function createPackage(location: string, name: string): WorkspacePackage {
  const directoryName = location.slice(location.lastIndexOf("/") + 1);
  return {
    directory: `/repo/${location}`,
    directoryName,
    isPrivate: false,
    location,
    manifest: {},
    name,
    scripts: {},
    unscopedName: name.replace("@codenhub/", ""),
    workspaceDependencies: [],
  };
}

describe("parseLabels", () => {
  it("reads every label in file order", () => {
    const source = JSON.stringify([
      { color: "d73a4a", description: "Broken", name: "type:bug" },
      { color: "fbca04", description: "Unreviewed", name: "status:needs-triage" },
    ]);

    expect(parseLabels(source).map(({ name }) => name)).toEqual(["type:bug", "status:needs-triage"]);
  });

  it("rejects an entry missing a field", () => {
    expect(() => parseLabels(JSON.stringify([{ color: "d73a4a", name: "type:bug" }]))).toThrow(/entry 0.*description/);
  });

  it("rejects a document that is not a list", () => {
    expect(() => parseLabels("{}")).toThrow(/array/);
  });
});

describe("deriveWorkspaceLabels", () => {
  it("labels packages by their unscoped name and apps by their directory", () => {
    const labels = deriveWorkspaceLabels([
      createPackage("apps/docs", "@codenhub/docs"),
      createPackage("packages/error", "@codenhub/error"),
      createPackage("packages/plugins/vite/icons", "@codenhub/vite-plugin-icons"),
    ]);

    expect(labels.map(({ name }) => name)).toEqual(["app:docs", "pkg:error", "pkg:vite-plugin-icons"]);
  });

  it("gives packages nested inside another package no label", () => {
    const labels = deriveWorkspaceLabels([
      createPackage("packages/icons", "@codenhub/icons"),
      createPackage("packages/icons/demo", "@codenhub/icons-demo"),
    ]);

    expect(labels.map(({ name }) => name)).toEqual(["pkg:icons"]);
  });
});

describe("buildGhSpec", () => {
  it("drops GH_REPO so gh targets the checkout it runs in", () => {
    process.env.GH_REPO = "someone/elsewhere";
    try {
      expect(buildGhSpec(["label", "list"], "/repo").env?.GH_REPO).toBeUndefined();
    } finally {
      delete process.env.GH_REPO;
    }
  });
});
