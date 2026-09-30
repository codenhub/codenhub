import { describe, expect, it } from "vitest";

import { resolveEntrypoints } from "../documentation/reference-declarations.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createReferenceFixture } from "./reference-fixture.test-support.ts";
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
  // A real TypeDoc run: a few seconds alone, past the five-second default when
  // it shares the machine with the rest of the suite.
  it("documents a package with exactly one entrypoint", { timeout: 30_000 }, async () => {
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

    const { model, files } = await analyzeReference(workspacePackage, { prose: true });
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

    const { files } = await analyzeReference(workspacePackage, { prose: true });
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

    const { files } = await analyzeReference(workspacePackage, { prose: true });
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

    const { model, files } = await analyzeReference(workspacePackage, { prose: true });

    expect(model.unresolved).toEqual([
      { declaredIn: "src/ambient.d.ts", name: "Ambient", subpath: ".", symbol: "make" },
    ]);
    expect(files[0]?.contents).not.toContain("## Internal types");
  });
});
