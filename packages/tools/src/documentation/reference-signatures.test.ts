import { describe, expect, it } from "vitest";

import type { ReferenceModel } from "./reference-model.ts";
import { attachSignatures, buildSignatureResolver, extractSignatures } from "./reference-signatures.ts";

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
      unsupported: [],
      entrypoints: [
        {
          subpath: ".",
          module: "index",
          symbols: [
            {
              name: "AppError",
              kind: "interface",
              typeParameters: [],
              parameters: [],
              throws: [],
              examples: [],
              see: [],
              members: [
                {
                  name: "type",
                  kind: "property",
                  isOptional: false,
                  isReadonly: true,
                  isStatic: false,
                  parameters: [],
                },
                {
                  name: "ghost",
                  kind: "property",
                  isOptional: false,
                  isReadonly: false,
                  isStatic: false,
                  parameters: [],
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

  it("maps a renamed re-export back to its original name in the target", () => {
    const registry = resolver.lookup("dist/index.d.ts", "ErrorRegistry");
    expect(registry?.text).toBe("export declare class Registry<T>");
    expect([...(registry?.members ?? [])]).toEqual([["add", "add(value: T): void;"]]);
  });

  it("returns undefined for a name no file declares", () => {
    expect(resolver.lookup("dist/index.d.ts", "missing")).toBeUndefined();
  });
});
