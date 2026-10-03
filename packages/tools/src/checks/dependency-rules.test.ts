import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createDependencyRules, findLatestStableReleases, type ReleaseSources } from "./dependency-rules.ts";
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

function createSources(catalog: Record<string, string> = {}, releases: Record<string, string> = {}): ReleaseSources {
  return {
    readCatalog: async () => new Map(Object.entries(catalog)),
    readLatestReleases: async () => new Map(Object.entries(releases)),
  };
}

async function runRule(
  workspacePackage: WorkspacePackage,
  siblings: readonly WorkspacePackage[] = [],
  sources: ReleaseSources = createSources(),
): Promise<Finding[]> {
  const results = await Promise.all(
    createDependencyRules([workspacePackage, ...siblings], sources).map(async (rule) =>
      rule.run({ includePack: false, package: workspacePackage }),
    ),
  );
  return results.flat();
}

async function runRuleForCodes(
  workspacePackage: WorkspacePackage,
  siblings: readonly WorkspacePackage[] = [],
  sources?: ReleaseSources,
): Promise<string[]> {
  return (await runRule(workspacePackage, siblings, sources)).map(({ code }) => code);
}

describe("dependency ranges", () => {
  it("asks a public package to install a public sibling from its release", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { dependencies: { "@fixture/other": "workspace:*" }, peerDependencies: { "@fixture/other": ">=1" } },
      { "src/index.ts": `import { a } from "@fixture/other";` },
    );
    const other = await createPackage("@fixture/other");

    expect(await runRule(workspacePackage, [other])).toEqual([
      {
        code: "dependencies/published-range",
        location: "package.json",
        message: `"dependencies.@fixture/other" should use a "catalog:" range, so it installs the released version.`,
        severity: "warning",
      },
    ]);
  });

  it("keeps a private package on the working tree of its siblings", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { "@fixture/other": "catalog:" }, private: true },
      { "src/index.ts": `import { a } from "@fixture/other";` },
    );
    const other = await createPackage("@fixture/other");

    expect(
      await runRuleForCodes(
        workspacePackage,
        [other],
        createSources({ "@fixture/other": "^1.0.0" }, { "@fixture/other": "1.0.0" }),
      ),
    ).toEqual(["dependencies/workspace-range"]);
  });

  it("keeps a public package on the working tree of a private sibling", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { devDependencies: { "@fixture/tools": "workspace:*" } },
      { "src/index.test.ts": `import { a } from "@fixture/tools";` },
    );
    const tools = await createPackage("@fixture/tools", { private: true });

    expect(await runRuleForCodes(workspacePackage, [tools])).toEqual([]);
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

describe("catalog releases", () => {
  async function createConsumer(): Promise<WorkspacePackage[]> {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { dependencies: { "@fixture/other": "catalog:" } },
      { "src/index.ts": `import { a } from "@fixture/other";` },
    );
    return [workspacePackage, await createPackage("@fixture/other")];
  }

  it("accepts a catalog entry that starts at the latest release", async () => {
    const [workspacePackage, other] = await createConsumer();
    const sources = createSources({ "@fixture/other": "^1.2.0" }, { "@fixture/other": "1.2.0" });

    expect(await runRuleForCodes(workspacePackage!, [other!], sources)).toEqual([]);
  });

  it("reports a catalog entry behind the latest release", async () => {
    const [workspacePackage, other] = await createConsumer();
    const sources = createSources({ "@fixture/other": "^1.1.0" }, { "@fixture/other": "1.2.0" });

    expect((await runRule(workspacePackage!, [other!], sources)).map(({ message }) => message)).toEqual([
      `"dependencies.@fixture/other" installs catalog range "^1.1.0"; the latest release is 1.2.0, so pnpm-workspace.yaml should say "^1.2.0".`,
    ]);
  });

  it("reports a catalog entry for a package that was never released", async () => {
    const [workspacePackage, other] = await createConsumer();
    const sources = createSources({ "@fixture/other": "^0.1.0" });

    expect(await runRuleForCodes(workspacePackage!, [other!], sources)).toEqual(["dependencies/catalog-release"]);
  });

  it("reports a catalog reference with no catalog entry", async () => {
    const [workspacePackage, other] = await createConsumer();
    const sources = createSources({}, { "@fixture/other": "1.2.0" });

    expect((await runRule(workspacePackage!, [other!], sources)).map(({ message }) => message)).toEqual([
      `"dependencies.@fixture/other" installs from the catalog, but pnpm-workspace.yaml has no catalog entry for it.`,
    ]);
  });

  it("reads only stable versions as releases", () => {
    const releases = findLatestStableReleases([
      "@fixture/other@1.2.0",
      "@fixture/other@1.10.0",
      "@fixture/other@2.0.0-beta.1",
      "@fixture/draft@draft",
      "not-a-release",
    ]);

    expect([...releases]).toEqual([["@fixture/other", "1.10.0"]]);
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

describe("inlined dependencies", () => {
  const inlined = {
    codenhub: { bundled: ["left-pad"] },
    devDependencies: { "left-pad": "1.3.0" },
    exports: { ".": "./dist/index.js" },
  };
  const source = { "src/index.ts": `import { a } from "left-pad";\nexport const b = a;` };

  it("accepts published code that imports a bundled dev dependency", async () => {
    const workspacePackage = await createPackage("@fixture/example", inlined, source);

    expect(await runRule(workspacePackage)).toEqual([]);
  });

  it("still requires published code to import only what a consumer receives, for names not bundled", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { ...inlined, devDependencies: { "left-pad": "1.3.0", "right-pad": "1.0.0" } },
      { "src/index.ts": `import { a } from "left-pad";\nimport { b } from "right-pad";` },
    );

    expect(await runRule(workspacePackage)).toEqual([
      {
        code: "dependencies/runtime-declaration",
        location: "package.json",
        message: `"right-pad" is imported by published code and must be a dependency or a peerDependency.`,
        severity: "error",
      },
    ]);
  });

  it("reports a bundled name that a consumer would install", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { ...inlined, dependencies: { "left-pad": "1.3.0" }, devDependencies: undefined },
      source,
    );

    expect(await runRule(workspacePackage)).toEqual([
      {
        code: "dependencies/bundled-not-dev",
        location: "package.json",
        message: `"left-pad" is listed in "codenhub.bundled" but is not a devDependency, so a consumer would install it.`,
        severity: "error",
      },
    ]);
  });

  it("reports a bundled name that is declared nowhere", async () => {
    const workspacePackage = await createPackage(
      "@fixture/example",
      { codenhub: { bundled: ["left-pad"] }, exports: { ".": "./dist/index.js" } },
      source,
    );

    expect(await runRuleForCodes(workspacePackage)).toEqual([
      "dependencies/bundled-not-dev",
      "dependencies/undeclared",
    ]);
  });

  it("reports a bundled field that is not an array of package names", async () => {
    const malformed = ["left-pad", [1], [""], { "left-pad": true }];
    const found = await Promise.all(
      malformed.map(async (bundled) =>
        runRuleForCodes(
          await createPackage(
            "@fixture/example",
            { devDependencies: { "left-pad": "1.3.0" }, codenhub: { bundled } },
            { "src/index.ts": `export const a = "left-pad";` },
          ),
        ),
      ),
    );

    expect(found).toEqual(malformed.map(() => ["dependencies/bundled-invalid"]));
  });

  it("warns about a bundled name that no source file imports", async () => {
    const workspacePackage = await createPackage("@fixture/example", inlined, {
      "src/index.ts": `export const a = "left-pad";`,
    });

    expect(await runRule(workspacePackage)).toEqual([
      {
        code: "dependencies/bundled-unused",
        location: "package.json",
        message: `"left-pad" is listed in "codenhub.bundled" but no source file imports it.`,
        severity: "warning",
      },
    ]);
  });

  it("reports built JavaScript or declarations that still name a bundled package", async () => {
    const leakedJs = await createPackage("@fixture/example", inlined, {
      ...source,
      "dist/index.js": `import { a } from "left-pad";\nexport const b = a;`,
    });
    const leakedTypes = await createPackage("@fixture/example", inlined, {
      ...source,
      "dist/index.d.ts": `import type { Pad } from "left-pad";\nexport declare const b: Pad;`,
      "dist/index.js": `export const b = 1;`,
    });
    const leakedDeep = await createPackage("@fixture/example", inlined, {
      ...source,
      "dist/lib/inner.d.mts": `export * from "left-pad/sub";`,
    });

    expect(await runRule(leakedJs)).toEqual([
      {
        code: "dependencies/bundled-leaked",
        location: "dist/index.js",
        message: `"left-pad" is listed in "codenhub.bundled" but the built output still names it, so a consumer would be missing it.`,
        severity: "error",
      },
    ]);
    expect((await runRule(leakedTypes)).map(({ code, location }) => [code, location])).toEqual([
      ["dependencies/bundled-leaked", "dist/index.d.ts"],
    ]);
    expect((await runRule(leakedDeep)).map(({ code, location }) => [code, location])).toEqual([
      ["dependencies/bundled-leaked", "dist/lib/inner.d.mts"],
    ]);
  });

  it("accepts built output that inlined the package", async () => {
    const workspacePackage = await createPackage("@fixture/example", inlined, {
      ...source,
      "dist/index.d.ts": `declare const b: number;\nexport { b };`,
      "dist/index.js": `const a = 1;\nexport const b = a;`,
    });

    expect(await runRule(workspacePackage)).toEqual([]);
  });

  it("does not read an example in a doc comment as an import", async () => {
    const workspacePackage = await createPackage("@fixture/example", inlined, {
      ...source,
      "dist/index.js": [
        "/**",
        " * @example",
        ' * import { a } from "left-pad";',
        " */",
        '// import { a } from "left-pad";',
        "export const b = 1;",
      ].join("\n"),
    });

    expect(await runRule(workspacePackage)).toEqual([]);
  });

  it("skips the leak check when nothing is built", async () => {
    const workspacePackage = await createPackage("@fixture/example", inlined, source);

    expect(await runRule(workspacePackage)).toEqual([]);
  });

  it("leaves a private package's staleness and output alone, and still checks its list is well formed", async () => {
    const stale = await createPackage(
      "@fixture/example",
      { ...inlined, private: true },
      {
        "src/index.ts": `export const a = "left-pad";`,
        "dist/index.js": `import { a } from "left-pad";`,
      },
    );
    const malformed = await createPackage(
      "@fixture/example",
      { private: true, devDependencies: { "left-pad": "1.3.0" }, codenhub: { bundled: "left-pad" } },
      { "src/index.ts": `export const a = "left-pad";` },
    );

    expect(await runRuleForCodes(stale)).toEqual([]);
    expect(await runRuleForCodes(malformed)).toEqual(["dependencies/bundled-invalid"]);
  });
});
