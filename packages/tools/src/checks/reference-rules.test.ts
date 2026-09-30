import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { createReferenceFixture } from "../generators/reference-fixture.test-support.ts";
import { analyzeReference } from "../generators/reference-generator.ts";
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

  async function committedFixture(name: string, sources: Record<string, string>): Promise<WorkspacePackage> {
    const workspacePackage = await createReferenceFixture(name, sources);
    // Commit what the generator produces, so drift is not what fails.
    const { files } = await analyzeReference(workspacePackage, { prose: true });
    await Promise.all(
      files.map(async (file) => {
        const path = join(workspacePackage.directory, file.path.slice(workspacePackage.location.length + 1));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.contents);
      }),
    );
    return workspacePackage;
  }

  it("fails on a public signature that names a type the reference does not document", { timeout: 30_000 }, async () => {
    const workspacePackage = await committedFixture("fixture-rule-unresolved", {
      // A global type from a hand-written declaration file has no emitted declaration to list.
      "ambient.d.ts": "type Ambient = { readonly inner: string };\n",
      "index.ts": [
        "/**",
        " * Makes an ambient value.",
        " * @returns The value.",
        " */",
        "export function make(): Ambient {",
        '  return { inner: "" };',
        "}",
        "",
      ].join("\n"),
    });

    expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([
      {
        code: "reference/unresolved-type",
        location: "docs/reference/index.md",
        message: expect.stringContaining('"make" names "Ambient"'),
        severity: "error",
      },
    ]);
  });

  it("fails on a section that renders nothing to read", { timeout: 30_000 }, async () => {
    const workspacePackage = await committedFixture("fixture-rule-empty", {
      "index.ts": ["/** Reserved for later. */", "export declare namespace Reserved {}", ""].join("\n"),
    });

    expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([
      {
        code: "reference/empty-section",
        location: "docs/reference/index.md",
        message: expect.stringContaining('"Reserved"'),
        severity: "error",
      },
    ]);
  });
});
