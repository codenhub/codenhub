import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveEntrypoints } from "../documentation/reference-declarations.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { analyzeReference, referencePageRel } from "./reference-generator.ts";

describe("resolveEntrypoints", () => {
  const exportsMap = {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./registries": { types: "./dist/registries/index.d.ts" },
    "./registries/browser": { types: "./dist/registries/browser.d.ts" },
    "./package.json": "./package.json",
  };

  it("maps every type-bearing subpath to its source, module, and declaration file", () => {
    expect(resolveEntrypoints(exportsMap, { prose: true })).toEqual([
      { subpath: ".", sourceRel: "index.ts", module: "index", entryDts: "index.d.ts" },
      {
        subpath: "./registries",
        sourceRel: "registries/index.ts",
        module: "registries",
        entryDts: "registries/index.d.ts",
      },
      {
        subpath: "./registries/browser",
        sourceRel: "registries/browser.ts",
        module: "registries/browser",
        entryDts: "registries/browser.d.ts",
      },
    ]);
  });

  it("honors an explicit entrypoints list and its order", () => {
    const plans = resolveEntrypoints(exportsMap, { prose: true, entrypoints: ["./registries/browser", "."] });
    expect(plans.map((plan) => plan.subpath)).toEqual(["./registries/browser", "."]);
  });

  it("throws for a configured entrypoint that is not exported", () => {
    expect(() => resolveEntrypoints(exportsMap, { prose: true, entrypoints: ["./missing"] })).toThrow(
      /not in package exports/,
    );
  });

  it("preserves ESM extensions for a .d.mts target", () => {
    const plans = resolveEntrypoints({ ".": { types: "./dist/index.d.mts" } }, { prose: true });
    expect(plans).toEqual([{ subpath: ".", sourceRel: "index.mts", module: "index", entryDts: "index.d.mts" }]);
  });
});

describe("referencePageRel", () => {
  const all = [".", "./registries", "./registries/browser", "./registries/supabase"];

  it("places the main entrypoint at index.md", () => {
    expect(referencePageRel(".", all)).toBe("index.md");
  });

  it("uses a folder index for a subpath that has children", () => {
    expect(referencePageRel("./registries", all)).toBe("registries/index.md");
  });

  it("uses a leaf file for a subpath with no children", () => {
    expect(referencePageRel("./registries/browser", all)).toBe("registries/browser.md");
    expect(referencePageRel("./client", [".", "./client"])).toBe("client.md");
  });
});

async function createSingleEntrypointFixture(): Promise<WorkspacePackage> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-reference-"));
  await mkdir(join(directory, "src"), { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify(
      {
        name: "@codenhub/fixture-single-entry",
        version: "1.0.0",
        exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "Preserve",
          moduleResolution: "bundler",
          lib: ["ES2024"],
          strict: true,
          composite: true,
          noEmit: true,
        },
        include: ["src/**/*"],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(directory, "src/index.ts"),
    [
      "/**",
      " * Adds two numbers together.",
      " * @param a - The first addend.",
      " * @param b - The second addend.",
      " * @returns The sum of `a` and `b`.",
      " */",
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "",
    ].join("\n"),
  );
  return {
    directory,
    directoryName: "fixture-single-entry",
    isPrivate: false,
    location: "fixture-single-entry",
    manifest: {
      name: "@codenhub/fixture-single-entry",
      version: "1.0.0",
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    },
    name: "@codenhub/fixture-single-entry",
    scripts: {},
    unscopedName: "fixture-single-entry",
    workspaceDependencies: [],
  };
}

describe("analyzeReference", () => {
  it("documents a package with exactly one entrypoint", async () => {
    const workspacePackage = await createSingleEntrypointFixture();

    const { model, files } = await analyzeReference(workspacePackage, { prose: true });

    // Regression test: TypeDoc collapses a single entry point's exports onto the
    // project root instead of a `Module` reflection unless explicitly told not to,
    // which silently produced an empty page for every package documenting only ".".
    expect(model.entrypoints).toHaveLength(1);
    expect(model.entrypoints[0]?.symbols.map((symbol) => symbol.name)).toEqual(["add"]);
    expect(files).toHaveLength(1);
    expect(files[0]?.contents).toContain("### add");
    expect(files[0]?.contents).toContain("Adds two numbers together.");
  });
});
