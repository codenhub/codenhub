import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createDocsVersionRules } from "./docs-version-rules.ts";

function createPackage(docs: Record<string, unknown>): WorkspacePackage {
  return {
    directory: "/repo/packages/example",
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest: { codenhub: { docs, label: "Example", status: "active" }, name: "@codenhub/example" },
    name: "@codenhub/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

const TAGS = ["@codenhub/example@0.4.2", "@codenhub/example@0.5.0-beta.1", "@codenhub/other@0.9.0"];

describe("docs-versions rule", () => {
  const [rule] = createDocsVersionRules(async () => TAGS);

  it("applies only to a package that lists versions", () => {
    expect(rule!.appliesTo(createPackage({}))).toBe(false);
    expect(rule!.appliesTo(createPackage({ versions: [] }))).toBe(true);
  });

  it("warns about an entry no stable release of the package matches", async () => {
    const findings = await rule!.run({
      includePack: false,
      package: createPackage({ versions: ["^0.4.0", "^0.5.0", "0.9.0"] }),
    });
    expect(
      findings.map(({ code, message, severity }) => ({ code, entry: /"([^"]+)"/.exec(message)?.[1], severity })),
    ).toEqual([
      { code: "docs-versions/unmatched", entry: "^0.5.0", severity: "warning" },
      { code: "docs-versions/unmatched", entry: "0.9.0", severity: "warning" },
    ]);
  });

  it("leaves a malformed list to the documentation rule", async () => {
    expect(await rule!.run({ includePack: false, package: createPackage({ versions: ["latest"] }) })).toEqual([]);
  });
});
