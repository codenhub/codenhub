import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createDependencyRules } from "./dependency-rules.ts";
import type { Finding } from "./rule.ts";

/**
 * Writes a package tree and returns it as a workspace package.
 * @param name Manifest name.
 * @param manifest Manifest fields merged over the name.
 * @param files Package-relative files to write.
 * @returns Workspace package bound to a temporary directory.
 */
async function createPackage(
  name: string,
  manifest: Record<string, unknown> = {},
  files: Readonly<Record<string, string>> = {},
): Promise<WorkspacePackage> {
  const unscopedName = name.slice(name.lastIndexOf("/") + 1);
  const directory = await mkdtemp(path.join(tmpdir(), "codenhub-deps-"));
  await Promise.all(
    Object.entries(files).map(async ([filePath, contents]) => {
      await mkdir(path.join(directory, path.dirname(filePath)), { recursive: true });
      await writeFile(path.join(directory, filePath), contents, "utf8");
    }),
  );
  return {
    directory,
    directoryName: unscopedName,
    isPrivate: manifest.private === true,
    location: `packages/${unscopedName}`,
    manifest: { name, ...manifest },
    name,
    scripts: (manifest.scripts as Record<string, string>) ?? {},
    unscopedName,
    workspaceDependencies: (manifest.workspaceDependencies as string[]) ?? [],
  };
}

async function runRule(
  workspacePackage: WorkspacePackage,
  siblings: readonly WorkspacePackage[] = [],
): Promise<Finding[]> {
  const results = await Promise.all(
    createDependencyRules([workspacePackage, ...siblings]).map(async (rule) =>
      rule.run({ includePack: false, package: workspacePackage }),
    ),
  );
  return results.flat();
}

async function runRuleForCodes(
  workspacePackage: WorkspacePackage,
  siblings: readonly WorkspacePackage[] = [],
): Promise<string[]> {
  return (await runRule(workspacePackage, siblings)).map(({ code }) => code);
}

describe("dependency ranges", () => {
  it("reports an internal dependency without a workspace range", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { dependencies: { "@fixture/other": "^1.0.0" }, peerDependencies: { "@fixture/other": ">=1" } },
      { "src/index.ts": `import { a } from "@fixture/other";` },
    );
    const other = await createPackage("@fixture/other");

    expect(await runRule(workspacePackage, [other])).toEqual([
      {
        code: "dependencies/workspace-range",
        location: "package.json",
        message: `"dependencies.@fixture/other" should use a "workspace:" range.`,
        severity: "warning",
      },
    ]);
  });

  it("requires a catalog range for a dependency two packages install", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { vitest: "^4.0.0" } },
      { "src/index.test.ts": `import { it } from "vitest";` },
    );
    const other = await createPackage("@fixture/other", { devDependencies: { vitest: "catalog:" } });

    expect(await runRuleForCodes(workspacePackage, [other])).toEqual(["dependencies/catalog"]);
  });

  it("accepts a pinned range for a dependency only one package installs", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { dependencies: { "left-pad": "1.3.0" } },
      { "src/index.ts": `import { a } from "left-pad";` },
    );
    const other = await createPackage("@fixture/other");

    expect(await runRuleForCodes(workspacePackage, [other])).toEqual([]);
  });

  it("never rewrites a peer range", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { peerDependencies: { vite: ">=5.0.0" } },
      { "src/index.ts": `import { defineConfig } from "vite";` },
    );
    const other = await createPackage("@fixture/other", { peerDependencies: { vite: ">=8.0.0" } });

    expect(await runRuleForCodes(workspacePackage, [other])).toEqual([]);
  });
});

describe("dependency cycles", () => {
  it("reports a cycle on every package that takes part in it", async () => {
    const workspacePackage = await createPackage("@fixture/example", { workspaceDependencies: ["@fixture/other"] });
    const other = await createPackage("@fixture/other", { workspaceDependencies: ["@fixture/example"] });

    expect(await runRule(workspacePackage, [other])).toEqual([
      {
        code: "dependencies/cycle",
        location: "package.json",
        message: "Workspace dependency cycle: @fixture/example -> @fixture/other -> @fixture/example.",
        severity: "error",
      },
    ]);
    expect(await runRuleForCodes(other, [workspacePackage])).toEqual(["dependencies/cycle"]);
  });

  it("accepts an acyclic chain", async () => {
    const workspacePackage = await createPackage("@fixture/example", { workspaceDependencies: ["@fixture/other"] });
    const other = await createPackage("@fixture/other");

    expect(await runRuleForCodes(workspacePackage, [other])).toEqual([]);
  });
});

describe("dependency usage", () => {
  it("reports an import that no dependency field declares", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      {},
      { "src/index.ts": `import { a } from "left-pad";` },
    );

    expect(await runRule(workspacePackage)).toEqual([
      {
        code: "dependencies/undeclared",
        location: "package.json",
        message: `"left-pad" is imported but declared in no dependency field.`,
        severity: "error",
      },
    ]);
  });

  it("requires published code to import only what a consumer receives", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { "left-pad": "1.3.0" }, exports: { ".": "./dist/index.js" } },
      { "src/index.ts": `import { a } from "left-pad";` },
    );

    expect(await runRuleForCodes(workspacePackage)).toEqual(["dependencies/runtime-declaration"]);
  });

  it("accepts a dev dependency that only a test file imports", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { "left-pad": "1.3.0" }, exports: { ".": "./dist/index.js" } },
      { "src/index.test.ts": `import { a } from "left-pad";`, "src/index.ts": `export const a = 1;` },
    );

    expect(await runRuleForCodes(workspacePackage)).toEqual([]);
  });

  it("leaves the declaring field of a private package alone", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { "left-pad": "1.3.0" }, exports: { ".": "./dist/index.js" }, private: true },
      { "src/index.ts": `import { a } from "left-pad";` },
    );

    expect(await runRuleForCodes(workspacePackage)).toEqual([]);
  });

  it("reports a dependency named nowhere in the package", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { "left-pad": "1.3.0" } },
      { "src/index.ts": `export const a = 1;` },
    );

    expect(await runRule(workspacePackage)).toEqual([
      {
        code: "dependencies/unused",
        location: "package.json",
        message: `"left-pad" is declared but named nowhere in the package.`,
        severity: "warning",
      },
    ]);
  });

  it("counts a dependency used through its binary as used", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { typescript: "catalog:" }, scripts: { typecheck: "tsc --noEmit" } },
      { "node_modules/typescript/package.json": `{ "bin": { "tsc": "./bin/tsc" } }` },
    );

    expect(await runRuleForCodes(workspacePackage)).toEqual([]);
  });

  it("counts an ambient type package and a scoped companion as used", async () => {
    const workspacePackage = await createPackage("@fixture/example", {
      devDependencies: { "@types/node": "catalog:", "@vitest/coverage-v8": "catalog:", vitest: "catalog:" },
      scripts: { test: "vitest run" },
    });

    expect(await runRuleForCodes(workspacePackage)).toEqual([]);
  });

  it("reports unused scoped dependencies even when multiple dependencies share the scope", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { "@fixture/tools": "1.0.0", "@fixture/unused-pkg": "1.0.0" } },
      { "src/index.ts": `import { a } from "@fixture/tools";` },
    );

    expect(await runRule(workspacePackage)).toEqual([
      {
        code: "dependencies/unused",
        location: "package.json",
        message: `"@fixture/unused-pkg" is declared but named nowhere in the package.`,
        severity: "warning",
      },
    ]);
  });
});

describe("type-only imports", () => {
  it("does not make a type-only import a runtime dependency", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { "left-pad": "1.3.0" }, exports: { ".": "./dist/index.js" } },
      { "src/index.ts": `import type { Pad } from "left-pad";\n\nexport const a: Pad | undefined = undefined;` },
    );

    expect(await runRuleForCodes(workspacePackage)).toEqual([]);
  });

  it("still requires a type-only import to be declared somewhere", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { exports: { ".": "./dist/index.js" } },
      { "src/index.ts": `import type { Pad } from "left-pad";` },
    );

    expect(await runRuleForCodes(workspacePackage)).toEqual(["dependencies/undeclared"]);
  });
});
