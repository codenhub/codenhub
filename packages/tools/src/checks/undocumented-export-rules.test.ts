import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createUndocumentedExportRules } from "./undocumented-export-rules.ts";

const [rule] = createUndocumentedExportRules();
const directories: string[] = [];

async function createPackage(
  files: Record<string, string>,
  exportsMap: unknown = { ".": { types: "./dist/index.d.ts" } },
): Promise<WorkspacePackage> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-export-docs-"));
  directories.push(directory);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), contents, "utf8");
    }),
  );
  return {
    directory,
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest: { name: "@codenhub/example", private: false, exports: exportsMap },
    name: "@codenhub/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("undocumented-export", () => {
  it("accepts documented functions, constants, interfaces, classes, enums and type aliases", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts": `
/** Creates a value. */
export declare function createValue(): string;
/** Default value. */
export declare const VALUE: string;
/** Value shape. */
export interface Value { undocumentedMember: string; }
/** Stores values. */
export declare class Store { undocumentedMethod(): void; }
/** Supported values. */
export declare enum Kind { First }
/** Value identifier. */
export type Identifier = string;
`,
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([]);
  });

  it("reports an undocumented public declaration as an error", async () => {
    const pkg = await createPackage({ "dist/index.d.ts": "export declare function missing(): void;" });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      {
        code: "undocumented-export/missing-jsdoc",
        severity: "error",
        location: "dist/index.d.ts",
        message: 'Export "missing" from "." has no JSDoc/TSDoc on its declaration.',
      },
    ]);
  });

  it("follows renamed barrel re-exports to the original documented declaration", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts": 'export { renamed as publicName } from "./barrel.js";',
      "dist/barrel.d.ts": 'export { original as renamed } from "./original.js";',
      "dist/original.d.ts": "/** Original purpose. */\nexport declare function original(): void;",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([]);
  });

  it("does not let barrel comments document an undocumented original", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts": '/** Barrel prose. */\nexport { original as renamed } from "./original.js";',
      "dist/original.d.ts": "export declare function original(): void;",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({
        code: "undocumented-export/missing-jsdoc",
        location: "dist/original.d.ts",
        message: expect.stringContaining('"renamed"'),
      }),
    ]);
  });

  it("checks star exports without leaking default exports or private declarations", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts": 'export * from "./values.js";',
      "dist/values.d.ts":
        "declare function internal(): void;\nexport default function hiddenDefault(): void;\nexport declare const PUBLIC: string;",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({
        code: "undocumented-export/missing-jsdoc",
        message: expect.stringContaining('"PUBLIC"'),
      }),
    ]);
  });

  it("resolves imported defaults and local aliases", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts":
        'import imported from "./value.js";\nexport { imported as Public };\n/** Local purpose. */\ndeclare const local: string;\nexport default local;',
      "dist/value.d.ts": "/** Creates the default value. */\nexport default function named(): void;",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([]);
  });

  it("does not resolve a star export to a private declaration in an earlier barrel", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts": 'export * from "./private.js";\nexport * from "./public.js";',
      "dist/private.d.ts": "/** Private implementation. */\ndeclare const value: string;\nexport {};",
      "dist/public.d.ts": "export declare const value: string;",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({ code: "undocumented-export/missing-jsdoc", location: "dist/public.d.ts" }),
    ]);
  });

  it("gives an explicit re-export precedence over a star and a private local name", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts":
        '/** Local implementation. */\ndeclare const value: string;\nexport * from "./star.js";\nexport { value } from "./explicit.js";',
      "dist/star.d.ts": "/** Star value. */\nexport declare const value: string;",
      "dist/explicit.d.ts": "export declare const value: string;",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({ code: "undocumented-export/missing-jsdoc", location: "dist/explicit.d.ts" }),
    ]);
  });

  it("checks anonymous default declarations", async () => {
    const pkg = await createPackage({ "dist/index.d.ts": "export default function(): void;" });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({
        code: "undocumented-export/missing-jsdoc",
        message: expect.stringContaining('"default"'),
      }),
    ]);
  });

  it("terminates cyclic star barrels and reports each public name once", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts": 'export * from "./other.js";\nexport declare const value: string;',
      "dist/other.d.ts": 'export * from "./index.js";',
    });
    expect(await rule.run({ package: pkg, includePack: false })).toHaveLength(1);
  });

  it("accepts documentation on any declaration in an overload set", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts":
        "export declare function read(): string;\n/** Reads a key. */\nexport declare function read(key: string): string;",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([]);
  });

  it("ignores plain comments and accepts tag-only JSDoc", async () => {
    const pkg = await createPackage({
      "dist/index.d.ts":
        "// Ordinary comment.\nexport declare const undocumented: string;\n/** @deprecated */\nexport declare const old: string;",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({
        code: "undocumented-export/missing-jsdoc",
        message: expect.stringContaining('"undocumented"'),
      }),
    ]);
  });

  it("skips package.json and exports without a type target", async () => {
    const pkg = await createPackage(
      {},
      {
        "./package.json": { types: "./missing.d.ts" },
        "./style": "./dist/style.css",
        ".": { import: "./dist/index.js" },
      },
    );
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([]);
  });

  it("expands typed wildcard subpaths", async () => {
    const pkg = await createPackage(
      {
        "dist/data/a.d.ts": "export declare const a: string;",
        "dist/data/b.d.ts": "/** The second value. */\nexport declare const b: string;",
      },
      { "./data/*": { types: "./dist/data/*.d.ts" } },
    );
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({
        code: "undocumented-export/missing-jsdoc",
        message: expect.stringContaining('"./data/a"'),
      }),
    ]);
  });

  it("follows .mjs and directory declaration barrels", async () => {
    const pkg = await createPackage(
      {
        "dist/index.d.mts": 'export { value } from "./value.mjs";\nexport { other } from "./nested";',
        "dist/value.d.mts": "/** Value purpose. */\nexport declare const value: string;",
        "dist/nested/index.d.ts": "/** Other purpose. */\nexport declare const other: string;",
      },
      { ".": { types: "./dist/index.d.mts" } },
    );
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([]);
  });

  it("emits missing declarations in memory while retaining JSDoc and barrel aliases", async () => {
    const pkg = await createPackage({
      "tsconfig.json": JSON.stringify({ compilerOptions: { noLib: true, noEmit: true, removeComments: true } }),
      "src/index.ts": 'export { documented, missing } from "./values.js";',
      "src/values.ts": "/** Value purpose. */\nexport const documented = 1;\nexport const missing = 2;",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({
        code: "undocumented-export/missing-jsdoc",
        message: expect.stringContaining('"missing"'),
      }),
    ]);
    expect((await readdir(pkg.directory)).sort()).toEqual(["src", "tsconfig.json"]);
  });

  it("reports an unresolvable typed export instead of silently passing it", async () => {
    const pkg = await createPackage({ "tsconfig.json": "{}" });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({ code: "undocumented-export/unresolved-export", severity: "warning" }),
    ]);
  });

  it("inspects a conditional root export without subpath keys", async () => {
    const pkg = await createPackage(
      { "dist/index.d.ts": "export declare const value: string;" },
      {
        import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
      },
    );
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({
        code: "undocumented-export/missing-jsdoc",
        message: expect.stringContaining('"value"'),
      }),
    ]);
  });

  it("emits missing .mts barrel dependencies", async () => {
    const pkg = await createPackage(
      {
        "tsconfig.json": JSON.stringify({ compilerOptions: { noLib: true } }),
        "dist/index.d.mts": 'export { value } from "./value.mjs";',
        "src/index.mts": 'export { value } from "./value.mjs";',
        "src/value.mts": "/** Value purpose. */\nexport const value = 1;",
      },
      { ".": { types: "./dist/index.d.mts" } },
    );
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([]);
  });

  it("emits a TSX entrypoint without existing declarations", async () => {
    const pkg = await createPackage({
      "tsconfig.json": JSON.stringify({ compilerOptions: { noLib: true, jsx: "preserve" } }),
      "src/index.tsx": "/** Creates a view. */\nexport function View() { return null; }",
    });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([]);
  });

  it("reports a typed wildcard with no generated declarations or sources", async () => {
    const pkg = await createPackage({ "tsconfig.json": "{}" }, { "./data/*": { types: "./dist/data/*.d.ts" } });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({ code: "undocumented-export/unresolved-export", location: "dist/data/*.d.ts" }),
    ]);
  });

  it("reports an unresolved star dependency", async () => {
    const pkg = await createPackage({ "tsconfig.json": "{}", "dist/index.d.ts": 'export * from "./missing.js";' });
    expect(await rule.run({ package: pkg, includePack: false })).toEqual([
      expect.objectContaining({
        code: "undocumented-export/unresolved-export",
        severity: "warning",
        location: "dist/missing.d.ts",
      }),
    ]);
  });

  it("applies to public packages and private packages opted into documentation", async () => {
    const pkg = await createPackage({});
    expect(rule.appliesTo(pkg)).toBe(true);
    pkg.isPrivate = true;
    pkg.manifest = { ...pkg.manifest, private: true };
    expect(rule.appliesTo(pkg)).toBe(false);
    pkg.manifest = { ...pkg.manifest, codenhub: { docs: { label: "Example", status: "active" } } };
    expect(rule.appliesTo(pkg)).toBe(true);
  });
});
