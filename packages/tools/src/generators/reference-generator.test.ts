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

    const { model, files } = await analyzeReference(workspacePackage, { prose: true });
    const page = files[0]?.contents ?? "";

    expect(model.entrypoints[0]?.symbols[0]?.overloads).toEqual([]);
    expect(page).toContain(
      ["### Notifier", "", "```ts", "export interface Notifier", "```", "", "Shows notifications."].join("\n"),
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

    const { model, files } = await analyzeReference(workspacePackage, { prose: true });
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

    const { model } = await analyzeReference(workspacePackage, { prose: true });

    expect(model.unresolved).toEqual([]);
    expect(model.entrypoints[0]?.internalTypes.map(({ declaredIn, name }) => ({ declaredIn, name }))).toEqual([
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

    const { model, files } = await analyzeReference(workspacePackage, { prose: true });

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

    const { model } = await analyzeReference(workspacePackage, { prose: true });

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

    const { model } = await analyzeReference(workspacePackage, { prose: true });

    expect(model.unresolved).toEqual([{ declaredIn: "src/env.d.ts", name: "Ambient", subpath: ".", symbol: "make" }]);
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
