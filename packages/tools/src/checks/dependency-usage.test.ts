import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import {
  readBinaryNames,
  readDependencyUsage,
  readSpecifiers,
  stripTypeOnlyStatements,
  toPackageName,
} from "./dependency-usage.ts";

/** Writes a package tree and returns it as a workspace package. */
async function createPackageFixture(
  files: Readonly<Record<string, string>>,
  manifest: Record<string, unknown> = {},
): Promise<WorkspacePackage> {
  const directory = await mkdtemp(path.join(tmpdir(), "codenhub-usage-"));
  await Promise.all(
    Object.entries(files).map(async ([filePath, contents]) => {
      await mkdir(path.join(directory, path.dirname(filePath)), { recursive: true });
      await writeFile(path.join(directory, filePath), contents, "utf8");
    }),
  );
  const name = typeof manifest.name === "string" ? manifest.name : "@fixture/example";
  return {
    directory,
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest: { name, ...manifest },
    name,
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

describe("readSpecifiers", () => {
  it("reads every import form", () => {
    const source = [
      `import { a } from "static";`,
      `import "side-effect";`,
      `export { b } from "re-exported";`,
      `const c = await import("dynamic");`,
      `const d = require("legacy");`,
      `@import "stylesheet";`,
    ].join("\n");

    expect(readSpecifiers(source).sort()).toEqual([
      "dynamic",
      "legacy",
      "re-exported",
      "side-effect",
      "static",
      "stylesheet",
    ]);
  });
});

describe("toPackageName", () => {
  it("reduces a subpath to the package that satisfies it", () => {
    expect(toPackageName("@scope/name/deep/path")).toBe("@scope/name");
    expect(toPackageName("name/deep/path")).toBe("name");
  });

  it("ignores anything no dependency could satisfy", () => {
    expect(toPackageName("./relative.ts")).toBeUndefined();
    expect(toPackageName("/absolute")).toBeUndefined();
    expect(toPackageName("node:fs")).toBeUndefined();
    expect(toPackageName("fs")).toBeUndefined();
    expect(toPackageName("${interpolated}")).toBeUndefined();
  });
});

describe("readDependencyUsage", () => {
  it("follows the import graph from the published entry points", async () => {
    const workspacePackage = await createPackageFixture(
      {
        "src/deep.ts": `import { c } from "reached-deeper";`,
        "src/index.ts": `import { a } from "reached";\nimport { b } from "./deep.ts";`,
        "src/orphan.ts": `import { d } from "never-reached";`,
      },
      { exports: { ".": "./dist/index.js" } },
    );

    const usage = await readDependencyUsage(workspacePackage);

    expect([...usage.shipped].sort()).toEqual(["reached", "reached-deeper"]);
  });

  it("does not treat a test helper beside the source as published", async () => {
    const workspacePackage = await createPackageFixture(
      {
        "src/index.ts": `export const a = 1;`,
        "src/test-utils.ts": `import { expect } from "vitest";`,
      },
      { exports: { ".": "./dist/index.js" } },
    );

    const usage = await readDependencyUsage(workspacePackage);

    expect([...usage.shipped]).toEqual([]);
    expect([...usage.authored]).toEqual(["vitest"]);
  });

  it("leaves test files out of the authored scope", async () => {
    const workspacePackage = await createPackageFixture({
      "src/index.test.ts": `import { quoted } from "only-in-a-test";`,
      "src/index.ts": `import { a } from "real";`,
    });

    expect([...(await readDependencyUsage(workspacePackage)).authored]).toEqual(["real"]);
  });

  it("credits a nested workspace package with its own imports rather than its parent", async () => {
    const workspacePackage = await createPackageFixture({
      "debug/package.json": `{ "name": "@fixture/example-debug" }`,
      "debug/vite.config.ts": `import plugin from "belongs-to-the-nested-package";`,
      "src/index.ts": `export const a = 1;`,
    });

    expect([...(await readDependencyUsage(workspacePackage)).authored]).toEqual([]);
  });

  it("reads a scenario directory as part of the workspace that runs it", async () => {
    const host = await createPackageFixture({
      "playground/index.ts": `import { createThing } from "@fixture/example";\nimport "scenario-only";`,
      "src/index.ts": `export const a = 1;`,
    });
    const runner = await createPackageFixture(
      { "vite.config.ts": `import { defineConfig } from "vite";` },
      { name: "@fixture/example-debug" },
    );

    const usage = await readDependencyUsage(runner, [path.join(host.directory, "playground")]);

    expect([...(await readDependencyUsage(host)).authored]).toEqual([]);
    expect([...usage.authored].sort()).toEqual(["@fixture/example", "scenario-only", "vite"]);
  });

  it("collects text a mention could appear in, including package scripts", async () => {
    const workspacePackage = await createPackageFixture(
      { "README.md": "Built with tsdown." },
      { scripts: { build: "tsdown src/index.ts" } },
    );

    const usage = await readDependencyUsage(workspacePackage);

    expect(usage.text).toContain("tsdown src/index.ts");
    expect(usage.text).toContain("Built with tsdown.");
  });
});

describe("readBinaryNames", () => {
  it("reads the executables an installed dependency declares", async () => {
    const workspacePackage = await createPackageFixture({
      "node_modules/typescript/package.json": `{ "bin": { "tsc": "./bin/tsc", "tsserver": "./bin/tsserver" } }`,
    });

    await expect(readBinaryNames(workspacePackage, "typescript")).resolves.toEqual(["tsc", "tsserver"]);
  });

  it("names a single-binary dependency after the package itself", async () => {
    const workspacePackage = await createPackageFixture({
      "node_modules/@scope/tool/package.json": `{ "bin": "./run.js" }`,
    });

    await expect(readBinaryNames(workspacePackage, "@scope/tool")).resolves.toEqual(["tool"]);
  });

  it("reports none for a dependency that is absent or installs none", async () => {
    const workspacePackage = await createPackageFixture({ "src/index.ts": "" });

    await expect(readBinaryNames(workspacePackage, "absent")).resolves.toEqual([]);
  });
});

describe("stripTypeOnlyStatements", () => {
  it("erases statements a build erases", () => {
    const erased = [
      `import type { A } from "type-import";`,
      `export type { B } from "type-export";`,
      `import type C from "default-type";`,
      `  import type { D } from "indented";`,
    ].join("\n");

    expect(readSpecifiers(stripTypeOnlyStatements(erased))).toEqual([]);
  });

  it("erases multiline type-only imports", () => {
    const multiline = `import type {\n  A,\n  B,\n} from "multiline-type";`;

    expect(readSpecifiers(stripTypeOnlyStatements(multiline))).toEqual([]);
  });

  it("keeps a statement that also imports a value", () => {
    const kept = [`import { type A, b } from "mixed";`, `import { c } from "value";`, `import "side-effect";`].join(
      "\n",
    );

    expect(readSpecifiers(stripTypeOnlyStatements(kept)).sort()).toEqual(["mixed", "side-effect", "value"]);
  });
});
