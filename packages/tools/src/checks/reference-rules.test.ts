import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createReferenceFixture } from "../generators/reference-fixture.test-support.ts";
import * as referenceGenerator from "../generators/reference-generator.ts";
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
    manifest: { name: "@codenhub/example", codenhub: { label: "Example", status: "active", docs: { reference } } },
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

  it.each([
    ["root", { labe: "Typo" }, "codenhub.docs.reference.labe"],
    ["page", { pages: { ".": { labe: "Typo" } } }, 'codenhub.docs.reference.pages["."].labe'],
    [
      "split",
      { pages: { ".": { split: { parts: { source: ["src/**"], labe: "Typo" } } } } },
      'codenhub.docs.reference.pages["."].split["parts"].labe',
    ],
  ])("reports an unknown %s key as reference/entrypoint", async (_level, reference, field) => {
    expect(await rule.run({ package: fakePackage(reference), includePack: false })).toEqual([
      {
        code: "reference/entrypoint",
        location: "package.json",
        message: `Invalid ${field} in packages/example/package.json: unknown key "labe".`,
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

  it("reports an absent generated reference area", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-rule-missing", {
      "index.ts": "/** A value. */\nexport const value = 1;\n",
    });
    expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([
      { code: "reference/missing", location: "docs/reference", message: expect.any(String), severity: "error" },
    ]);
  });

  it("reports drift in a generated reference page", { timeout: 30_000 }, async () => {
    const workspacePackage = await committedFixture("fixture-rule-drift", {
      "index.ts": "/** A value. */\nexport const value = 1;\n",
    });
    await writeFile(join(workspacePackage.directory, "docs/reference/index.md"), "# Stale reference\n");
    expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([
      { code: "reference/drift", location: "docs/reference/index.md", message: expect.any(String), severity: "error" },
    ]);
  });

  it("accepts generated reference pages checked out with CRLF", { timeout: 30_000 }, async () => {
    const workspacePackage = await committedFixture("fixture-rule-crlf", {
      "index.ts": "/** A value. */\nexport const value = 1;\n",
    });
    const path = join(workspacePackage.directory, "docs/reference/index.md");
    const contents = await readFile(path, "utf8");
    await writeFile(path, contents.replace(/\r?\n/g, "\r\n"));
    expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([]);
  });

  it("reports unsupported exports from the analysis model", { timeout: 30_000 }, async () => {
    const workspacePackage = await committedFixture("fixture-rule-unsupported", {
      "index.ts": "/** A value. */\nexport const value = 1;\n",
    });
    const analysis = await analyzeReference(workspacePackage, { prose: true });
    // TypeDoc's Document kind has no TypeScript declaration fixture. Inject the analysis boundary.
    analysis.model.unsupported.push({ name: "Guide", subpath: "." });
    const analyze = vi.spyOn(referenceGenerator, "analyzeReference").mockResolvedValueOnce(analysis);
    try {
      expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([
        {
          code: "reference/unsupported-export",
          location: "package.json (.)",
          message: expect.stringContaining('Export "Guide"'),
          severity: "error",
        },
      ]);
    } finally {
      analyze.mockRestore();
    }
  });

  it("reports an analysis failure when an expected entry module is missing", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-rule-analysis", {
      "index.ts": "/** A value. */\nexport const value = 1;\n",
    });
    (workspacePackage.manifest as Record<string, unknown>).exports = {
      ".": { types: "./dist/index.d.ts" },
      "./missing": { types: "./dist/missing.d.ts" },
    };
    expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([
      {
        code: "reference/entrypoint",
        location: "docs/reference",
        message: expect.stringContaining('Reference entrypoint "./missing" has no TypeDoc module'),
        severity: "error",
      },
    ]);
  });

  it("reports every ungenerated file in the reference area", { timeout: 30_000 }, async () => {
    const workspacePackage = await committedFixture("fixture-rule-unexpected", {
      "index.ts": "/** A value. */\nexport const value = 1;\n",
    });
    await mkdir(join(workspacePackage.directory, "docs/reference/nested"), { recursive: true });
    await Promise.all([
      writeFile(join(workspacePackage.directory, "docs/reference/nested/extra.txt"), "unexpected"),
      writeFile(join(workspacePackage.directory, "docs/reference/extra.md"), "# Unexpected\n"),
    ]);
    const findings = await rule.run({ package: workspacePackage, includePack: false });
    expect(findings.map(({ code, location }) => ({ code, location }))).toEqual([
      { code: "reference/unexpected-file", location: "docs/reference/extra.md" },
      { code: "reference/unexpected-file", location: "docs/reference/nested/extra.txt" },
    ]);
  });

  it.each([false, true])(
    "rejects a sibling reference.md with generated area present=%s",
    { timeout: 30_000 },
    async (generated) => {
      const sources = { "index.ts": "/** A value. */\nexport const value = 1;\n" };
      const workspacePackage = await (generated ? committedFixture : createReferenceFixture)(
        "fixture-rule-sibling",
        sources,
      );
      await mkdir(join(workspacePackage.directory, "docs"), { recursive: true });
      await writeFile(join(workspacePackage.directory, "docs/reference.md"), "# Authored reference\n");
      const findings = await rule.run({ package: workspacePackage, includePack: false });
      expect(findings.filter((finding) => finding.code === "reference/unexpected-file")).toEqual([
        {
          code: "reference/unexpected-file",
          location: "docs/reference.md",
          message: expect.any(String),
          severity: "error",
        },
      ]);
    },
  );

  it.each([undefined, false])("leaves a non-opted-in package's reference files alone (%s)", async (reference) => {
    const workspacePackage = await createReferenceFixture("fixture-rule-legacy", {
      "index.ts": "/** A value. */\nexport const value = 1;\n",
    });
    (workspacePackage.manifest as { codenhub: { docs: { reference: unknown } } }).codenhub.docs.reference = reference;
    await mkdir(join(workspacePackage.directory, "docs/reference"), { recursive: true });
    await Promise.all([
      writeFile(join(workspacePackage.directory, "docs/reference.md"), "# Authored reference\n"),
      writeFile(join(workspacePackage.directory, "docs/reference/extra.txt"), "authored"),
    ]);
    expect(rule.appliesTo(workspacePackage)).toBe(false);
    expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([]);
  });

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

  it("reports ambient types included by a referenced source project", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-rule-solution", {
      "index.ts": "/** Makes an ambient value. */\nexport function make(): Ambient { return { inner: 1 }; }\n",
      "ambient.d.ts": "type Ambient = { inner: number };\n",
    });
    const config = await readFile(join(workspacePackage.directory, "tsconfig.json"), "utf8");
    await writeFile(join(workspacePackage.directory, "tsconfig.src.json"), config);
    await writeFile(
      join(workspacePackage.directory, "tsconfig.json"),
      JSON.stringify({
        files: [],
        references: [{ path: "./tsconfig.src.json" }],
      }),
    );
    const { files } = await analyzeReference(workspacePackage, { prose: true });
    await mkdir(join(workspacePackage.directory, "docs/reference"), { recursive: true });
    await writeFile(join(workspacePackage.directory, "docs/reference/index.md"), files[0]!.contents);
    expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([
      {
        code: "reference/unresolved-type",
        location: "docs/reference/index.md",
        message: expect.stringContaining('"make" names "Ambient"'),
        severity: "error",
      },
    ]);
  });

  it("locates a finding on the split page that documents the symbol", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-rule-split", {
      "ambient.d.ts": "type Ambient = { readonly inner: string };\n",
      "index.ts": [
        'export { make } from "./shapes/make";',
        "",
        "/**",
        " * Names a thing.",
        " * @returns The name.",
        " */",
        "export function name(): string {",
        '  return "";',
        "}",
        "",
      ].join("\n"),
      "shapes/make.ts": [
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
    const pages = { ".": { split: { shapes: { source: ["src/shapes/**"] } } } };
    (workspacePackage.manifest as { codenhub: { docs: { reference: unknown } } }).codenhub.docs.reference = { pages };
    const { files } = await analyzeReference(workspacePackage, { pages, prose: true });
    await Promise.all(
      files.map(async (file) => {
        const path = join(workspacePackage.directory, file.path.slice(workspacePackage.location.length + 1));
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.contents);
      }),
    );

    expect(await rule.run({ package: workspacePackage, includePack: false })).toEqual([
      {
        code: "reference/unresolved-type",
        location: "docs/reference/shapes.md",
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
