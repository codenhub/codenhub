import { describe, expect, it } from "vitest";

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
