import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveEntrypoints } from "../documentation/reference-declarations.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createReferenceFixture } from "./reference-fixture.test-support.ts";
import { analyzeReference, referencePagePath, referencePageRel } from "./reference-generator.ts";

describe("resolveEntrypoints", () => {
  const exportsMap = {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./registries": { types: "./dist/registries/index.d.ts" },
    "./registries/browser": { types: "./dist/registries/browser.d.ts" },
    "./package.json": "./package.json",
  };

  it("maps every type-bearing subpath to its source, module, and declaration file", () => {
    expect(resolveEntrypoints(exportsMap, { prose: true })).toEqual([
      {
        subpath: ".",
        sourceRel: "index.ts",
        module: "index",
        entryDts: "index.d.ts",
      },
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
    const plans = resolveEntrypoints(exportsMap, {
      prose: true,
      entrypoints: ["./registries/browser", "."],
    });
    expect(plans.map((plan) => plan.subpath)).toEqual(["./registries/browser", "."]);
  });

  it("resolves type targets nested in export conditions", () => {
    const plans = resolveEntrypoints(
      {
        "./client": { import: { types: "./dist/client.d.ts", default: "./dist/client.js" } },
        "./server": { types: { default: "./dist/server.d.ts" } },
      },
      { prose: true },
    );
    expect(plans.map(({ subpath, entryDts }) => ({ subpath, entryDts }))).toEqual([
      { subpath: "./client", entryDts: "client.d.ts" },
      { subpath: "./server", entryDts: "server.d.ts" },
    ]);
  });

  it("selects only subpaths with type targets by default", () => {
    const plans = resolveEntrypoints(
      {
        ".": { types: "./dist/index.d.ts" },
        "./runtime": { import: "./dist/runtime.js" },
        "./direct": "./dist/direct.d.ts",
      },
      { prose: true },
    );
    expect(plans.map((plan) => plan.subpath)).toEqual([".", "./direct"]);
  });

  it("throws for a configured entrypoint that is not exported", () => {
    expect(() =>
      resolveEntrypoints(exportsMap, {
        prose: true,
        entrypoints: ["./missing"],
      }),
    ).toThrow(/not in package exports/);
  });

  it("preserves ESM extensions for a .d.mts target", () => {
    const plans = resolveEntrypoints({ ".": { types: "./dist/index.d.mts" } }, { prose: true });
    expect(plans).toEqual([
      {
        subpath: ".",
        sourceRel: "index.mts",
        module: "index",
        entryDts: "index.d.mts",
      },
    ]);
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

describe("referencePagePath", () => {
  it("puts a split page beside the main entrypoint's page", () => {
    const entries = [{ subpath: "." }, { page: "shapes", subpath: "." }];
    expect(entries.map((entry) => referencePagePath(entry, entries))).toEqual(["index.md", "shapes.md"]);
  });

  it("turns a split subpath entrypoint into a folder", () => {
    const entries = [{ subpath: "." }, { subpath: "./registries" }, { page: "local", subpath: "./registries" }];
    expect(entries.map((entry) => referencePagePath(entry, entries))).toEqual([
      "index.md",
      "registries/index.md",
      "registries/local.md",
    ]);
  });
});

function createSplitFixture(): Promise<WorkspacePackage> {
  return createReferenceFixture("fixture-split", {
    "index.ts": [
      'export { circle } from "./shapes/circle";',
      'export { square } from "./shapes/square";',
      "",
      "/**",
      " * Describes a shape, such as {@link circle}.",
      " * @param name - The shape name.",
      " * @returns The description.",
      " */",
      "export function describe(name: string): string {",
      "  return name;",
      "}",
      "",
    ].join("\n"),
    "shapes/circle.ts": [
      "interface Radius {",
      "  value: number;",
      "}",
      "",
      "/**",
      " * Builds a circle. See {@link describe}.",
      " * @param radius - The radius.",
      " * @returns The area.",
      " */",
      "export function circle(radius: Radius): number {",
      "  return radius.value;",
      "}",
      "",
    ].join("\n"),
    "shapes/square.ts": [
      "/**",
      " * Builds a square.",
      " * @param side - The side.",
      " * @returns The area.",
      " */",
      "export function square(side: number): number {",
      "  return side * side;",
      "}",
      "",
    ].join("\n"),
  });
}

describe("analyzeReference pages", () => {
  const page = (files: { path: string; contents: string }[], name: string): string =>
    files.find((file) => file.path.endsWith(`docs/reference/${name}`))?.contents ?? "";

  it("uses each destination page's allocated anchors for cross-page links", { timeout: 30_000 }, async () => {
    const fixture = await createReferenceFixture("fixture-anchor-collisions", {
      "index.ts":
        "/** See {@link Foo}, {@link foo}, {@link Functions}, {@link Err}, {@link err}. */\nexport function use(): void {}",
      "target.ts": [
        "/** First. */ export function Foo(): void {}",
        "/** Second. */ export function foo(): void {}",
        "/** Third. */ export function Functions(): void {}",
        "/** Reader. */ export interface Reader { /** Earlier heading. */ err: string; }",
        "/** Error type. */ export type Err = string;",
        "/** Error value. */ export const err = 1;",
      ].join("\n"),
    });
    (fixture.manifest.exports as Record<string, unknown>)["./target"] = { types: "./dist/target.d.ts" };
    const { files } = await analyzeReference(fixture, { prose: true, pages: { "./target": { label: "Foo" } } });
    const root = page(files, "index.md");
    expect(root).toContain("[Foo](target.md#foo-2)");
    expect(root).toContain("[foo](target.md#foo-1)");
    expect(root).toContain("[Functions](target.md#functions-1)");
    expect(root).toContain("[Err](target.md#err-1)");
    expect(root).toContain("[err](target.md#err-2)");
  });

  it("titles the main entrypoint's page with the package name", { timeout: 30_000 }, async () => {
    const { files } = await analyzeReference(await createSingleEntrypointFixture(), { prose: true });

    expect(files[0]?.contents).toContain('title: "@codenhub/fixture-single-entry"');
    expect(files[0]?.contents).toContain("# @codenhub/fixture-single-entry");
  });

  it("uses an entrypoint label as the page title and heading", { timeout: 30_000 }, async () => {
    const { files } = await analyzeReference(await createSingleEntrypointFixture(), {
      pages: { ".": { label: "Overview" } },
      prose: true,
    });

    expect(files[0]?.contents).toContain('title: "Overview"');
    expect(files[0]?.contents).toContain("# Overview");
  });

  it.each([undefined, ["./extra", "."]])(
    "keeps split pages after their entrypoint in the selected order (%s)",
    { timeout: 30_000 },
    async (entrypoints) => {
      const fixture = await createReferenceFixture("fixture-page-order", {
        "index.ts": "/** Root value. */ export const root = 1;",
        "extra.ts": 'export { detail } from "./details/value";',
        "details/value.ts": "/** Detail value. */ export const detail = 2;",
      });
      (fixture.manifest.exports as Record<string, unknown>)["./extra"] = { types: "./dist/extra.d.ts" };
      const { files, model } = await analyzeReference(fixture, {
        entrypoints,
        pages: { "./extra": { split: { details: { source: ["src/details/**"] } } } },
        prose: true,
      });
      const expected =
        entrypoints === undefined
          ? ["index.md", "extra/index.md", "extra/details.md"]
          : ["extra/index.md", "extra/details.md", "index.md"];
      expect(files.map((file) => file.path.split("docs/reference/")[1])).toEqual(expected);
      expect(model.entrypoints.map((entry) => [entry.subpath, entry.page])).toEqual(
        entrypoints === undefined
          ? [
              [".", undefined],
              ["./extra", undefined],
              ["./extra", "details"],
            ]
          : [
              ["./extra", undefined],
              ["./extra", "details"],
              [".", undefined],
            ],
      );
      expect(page(files, "extra/index.md")).toContain(`order: ${expected.indexOf("extra/index.md")}`);
      expect(page(files, "extra/details.md")).toContain(`order: ${expected.indexOf("extra/details.md")}`);
    },
  );

  it("moves symbols declared in matching sources onto a split page", { timeout: 30_000 }, async () => {
    const { files } = await analyzeReference(await createSplitFixture(), {
      pages: {
        ".": {
          split: { shapes: { label: "Shapes", source: ["src/shapes/**"] } },
        },
      },
      prose: true,
    });

    expect(files.map((file) => file.path)).toEqual([
      "fixture-split/docs/reference/index.md",
      "fixture-split/docs/reference/shapes.md",
    ]);
    const index = page(files, "index.md");
    const shapes = page(files, "shapes.md");
    expect(index).toContain("### describe");
    expect(index).not.toContain("### circle");
    expect(index).not.toContain("## Internal types");
    expect(index).toContain("[circle](shapes.md#circle)");
    expect(shapes).toContain('title: "Shapes"');
    expect(shapes).toContain("order: 1");
    expect(shapes).toContain("# Shapes");
    expect(shapes).toContain("### circle");
    expect(shapes).toContain("### square");
    expect(shapes).toContain("### Radius");
    expect(shapes).toContain("[describe](index.md#describe)");
  });

  it(
    "gives a symbol to the first split page that matches, and labels a page by its name",
    { timeout: 30_000 },
    async () => {
      const { files } = await analyzeReference(await createSplitFixture(), {
        pages: {
          ".": {
            split: {
              round: { source: ["src/shapes/circle.ts"] },
              shapes: { source: ["src/shapes/**"] },
            },
          },
        },
        prose: true,
      });

      expect(page(files, "round.md")).toContain('title: "round"');
      expect(page(files, "round.md")).toContain("### circle");
      expect(page(files, "shapes.md")).not.toContain("### circle");
      expect(page(files, "shapes.md")).toContain("### square");
    },
  );

  it(
    "links a symbol several entrypoints export to the linking entrypoint's own page",
    { timeout: 60_000 },
    async () => {
      const createFixture = async (): Promise<WorkspacePackage> => {
        const workspacePackage = await createReferenceFixture("fixture-shared", {
          "index.ts": 'export { circle } from "./shapes/circle";\n',
          "extra.ts": [
            'export { circle } from "./shapes/circle";',
            "",
            "/**",
            " * Outlines a shape, such as {@link circle}.",
            " * @param name - The shape name.",
            " * @returns The outline.",
            " */",
            "export function outline(name: string): string {",
            "  return name;",
            "}",
            "",
          ].join("\n"),
          "shapes/circle.ts": [
            "/**",
            " * Builds a circle.",
            " * @param radius - The radius.",
            " * @returns The area.",
            " */",
            "export function circle(radius: number): number {",
            "  return radius;",
            "}",
            "",
          ].join("\n"),
        });
        const exports = workspacePackage.manifest.exports as Record<string, unknown>;
        exports["./extra"] = { types: "./dist/extra.d.ts" };
        return workspacePackage;
      };

      const whole = await analyzeReference(await createFixture(), { prose: true });
      expect(page(whole.files, "extra.md")).toContain("[circle](#circle)");

      const split = await analyzeReference(await createFixture(), {
        pages: { "./extra": { split: { shapes: { source: ["src/shapes/**"] } } } },
        prose: true,
      });
      expect(page(split.files, "extra/index.md")).toContain("[circle](shapes.md#circle)");
    },
  );

  it("rejects a split page that receives no symbol", { timeout: 30_000 }, async () => {
    await expect(
      analyzeReference(await createSplitFixture(), {
        pages: { ".": { split: { text: { source: ["src/text/**"] } } } },
        prose: true,
      }),
    ).rejects.toThrow(/split page "text" .* no symbol/);
  });

  it("rejects a split page whose path another entrypoint's page has", { timeout: 30_000 }, async () => {
    const workspacePackage = await createSplitFixture();
    const exports = workspacePackage.manifest.exports as Record<string, unknown>;
    exports["./shapes"] = { types: "./dist/shapes/circle.d.ts" };

    await expect(
      analyzeReference(workspacePackage, {
        pages: { ".": { split: { shapes: { source: ["src/shapes/**"] } } } },
        prose: true,
      }),
    ).rejects.toThrow(/collide on page path: shapes\.md/);
  });

  it("rejects pages for an entrypoint that is not documented", { timeout: 30_000 }, async () => {
    await expect(
      analyzeReference(await createSplitFixture(), {
        pages: { "./missing": { label: "Missing" } },
        prose: true,
      }),
    ).rejects.toThrow(/pages\["\.\/missing"\]/);
  });
});

function createSingleEntrypointFixture(): Promise<WorkspacePackage> {
  return createReferenceFixture("fixture-single-entry", {
    "index.ts": [
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
  });
}

describe("analyzeReference", () => {
  it("expands typed wildcard exports from sources before naming pages", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-wildcard", {
      "parts/a.ts": "/** A value. */\nexport const a = 1;\n",
      "parts/b.tsx": "/** B value. */\nexport const b = 2;\n",
    });
    (workspacePackage.manifest as Record<string, unknown>).exports = {
      "./parts/*": { types: "./dist/parts/*.d.ts" },
    };
    const { model, files } = await analyzeReference(workspacePackage, { prose: true });
    expect(model.entrypoints.map((entry) => entry.subpath)).toEqual(["./parts/a", "./parts/b"]);
    expect(files.map((file) => file.path)).toEqual([
      "fixture-wildcard/docs/reference/parts/a.md",
      "fixture-wildcard/docs/reference/parts/b.md",
    ]);
    expect(files[0]?.contents).toContain("export declare const a = 1;");
    expect(files[1]?.contents).toContain("export declare const b = 2;");
  });

  it("ignores ambient files belonging only to a referenced test project", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-solution-test-types", {
      "index.ts": "/** Makes a map. */\nexport function make(): Map<string, string> { return new Map(); }\n",
      "test.d.ts": "interface Map<K, V> { testOnly: K | V; }\n",
    });
    await writeFile(
      join(workspacePackage.directory, "tsconfig.json"),
      JSON.stringify({
        files: [],
        references: [{ path: "./tsconfig.src.json" }, { path: "./tsconfig.test.json" }],
      }),
    );
    await Promise.all(
      (
        [
          ["src", ["src/index.ts"]],
          ["test", ["src/test.d.ts"]],
        ] as const
      ).map(([name, files]) =>
        writeFile(
          join(workspacePackage.directory, `tsconfig.${name}.json`),
          JSON.stringify({
            compilerOptions: { target: "ESNext", module: "Preserve", composite: true, noEmit: true },
            files,
          }),
        ),
      ),
    );
    const { model } = await analyzeReference(workspacePackage, { prose: true });
    expect(model.unresolved).toEqual([]);
  });

  it("uses each entry source's owning project's path aliases", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-solution-paths", {
      "index.ts": 'import { make } from "internal-helper";\n/** Derived number. */\nexport const derived = make();\n',
      "internal.ts": "export function make(): number { return 123; }\n",
      "client.ts": 'import { make } from "internal-helper";\n/** Derived string. */\nexport const derived = make();\n',
      "client-helper.ts": 'export function make(): string { return "value"; }\n',
    });
    (workspacePackage.manifest as Record<string, unknown>).exports = {
      ".": { types: "./dist/index.d.ts" },
      "./client": { types: "./dist/client.d.ts" },
    };
    await writeFile(
      join(workspacePackage.directory, "tsconfig.json"),
      JSON.stringify({
        files: [],
        references: [{ path: "./tsconfig.src.json" }, { path: "./tsconfig.client.json" }],
      }),
    );
    await Promise.all(
      (
        [
          ["src", ["src/index.ts", "src/internal.ts"], "internal.ts"],
          ["client", ["src/client.ts", "src/client-helper.ts"], "client-helper.ts"],
        ] as const
      ).map(([name, files, helper]) =>
        writeFile(
          join(workspacePackage.directory, `tsconfig.${name}.json`),
          JSON.stringify({
            compilerOptions: {
              module: "Preserve",
              moduleResolution: "bundler",
              strict: true,
              noEmit: true,
              composite: true,
              paths: { "internal-helper": [`./src/${helper}`] },
            },
            files,
          }),
        ),
      ),
    );
    const { files } = await analyzeReference(workspacePackage, { prose: true });
    expect(files[0]?.contents).toContain("export declare const derived: number;");
    expect(files[1]?.contents).toContain("export declare const derived: string;");
  });

  it.each([false, true])(
    "documents every subpath targeting one file, with another entrypoint=%s",
    { timeout: 30_000 },
    async (withOther) => {
      const workspacePackage = await createReferenceFixture("fixture-alias", {
        "index.ts": "/** The answer. */\nexport const answer = 42;\n",
        "other.ts": "/** Another value. */\nexport const other = 1;\n",
      });
      (workspacePackage.manifest as Record<string, unknown>).exports = {
        ".": { types: "./dist/index.d.ts" },
        "./client": { types: "./dist/index.d.ts" },
        ...(withOther ? { "./other": { types: "./dist/other.d.ts" } } : {}),
      };
      const { files } = await analyzeReference(workspacePackage, { prose: true });
      expect(files.map((file) => file.path)).toEqual([
        "fixture-alias/docs/reference/index.md",
        "fixture-alias/docs/reference/client.md",
        ...(withOther ? ["fixture-alias/docs/reference/other.md"] : []),
      ]);
      expect(files[0]?.contents).toContain("export declare const answer = 42;");
      expect(files[1]?.contents).toContain("export declare const answer = 42;");
    },
  );

  it("documents entrypoints sharing a nested source directory", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-nested", {
      "nested/a.ts": "/** A value. */\nexport const a = 1;\n",
      "nested/b/index.ts": "/** B value. */\nexport const b = 2;\n",
    });
    (workspacePackage.manifest as Record<string, unknown>).exports = {
      "./a": { types: "./dist/nested/a.d.ts" },
      "./b": { types: "./dist/nested/b/index.d.ts" },
    };
    const { model, files } = await analyzeReference(workspacePackage, { prose: true });
    expect(model.entrypoints.map((entry) => entry.symbols.map((symbol) => symbol.name))).toEqual([["a"], ["b"]]);
    expect(files[0]?.contents).toContain("export declare const a = 1;");
    expect(files[1]?.contents).toContain("export declare const b = 2;");
  });

  it.each(["tsx", "mts", "cts"])("documents the actual .%s entry source", { timeout: 30_000 }, async (extension) => {
    const workspacePackage = await createReferenceFixture(`fixture-${extension}`, {
      [`index.${extension}`]: "/** The answer. */\nexport const answer = 42;\n",
    });
    (workspacePackage.manifest.exports as Record<string, unknown>)["."] = {
      types: `./dist/index.d.${extension === "tsx" ? "ts" : extension}`,
    };
    const { files } = await analyzeReference(workspacePackage, { prose: true });
    expect(files[0]?.contents).toContain("export declare const answer = 42;");
  });

  // A real TypeDoc run: a few seconds alone, past the five-second default when
  // it shares the machine with the rest of the suite.
  it("documents a package with exactly one entrypoint", { timeout: 30_000 }, async () => {
    const workspacePackage = await createSingleEntrypointFixture();

    const { model, files } = await analyzeReference(workspacePackage, {
      prose: true,
    });

    // Regression test: TypeDoc collapses a single entry point's exports onto the
    // project root instead of a `Module` reflection unless explicitly told not to,
    // which silently produced an empty page for every package documenting only ".".
    expect(model.entrypoints).toHaveLength(1);
    expect(model.entrypoints[0]?.symbols.map((symbol) => symbol.name)).toEqual(["add"]);
    expect(files).toHaveLength(1);
    expect(files[0]?.contents).toContain("### add");
    expect(files[0]?.contents).toContain("Adds two numbers together.");
  });

  // An interface and a namespace sharing one name are one symbol to a consumer,
  // as `StandardSchemaV1` in @codenhub/validation is.
  it("renders an interface merged with a namespace as one complete section", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-merged", {
      "index.ts": [
        "/** A schema. */",
        "export interface Schema<TOutput = unknown> {",
        "  /** The schema metadata. */",
        '  readonly "~meta": Schema.Props<TOutput>;',
        "}",
        "",
        "export declare namespace Schema {",
        "  /** Metadata on a schema. */",
        "  export interface Props<TOutput = unknown> {",
        "    /** The vendor. */",
        "    readonly vendor: string;",
        "    /** Validates a value. */",
        "    readonly validate: (value: unknown) => Result<TOutput>;",
        "  }",
        "  /** A validation result. */",
        "  export type Result<TOutput> = { readonly value: TOutput };",
        "}",
        "",
      ].join("\n"),
    });

    const { model, files } = await analyzeReference(workspacePackage, {
      prose: true,
    });
    const page = files[0]?.contents ?? "";

    expect(model.entrypoints[0]?.symbols.map((symbol) => symbol.name)).toEqual(["Schema"]);
    expect(page.match(/^### Schema$/gm)).toHaveLength(1);
    expect(page).not.toContain("## Namespaces");
    expect(page).toContain(
      ["```ts", "export interface Schema<TOutput = unknown>", "export declare namespace Schema", "```"].join("\n"),
    );
    expect(page).toContain('readonly "~meta": Schema.Props<TOutput>;');
    expect(page).toContain("#### Schema.Props");
    // Members of an ambient namespace carry no `export` keyword in the emitted `.d.ts`.
    expect(page).toContain("interface Props<TOutput = unknown>");
    expect(page).toContain("Metadata on a schema.");
    expect(page).toContain("readonly vendor: string;");
    expect(page).toContain("The vendor.");
    expect(page).toContain("#### Schema.Result");
    expect(page).toContain("type Result<TOutput> = {");
  });

  it("documents the parameters and type parameters of every overload", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-overloads", {
      "index.ts": [
        "/**",
        " * Parses text, optionally with a reviver.",
        " * @typeParam T - The parsed type.",
        " * @param reviver - Turns the parsed value into a `T`.",
        " * @returns The parsed value.",
        " */",
        "export function parse(): unknown;",
        "export function parse<T>(reviver: (value: unknown) => T): T;",
        "export function parse(reviver?: (value: unknown) => unknown): unknown {",
        "  return reviver;",
        "}",
        "",
        "/** Formats values. */",
        "export interface Formatter {",
        "  /** Formats a value. */",
        "  format(): string;",
        "  format(value: number): string;",
        "}",
        "",
      ].join("\n"),
    });

    const { files } = await analyzeReference(workspacePackage, {
      prose: true,
    });
    const page = files[0]?.contents ?? "";

    expect(page).toContain("export declare function parse(): unknown;");
    expect(page).toContain("export declare function parse<T>(reviver: (value: unknown) => T): T;");
    expect(page).toContain("- `reviver` — Turns the parsed value into a `T`.");
    expect(page).toContain("- `T` — The parsed type.");
    expect(page).toContain(["format(): string;", "format(value: number): string;"].join("\n"));
  });

  it("gives each separately documented overload its own block and prose", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-overload-docs", {
      "index.ts": [
        "/**",
        " * Creates an empty box.",
        " * @returns A box holding nothing.",
        " */",
        "export function box(): { value?: undefined };",
        "/**",
        " * Creates a box holding a value.",
        " * @typeParam T - The boxed type.",
        " * @param value - The value to hold.",
        " * @returns A box holding `value`.",
        " */",
        "export function box<T>(value: T): { value: T };",
        "export function box<T>(value?: T): { value?: T } {",
        "  return { value };",
        "}",
        "",
      ].join("\n"),
    });

    const { files } = await analyzeReference(workspacePackage, {
      prose: true,
    });
    const page = files[0]?.contents ?? "";

    expect(page).toContain(
      [
        "### box",
        "",
        "```ts",
        "export declare function box(): {",
        "  value?: undefined;",
        "};",
        "```",
        "",
        "Creates an empty box.",
        "",
        "**Returns** — A box holding nothing.",
        "",
        "```ts",
        "export declare function box<T>(value: T): {",
        "  value: T;",
        "};",
        "```",
        "",
        "Creates a box holding a value.",
        "",
        "**Parameters**",
        "",
        "- `value` — The value to hold.",
        "",
        "**Type parameters**",
        "",
        "- `T` — The boxed type.",
        "",
        "**Returns** — A box holding `value`.",
      ].join("\n"),
    );
  });

  // A callable interface's call signatures are not function overloads: the interface
  // keeps its header and summary, as @codenhub/toaster's `Toaster` needs.
  it("keeps a callable interface's own signature and summary", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-callable", {
      "index.ts": [
        "/** Shows notifications. */",
        "export interface Notifier {",
        "  /**",
        "   * Shows a message.",
        "   * @param message - The text.",
        "   */",
        "  (message: string): void;",
        "  /**",
        "   * Shows a message from options.",
        "   * @param options - The options.",
        "   */",
        "  (options: { message: string }): void;",
        "}",
        "",
      ].join("\n"),
    });

    const { model, files } = await analyzeReference(workspacePackage, {
      prose: true,
    });
    const page = files[0]?.contents ?? "";

    expect(model.entrypoints[0]?.symbols[0]?.overloads).toEqual([]);
    expect(page).toContain(
      ["### Notifier", "", "```ts", "export interface Notifier", "```", "", "Shows notifications."].join("\n"),
    );
  });

  it("renders a member's @defaultValue, @returns, and @throws as written", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-member-tags", {
      "index.ts": [
        "/** Retry settings. */",
        "export interface RetryOptions {",
        "  /**",
        "   * Attempts before giving up.",
        "   * @defaultValue 3",
        "   */",
        "  attempts?: number;",
        "  /**",
        "   * Backoff strategy.",
        '   * @defaultValue `"linear"`',
        "   */",
        "  backoff?: string;",
        "  /**",
        "   * Starts retrying.",
        "   * @returns Whether the call eventually succeeded.",
        "   * @throws When attempts is negative.",
        "   */",
        "  run(): boolean;",
        "}",
        "",
      ].join("\n"),
    });

    const { files } = await analyzeReference(workspacePackage, { prose: true });
    const page = files[0]?.contents ?? "";

    expect(page).toContain("Attempts before giving up.\n\n**Default** — 3\n");
    expect(page).toContain('Backoff strategy.\n\n**Default** — `"linear"`\n');
    expect(page).toContain(
      "Starts retrying.\n\n**Returns** — Whether the call eventually succeeded.\n\n**Throws** — When attempts is negative.\n",
    );
  });

  it("lists unexported types that public declarations name as internal types", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-internal", {
      "index.ts": [
        "type Deeper = { readonly depth: number };",
        "",
        "/** What {@link wrap} returns. */",
        "type Hidden<T> = { readonly inner: T; readonly deeper: Deeper };",
        "",
        "/** A public shape. */",
        "export interface Shown {",
        "  /** A value. */",
        "  readonly value: string;",
        "}",
        "",
        "/**",
        " * Wraps a value.",
        " * @typeParam T - The wrapped type.",
        " * @param value - The value.",
        " * @returns The wrapper.",
        " */",
        "export function wrap<T>(value: T): Hidden<T> & Shown {",
        '  return { inner: value, deeper: { depth: 0 }, value: "" };',
        "}",
        "",
        "/** Keys of a record. */",
        "export type Keys<T> = { [K in keyof T]: K }[keyof T];",
        "",
        "/** The element type of an array. */",
        "export type Element<T> = T extends readonly (infer E)[] ? E : never;",
        "",
      ].join("\n"),
    });

    const { model, files } = await analyzeReference(workspacePackage, {
      prose: true,
    });
    const page = files[0]?.contents ?? "";

    // Type parameters, mapped-type keys, and `infer` bindings are in scope, not
    // missing; `Shown` is documented; `Hidden`, and `Deeper` through it, are internal.
    expect(model.unresolved).toEqual([]);
    expect(model.entrypoints[0]?.internalTypes.map((type) => type.name)).toEqual(["Deeper", "Hidden"]);
    expect(page).toContain(
      [
        "## Internal types",
        "",
        "### Deeper",
        "",
        "```ts",
        "type Deeper = {",
        "  readonly depth: number;",
        "};",
        "```",
        "",
        "Not exported; declared in `src/index.ts`.",
        "",
        "### Hidden",
        "",
        "```ts",
        "type Hidden<T> = {",
        "  readonly inner: T;",
        "  readonly deeper: Deeper;",
        "};",
        "```",
        "",
        "What [wrap](#wrap) returns.",
        "",
        "Not exported; declared in `src/index.ts`.",
      ].join("\n"),
    );
  });

  // codenhub/codenhub#251: TypeDoc resolves a conditional alias, so its tree never names it,
  // while the signature from the `.d.ts` does.
  it("lists a module-exported type the signature names, though TypeDoc resolves it", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-conditional", {
      "file.ts": [
        "/** What every runtime's file has. */",
        "export interface FileLike {",
        "  readonly name: string;",
        "}",
        "",
        "/** The runtime's file. */",
        "export type GlobalFile = typeof globalThis extends { File: { prototype: infer TFile } } ? TFile : FileLike;",
        "",
        "/**",
        " * Makes a file.",
        " * @returns The file.",
        " */",
        "export function file(): GlobalFile {",
        '  return { name: "" } as GlobalFile;',
        "}",
        "",
      ].join("\n"),
      "index.ts": 'export { file } from "./file";\n',
    });

    const { model } = await analyzeReference(workspacePackage, {
      prose: true,
    });

    expect(model.unresolved).toEqual([]);
    expect(
      model.entrypoints[0]?.internalTypes.map(({ declaredIn, name }) => ({
        declaredIn,
        name,
      })),
    ).toEqual([
      { declaredIn: ["src/file.ts"], name: "FileLike" },
      { declaredIn: ["src/file.ts"], name: "GlobalFile" },
    ]);
  });

  it("lists a type an inferred `import(…)` type names, and leaves globals alone", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-import-type", {
      "hidden.ts": [
        "/** What `made` holds. */",
        "export interface Hidden {",
        "  readonly done: Promise<void>;",
        "}",
        "",
        "export function make(): Hidden {",
        "  return { done: Promise.resolve() };",
        "}",
        "",
      ].join("\n"),
      "index.ts": [
        'import { make } from "./hidden";',
        "",
        "/** A made value. */",
        "export const made = make();",
        "",
      ].join("\n"),
    });

    const { model, files } = await analyzeReference(workspacePackage, {
      prose: true,
    });

    expect(files[0]?.contents).toContain("export declare const made: Hidden;");
    expect(model.unresolved).toEqual([]);
    expect(model.entrypoints[0]?.internalTypes.map((type) => type.name)).toEqual(["Hidden"]);
  });

  it("binds a type parameter, `infer` name, or mapped key only where it is in scope", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-scopes", {
      "index.ts": [
        "type Key = { readonly id: string };",
        "type Item = { readonly id: number };",
        "type Field = { readonly name: string };",
        "",
        "/** A store. */",
        "export interface Store {",
        "  /** Reads a value. */",
        "  get<Key>(key: Key): Key;",
        "  /** The first key. */",
        "  readonly first: Key;",
        "}",
        "",
        "/** Unwraps a promise. */",
        "export type Unwrap<T> = T extends Promise<infer Item> ? Item : Item;",
        "",
        "/** Flags each key. */",
        "export type Flags<T> = { [Field in keyof T]: boolean } & Field;",
        "",
      ].join("\n"),
    });

    const { model } = await analyzeReference(workspacePackage, {
      prose: true,
    });

    expect(model.unresolved).toEqual([]);
    expect(model.entrypoints[0]?.internalTypes.map((type) => type.name)).toEqual(["Field", "Item", "Key"]);
  });

  it("reports a type a hand-written module declares in `declare global`", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-declare-global", {
      "env.d.ts": ["export {};", "", "declare global {", "  type Ambient = { readonly inner: string };", "}", ""].join(
        "\n",
      ),
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

    const { model } = await analyzeReference(workspacePackage, {
      prose: true,
    });

    expect(model.unresolved).toEqual([
      {
        declaredIn: "src/env.d.ts",
        name: "Ambient",
        subpath: ".",
        symbol: "make",
      },
    ]);
  });

  it("reports a same-package type that the reference cannot find anywhere", { timeout: 30_000 }, async () => {
    const workspacePackage = await createReferenceFixture("fixture-unresolved", {
      // A global type from a hand-written declaration file is never emitted, so there
      // is no declaration to list it from.
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

    const { model, files } = await analyzeReference(workspacePackage, {
      prose: true,
    });

    expect(model.unresolved).toEqual([
      {
        declaredIn: "src/ambient.d.ts",
        name: "Ambient",
        subpath: ".",
        symbol: "make",
      },
    ]);
    expect(files[0]?.contents).not.toContain("## Internal types");
  });
});
