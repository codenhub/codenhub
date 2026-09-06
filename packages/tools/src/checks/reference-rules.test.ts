import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createReferenceRules } from "./reference-rules.ts";

const [rule] = createReferenceRules();

function fakePackage(reference: unknown): WorkspacePackage {
  return {
    name: "@codenhub/example",
    unscopedName: "example",
    directoryName: "example",
    directory: "/repo/packages/example",
    location: "packages/example",
    isPrivate: false,
    scripts: {},
    workspaceDependencies: [],
    manifest: { name: "@codenhub/example", codenhub: { docs: { label: "Example", status: "active", reference } } },
  };
}

describe("reference rule appliesTo", () => {
  it("applies to a package whose codenhub.docs.reference is an object", () => {
    expect(rule.appliesTo(fakePackage({}))).toBe(true);
  });

  it("does not apply when the key is absent or false", () => {
    const withoutKey = fakePackage(undefined);
    delete (withoutKey.manifest as { codenhub: { docs: Record<string, unknown> } }).codenhub.docs.reference;
    expect(rule.appliesTo(withoutKey)).toBe(false);
    expect(rule.appliesTo(fakePackage(false))).toBe(false);
  });

  it("applies to a malformed config so the run can report it", () => {
    expect(rule.appliesTo(fakePackage("yes"))).toBe(true);
  });
});

describe("reference rule run", () => {
  it("reports a malformed config as reference/entrypoint without running the generator", async () => {
    const findings = await rule.run({ package: fakePackage("yes"), includePack: false });
    expect(findings).toEqual([
      {
        code: "reference/entrypoint",
        location: "package.json",
        message: expect.stringContaining("expected an object or false"),
        severity: "error",
      },
    ]);
  });

  it("is a no-op when the package has no reference config", async () => {
    const withoutKey = fakePackage(undefined);
    delete (withoutKey.manifest as { codenhub: { docs: Record<string, unknown> } }).codenhub.docs.reference;
    expect(await rule.run({ package: withoutKey, includePack: false })).toEqual([]);
  });
});
