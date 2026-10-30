import { describe, expect, it } from "vitest";

import { createReferenceFixture } from "../generators/reference-fixture.test-support.ts";
import { analyzeReference } from "../generators/reference-generator.ts";
import type { ReferenceModel } from "./reference-model.ts";
import {
  attachSignatures,
  buildSignatureResolver,
  extractSignatures,
  resolveDtsCandidates,
} from "./reference-signatures.ts";

const dts = `
export declare function createAppError(message: string): AppError;
export declare function ok<T>(value: T): Ok<T>;
export declare function ok(): Ok<void>;
export interface AppError extends Error {
    readonly type: AppErrorType;
    readonly messageKey?: string;
    toJSON(): AppErrorJson;
}
export declare class Registry<T> extends Base implements Frozen {
    add(name: string, value: T): void;
    private secret;
}
export type Result<T> = Ok<T> | Err;
export declare const DEFAULT_APP_ERROR_MESSAGE: "Something went wrong";
export declare const browserErrorRegistry: import("../types.js").ReadonlyErrorRegistry;
export declare enum Level {
    Low = 0,
    High = 1
}
export { somethingReexported } from "./other";
`;

describe("internal type resolution", () => {
  it(
    "lists unexported typeof values with their emitted declarations and source files",
    { timeout: 30_000 },
    async () => {
      const fixture = await createReferenceFixture("hidden", {
        "index.ts": `
        type Mode = "test" | "live";
        const config = { mode: "test" as Mode };
        function read(): typeof config { return config; }
        export type Config = typeof config;
        export type Reader = typeof read;
      `,
      });
      const { model, files } = await analyzeReference(fixture, { prose: true });
      expect(model.unresolved).toEqual([]);
      expect(model.entrypoints[0]?.internalTypes).toEqual([
        { name: "config", signature: "declare const config: {\n    mode: Mode;\n};", declaredIn: ["src/index.ts"] },
        { name: "Mode", signature: 'type Mode = "test" | "live";', declaredIn: ["src/index.ts"] },
        { name: "read", signature: "declare function read(): typeof config;", declaredIn: ["src/index.ts"] },
      ]);
      expect(files[0]?.contents).toContain("declare const config:");
      expect(files[0]?.contents).toContain("Not exported; declared in `src/index.ts`.");
    },
  );

  it("reports an imported type from a hand-written declaration", { timeout: 30_000 }, async () => {
    const fixture = await createReferenceFixture("handwritten-only-type", {
      "index.ts": "import type {Hidden} from './types'; /** Makes. */ export function make():Hidden {return {x:1};}",
      "types.d.ts": "/** Hidden. */ export interface Hidden {x:number;}",
    });
    const { model } = await analyzeReference(fixture, { prose: true });
    expect(model.unresolved).toEqual([{ subpath: ".", symbol: "make", name: "Hidden", declaredIn: "src/types.d.ts" }]);
  });

  it("lists namespace-local types without losing lexical shadowing", { timeout: 30_000 }, async () => {
    const fixture = await createReferenceFixture("namespace-internal", {
      "index.ts": `
        export namespace NS {
          type Hidden = {x:number};
          /** Public. */ export function make():Hidden {return {x:1};}
          /** Generic. */ export function identity<Hidden>(value:Hidden):Hidden {return value;}
        }
      `,
    });
    const { model } = await analyzeReference(fixture, { prose: true });
    expect(model.unresolved).toEqual([]);
    expect(model.entrypoints[0]?.internalTypes.map(({ name }) => name)).toEqual(["Hidden"]);
  });
});

describe("protected class members", () => {
  it("shows subclass members with protected signatures and hides private members", { timeout: 30_000 }, async () => {
    const fixture = await createReferenceFixture("protected-members", {
      "index.ts": `
        export class Base {
          protected value = 1;
          protected read(): number { return this.value; }
          private secret = 2;
          #hidden = 3;
        }
      `,
    });
    const { model, files } = await analyzeReference(fixture, { prose: true });
    expect(model.entrypoints[0]?.symbols[0]?.members.map(({ name, signature }) => ({ name, signature }))).toEqual([
      { name: "value", signature: "protected value: number;" },
      { name: "read", signature: "protected read(): number;" },
    ]);
    expect(files[0]?.contents).toContain("protected value: number;");
    expect(files[0]?.contents).toContain("protected read(): number;");
  });
});

describe("special export bindings", () => {
  it.each([
    [
      "named function",
      "export default function original() {}",
      "original",
      "export default function original(): void;",
    ],
    ["named class", "export default class Original {}", "Original", "export default class Original"],
    ["anonymous function", "export default function() {}", "default", "export default function (): void;"],
    [
      "export assignment",
      "function original() {} export = original;",
      "original",
      "declare function original(): void;",
    ],
  ])(
    "attaches the declaration name and signature for %s",
    { timeout: 30_000 },
    async (_case, source, name, signature) => {
      const fixture = await createReferenceFixture("special-export", { "index.ts": source });
      const { model } = await analyzeReference(fixture, { prose: true });
      expect(
        model.entrypoints[0]?.symbols.map((symbol) => ({ name: symbol.name, signature: symbol.signature })),
      ).toEqual([{ name, signature }]);
    },
  );
});

describe("namespace export signatures", () => {
  it("attaches target-module declarations to namespace export members", { timeout: 30_000 }, async () => {
    const fixture = await createReferenceFixture("ns-only", {
      "index.ts": 'export * as ns from "./leaf";',
      "leaf.ts": "/** Reads. */ export function read(value: string): string { return value; }",
    });
    const { model } = await analyzeReference(fixture, { prose: true });
    expect(model.entrypoints[0]?.symbols[0]?.namespaceMembers[0]?.signature).toBe(
      "export declare function read(value: string): string;",
    );
  });
});

describe("index signature members", () => {
  it.each([
    ["interface", "export interface Lookup {\n /** Looks up a value. */\n [key: string]: number; }"],
    ["class", "export class Lookup {\n /** Looks up a value. */\n [key: string]: number; }"],
    ["type literal", "export type Lookup = {\n /** Looks up a value. */\n [key: string]: number; };"],
  ])("keeps the declaration and prose of a %s index signature", { timeout: 30_000 }, async (_case, source) => {
    const fixture = await createReferenceFixture("index-signatures", { "index.ts": source });
    const { model, files } = await analyzeReference(fixture, { prose: true });
    const member = model.entrypoints[0]?.symbols[0]?.members.find((member) => member.kind === "index-signature");
    expect(member?.signature).toBe("[key: string]: number;");
    expect(member?.doc).toBe("Looks up a value.");
    expect(files[0]?.contents).toContain("Looks up a value.");
  });
});

describe("overload documentation", () => {
  it.each(["param", "typeParam"])(
    "separates overloads whose only distinct prose is @%s",
    { timeout: 30_000 },
    async (tag) => {
      const fixture = await createReferenceFixture("overload-params", {
        "index.ts": `
        /** Reads a value.
         * @${tag} ${tag === "param" ? "value" : "T"} - The first description.
         */
        export function read<T extends string>(value: T): T;
        /** Reads a value.
         * @${tag} ${tag === "param" ? "value" : "T"} - The second description.
         */
        export function read<T extends number>(value: T): T;
        export function read(value: unknown): unknown { return value; }
      `,
      });
      const { model, files } = await analyzeReference(fixture, { prose: true });
      const overloads = model.entrypoints[0]?.symbols[0]?.overloads ?? [];
      expect(overloads).toHaveLength(2);
      expect(overloads.every((overload) => overload.signature !== undefined)).toBe(true);
      expect(files[0]?.contents).toContain("The first description.");
      expect(files[0]?.contents).toContain("The second description.");
    },
  );
});

describe("inherited member identity", () => {
  it("links an inherited member to its qualified declaring type", { timeout: 30_000 }, async () => {
    const fixture = await createReferenceFixture("inherited-ns", {
      "index.ts": `
        export namespace NS {
          /** Base. */ export class Base {
            /** Field. */ field = 1;
          }
        }
        /** Child. */ export class Child extends NS.Base {}
      `,
    });
    const { model, files } = await analyzeReference(fixture, { prose: true });
    expect(model.entrypoints[0]?.symbols[0]?.members.find((member) => member.name === "field")?.inheritedFrom).toBe(
      "NS.Base",
    );
    expect(files[0]?.contents).toContain("Inherited from [NS.Base](#nsbase).");
  });
});

describe("extractSignatures", () => {
  const index = extractSignatures(dts, "index.d.ts");

  it("keeps every method overload across merged interfaces in source order", () => {
    const signature = extractSignatures(`
      export interface Reader { read(value: string): string; }
      export interface Reader { read(value: number): number; }
      export interface Reader { read(value: boolean): boolean; }
    `).get("Reader");
    expect(signature?.members?.get("read")).toBe(
      "read(value: string): string;\nread(value: number): number;\nread(value: boolean): boolean;",
    );
  });

  it("captures a function signature as one line", () => {
    expect(index.get("createAppError")?.text).toBe(
      "export declare function createAppError(message: string): AppError;",
    );
  });

  it("collects function overloads under one name", () => {
    const ok = index.get("ok");
    expect(ok?.text).toBe("export declare function ok<T>(value: T): Ok<T>;");
    expect(ok?.overloads).toEqual(["export declare function ok(): Ok<void>;"]);
  });

  it("keeps only the interface header and lists its members", () => {
    const appError = index.get("AppError");
    expect(appError?.text).toBe("export interface AppError extends Error");
    expect([...(appError?.members ?? [])]).toEqual([
      ["type", "readonly type: AppErrorType;"],
      ["messageKey", "readonly messageKey?: string;"],
      ["toJSON", "toJSON(): AppErrorJson;"],
    ]);
  });

  it("keeps the class header with type parameters and heritage, and drops private members", () => {
    const registry = index.get("Registry");
    expect(registry?.text).toBe("export declare class Registry<T> extends Base implements Frozen");
    expect([...(registry?.members ?? [])]).toEqual([["add", "add(name: string, value: T): void;"]]);
  });

  it("lists a class constructor, which has no name node, under `constructor`", () => {
    const store = extractSignatures(
      "export declare class Store {\n    constructor(options?: StoreOptions);\n    constructor(seed: string);\n}",
      "store.d.ts",
    ).get("Store");
    expect([...(store?.members ?? [])]).toEqual([
      ["constructor", "constructor(options?: StoreOptions);\nconstructor(seed: string);"],
    ]);
  });

  it("drops a private constructor", () => {
    const singleton = extractSignatures(
      "export declare class Singleton {\n    private constructor();\n    static create(): Singleton;\n}",
      "singleton.d.ts",
    ).get("Singleton");
    expect([...(singleton?.members ?? [])]).toEqual([["create", "static create(): Singleton;"]]);
  });

  it("keeps a type alias and a variable declaration whole, with a terminating semicolon", () => {
    expect(index.get("Result")?.text).toBe("export type Result<T> = Ok<T> | Err;");
    expect(index.get("DEFAULT_APP_ERROR_MESSAGE")?.text).toBe(
      'export declare const DEFAULT_APP_ERROR_MESSAGE: "Something went wrong";',
    );
  });

  it('strips `import("...").` prefixes from a signature', () => {
    expect(index.get("browserErrorRegistry")?.text).toBe(
      "export declare const browserErrorRegistry: ReadonlyErrorRegistry;",
    );
  });

  it("preserves whitespace in member string and template literal types", () => {
    const members = extractSignatures(
      'export interface Format { readonly separator?: "a  b"; pattern: `a  ${string}  b`; }',
    ).get("Format")?.members;
    expect(members?.get("separator")).toBe('readonly separator?: "a  b";');
    expect(members?.get("pattern")).toBe("pattern: `a  ${string}  b`;");
  });

  it("preserves newlines after line comments inside member declarations", () => {
    const declaration = "read(\n    // The next token must remain a parameter.\n    value: string\n  ): void;";
    expect(extractSignatures(`export interface Reader { ${declaration} }`).get("Reader")?.members?.get("read")).toBe(
      declaration,
    );
  });

  it("cleans actual import types without rewriting string or template literal contents", () => {
    const declarations = [
      "export declare const syntax: \"import('./types.js').Value\";",
      'export type Pattern = `import("./types.js").Value  ${string}`;',
      'export type Actual = import("./types.js").Value<import("./types.js").Other>;',
      'export type Query = typeof import("./types.js").value;',
    ];
    const signatures = extractSignatures(declarations.join("\n"));
    expect(signatures.get("syntax")?.text).toBe(declarations[0]);
    expect(signatures.get("Pattern")?.text).toBe(declarations[1]);
    expect(signatures.get("Actual")?.text).toBe("export type Actual = Value<Other>;");
    expect(signatures.get("Query")?.text).toBe("export type Query = typeof value;");
  });

  it("captures an enum header and members", () => {
    const level = index.get("Level");
    expect(level?.text).toBe("export declare enum Level");
    expect([...(level?.members ?? [])]).toEqual([
      ["Low", "Low = 0"],
      ["High", "High = 1"],
    ]);
  });

  it("ignores re-export statements", () => {
    expect(index.has("somethingReexported")).toBe(false);
  });
});

describe("attachSignatures", () => {
  it("fills symbol and member signature text from the matching module index", () => {
    const model: ReferenceModel = {
      packageName: "@codenhub/error",
      unresolved: [],
      unsupported: [],
      entrypoints: [
        {
          subpath: ".",
          module: "index",
          internalTypes: [],
          symbols: [
            {
              name: "AppError",
              kind: "interface",
              typeParameters: [],
              parameters: [],
              throws: [],
              examples: [],
              see: [],
              namespaceMembers: [],
              overloads: [],
              members: [
                {
                  name: "type",
                  kind: "property",
                  isOptional: false,
                  isReadonly: true,
                  isStatic: false,
                  parameters: [],
                  typeParameters: [],
                  throws: [],
                  examples: [],
                  see: [],
                },
                {
                  name: "ghost",
                  kind: "property",
                  isOptional: false,
                  isReadonly: false,
                  isStatic: false,
                  parameters: [],
                  typeParameters: [],
                  throws: [],
                  examples: [],
                  see: [],
                },
              ],
            },
          ],
        },
      ],
    };

    const attached = attachSignatures(model, new Map([["index", extractSignatures(dts)]]));
    const appError = attached.entrypoints[0]?.symbols[0];

    expect(appError?.signature).toBe("export interface AppError extends Error");
    expect(appError?.members[0]?.signature).toBe("readonly type: AppErrorType;");
    expect(appError?.members[1]?.signature).toBeUndefined();
    expect(model.entrypoints[0]?.symbols[0]?.signature).toBeUndefined();
  });
});

describe("buildSignatureResolver", () => {
  const files = new Map([
    [
      "dist/index.d.ts",
      `export { createAppError } from "./create-app-error.js";
       export * from "./result.js";
       export { Registry as ErrorRegistry } from "./registry.js";`,
    ],
    ["dist/create-app-error.d.ts", `export declare function createAppError(message: string): AppError;`],
    ["dist/result.d.ts", `export type Result<T> = Ok<T> | Err;`],
    ["dist/registry.d.ts", `export declare class Registry<T> {\n  add(value: T): void;\n}`],
  ]);
  const resolver = buildSignatureResolver(files);

  it("follows a named re-export to the declaring file", () => {
    expect(resolver.lookup("dist/index.d.ts", "createAppError")?.text).toBe(
      "export declare function createAppError(message: string): AppError;",
    );
  });

  it("follows export * to the declaring file", () => {
    expect(resolver.lookup("dist/index.d.ts", "Result")?.text).toBe("export type Result<T> = Ok<T> | Err;");
  });

  it("shows a renamed re-export under its public name", () => {
    const registry = resolver.lookup("dist/index.d.ts", "ErrorRegistry");
    expect(registry?.text).toBe("export declare class ErrorRegistry<T>");
    expect([...(registry?.members ?? [])]).toEqual([["add", "add(value: T): void;"]]);
  });

  it("returns undefined for a name no file declares", () => {
    expect(resolver.lookup("dist/index.d.ts", "missing")).toBeUndefined();
  });
});

describe("buildSignatureResolver local and imported aliases", () => {
  it("resolves a local `export { local as public }` clause with no `from`", () => {
    const resolver = buildSignatureResolver(
      new Map([["m.d.ts", `declare function Internal(): void;\nexport { Internal as Public };`]]),
    );
    expect(resolver.lookup("m.d.ts", "Public")?.text).toBe("declare function Public(): void;");
  });

  it("resolves an imported binding that is then re-exported by name", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `import { Thing as Renamed } from "./thing.js";\nexport { Renamed };`],
        ["thing.d.ts", `export declare const Thing: number;`],
      ]),
    );
    expect(resolver.lookup("index.d.ts", "Renamed")?.text).toBe("export declare const Renamed: number;");
  });

  it("reaches one file through both a star edge and a renamed edge", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `export * from "./m.js";\nexport { Internal as Public } from "./m.js";`],
        ["m.d.ts", `export declare function Internal(): void;`],
      ]),
    );
    expect(resolver.lookup("index.d.ts", "Public")?.text).toBe("export declare function Public(): void;");
  });

  it("follows a `.d.mts` re-export target", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.mts", `export { helper } from "./helper.mjs";`],
        ["helper.d.mts", `export declare function helper(): void;`],
      ]),
    );
    expect(resolver.lookup("index.d.mts", "helper")?.text).toBe("export declare function helper(): void;");
  });
});

describe("buildSignatureResolver renamed exports", () => {
  it("shows the public name for a renamed function re-export", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `export { greet as hello } from "./greet.js";`],
        ["greet.d.ts", `export declare function greet(name: string): string;`],
      ]),
    );
    expect(resolver.lookup("index.d.ts", "hello")?.text).toBe("export declare function hello(name: string): string;");
  });

  it("shows the public name for a renamed function imported and re-exported locally", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `import { greet } from "./greet.js";\nexport { greet as hello };`],
        ["greet.d.ts", `export declare function greet(name: string): string;`],
      ]),
    );
    expect(resolver.lookup("index.d.ts", "hello")?.text).toBe("export declare function hello(name: string): string;");
  });

  it("shows the public name for a renamed constant, class, interface, and type alias", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `export { LIMIT as MAX, Impl as Api, Shape as Form, Pair as Couple } from "./decls.js";`],
        [
          "decls.d.ts",
          [
            "export declare const LIMIT: number;",
            "export declare class Impl<T> extends Base {",
            "  run(value: T): void;",
            "}",
            "export interface Shape {",
            "  width: number;",
            "}",
            "export type Pair = [number, number];",
          ].join("\n"),
        ],
      ]),
    );
    expect(resolver.lookup("index.d.ts", "MAX")?.text).toBe("export declare const MAX: number;");
    expect(resolver.lookup("index.d.ts", "Api")?.text).toBe("export declare class Api<T> extends Base");
    expect(resolver.lookup("index.d.ts", "Form")?.text).toBe("export interface Form");
    expect(resolver.lookup("index.d.ts", "Couple")?.text).toBe("export type Couple = [number, number];");
  });

  it("renames only the declared name, not a parameter that shares the original name", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `export { greet as hello } from "./greet.js";`],
        ["greet.d.ts", `export declare function greet(greet: string): string;`],
      ]),
    );
    expect(resolver.lookup("index.d.ts", "hello")?.text).toBe("export declare function hello(greet: string): string;");
  });

  it("renames a recursive type alias's self-references along with its declared name", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `export { Tree as Node } from "./tree.js";`],
        ["tree.d.ts", `export type Tree = { children: Tree[] };`],
      ]),
    );
    expect(resolver.lookup("index.d.ts", "Node")?.text).toBe("export type Node = { children: Node[] };");
  });

  it("leaves a self-reference alone where a type parameter shadows the name", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `export { Tree as Node } from "./tree.js";`],
        ["tree.d.ts", `export type Tree = <Tree>(value: Tree) => Tree;`],
      ]),
    );
    expect(resolver.lookup("index.d.ts", "Node")?.text).toBe("export type Node = <Tree>(value: Tree) => Tree;");
  });

  it("renames a class member's self-reference along with the class name", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `export { Registry as Store } from "./registry.js";`],
        ["registry.d.ts", `export declare class Registry {\n  clone(): Registry;\n}`],
      ]),
    );
    expect([...(resolver.lookup("index.d.ts", "Store")?.members ?? [])]).toEqual([["clone", "clone(): Store;"]]);
  });
});

describe("resolveDtsCandidates", () => {
  it("resolves a TypeScript extension to the same candidates as its JavaScript extension", () => {
    expect(resolveDtsCandidates("dist/index.d.ts", "./more.ts")).toEqual(
      resolveDtsCandidates("dist/index.d.ts", "./more.js"),
    );
    expect(resolveDtsCandidates("dist/index.d.ts", "./more.mts")).toEqual(
      resolveDtsCandidates("dist/index.d.ts", "./more.mjs"),
    );
    expect(resolveDtsCandidates("dist/index.d.ts", "./more.cts")).toEqual(
      resolveDtsCandidates("dist/index.d.ts", "./more.cjs"),
    );
  });

  it("keeps a .cts specifier to the CommonJS declaration only", () => {
    expect(resolveDtsCandidates("dist/index.d.ts", "./more.cts")).toEqual(["dist/more.d.cts"]);
  });

  it("keeps the candidate order for an extensionless or .js specifier", () => {
    expect(resolveDtsCandidates("dist/index.d.ts", "./more.js")).toEqual([
      "dist/more.d.ts",
      "dist/more.d.mts",
      "dist/more.d.cts",
      "dist/more/index.d.ts",
      "dist/more/index.d.mts",
      "dist/more/index.d.cts",
    ]);
  });
});

describe("buildSignatureResolver with a TypeScript extension specifier", () => {
  it("follows `export * from` a `.ts` specifier to the declaring file", () => {
    const resolver = buildSignatureResolver(
      new Map([
        ["index.d.ts", `export * from "./more.ts";`],
        ["more.d.ts", `export declare function helper(): void;`],
      ]),
    );
    expect(resolver.lookup("index.d.ts", "helper")?.text).toBe("export declare function helper(): void;");
  });
});
